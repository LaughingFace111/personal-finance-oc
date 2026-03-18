from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from dateutil.relativedelta import relativedelta

from sqlalchemy.orm import Session

from src.common.enums import PlanStatus, TransactionType, TransactionDirection, SourceType
from src.core import generate_uuid, NotFoundException

from .models import InstallmentPlan, InstallmentSchedule
from .schemas import CreateInstallmentRequest, InstallmentPlanUpdate
from src.modules.accounts.service import get_account, update_account_debt
from src.modules.transactions.service import create_transaction
from src.modules.transactions.schemas import TransactionCreate
from src.modules.transactions.models import Transaction


def _safe_date(year: int, month: int, day: int) -> date:
    """Safe date creation handling month boundaries"""
    from calendar import monthrange
    _, last_day = monthrange(year, month)
    day = min(day, last_day)
    return date(year, month, day)


def create_installment_with_transaction(db: Session, book_id: str, data: CreateInstallmentRequest) -> tuple:
    """Create installment plan with the initial purchase transaction"""

    # Validate account is credit type
    account = get_account(db, data.account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    if account.account_type not in ["credit_card", "credit_line"]:
        raise ValueError("Account must be credit card or credit line type")

    # Calculate total fee
    total_fee = data.fee_per_period * data.total_periods
    total_amount_with_fee = data.total_amount + total_fee

    # Create installment plan
    plan = InstallmentPlan(
        id=generate_uuid(),
        book_id=book_id,
        account_id=data.account_id,
        plan_name=data.plan_name or data.merchant,
        total_amount=data.total_amount,
        total_periods=data.total_periods,
        current_period=1,
        principal_per_period=data.total_amount / data.total_periods,
        fee_per_period=data.fee_per_period,
        total_fee=total_fee,
        start_date=data.start_date,
        first_repayment_date=data.start_date + relativedelta(months=1),
        status=PlanStatus.ACTIVE.value,
    )
    db.add(plan)

    # Generate schedules
    schedules = []
    current_date = data.start_date + relativedelta(months=1)
    for period in range(1, data.total_periods + 1):
        # Calculate due date
        if data.repayment_day:
            due_date = _safe_date(current_date.year, current_date.month, data.repayment_day)
        else:
            due_date = current_date

        schedule = InstallmentSchedule(
            id=generate_uuid(),
            installment_plan_id=plan.id,
            period_no=period,
            due_date=due_date,
            principal_amount=plan.principal_per_period,
            fee_amount=plan.fee_per_period,
            total_due=plan.principal_per_period + plan.fee_per_period,
            status="pending"
        )
        schedules.append(schedule)
        current_date = current_date + relativedelta(months=1)

    db.add_all(schedules)

    # Create initial purchase transaction (计入支出)
    txn_data = TransactionCreate(
        occurred_at=data.occurred_at,
        transaction_type=TransactionType.INSTALLMENT_PURCHASE,
        direction=TransactionDirection.OUT,
        amount=total_amount_with_fee,  # 本金 + 手续费
        account_id=data.account_id,
        category_id=data.category_id,
        merchant=data.merchant,
        note=data.note,
        business_key=f"installment:{plan.id}",
        source_type=SourceType.MANUAL,
    )

    # Calculate include flags
    txn_data.include_in_expense = True
    txn_data.include_in_cashflow = False  # 分期消费无现金流

    transaction = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=txn_data.occurred_at,
        transaction_type=TransactionType.INSTALLMENT_PURCHASE.value,
        direction=TransactionDirection.OUT.value,
        amount=total_amount_with_fee,
        currency="CNY",
        account_id=data.account_id,
        category_id=data.category_id,
        merchant=data.merchant,
        note=data.note,
        business_key=f"installment:{plan.id}",
        source_type=SourceType.MANUAL.value,
        include_in_expense=True,
        include_in_cashflow=False,
        status="confirmed"
    )
    db.add(transaction)

    # Update account debt
    update_account_debt(db, data.account_id, total_amount_with_fee, is_increase=True)

    plan.transaction_id = transaction.id

    db.commit()
    db.refresh(plan)
    return plan, transaction


def get_installment_plans(db: Session, book_id: str, account_id: str = None, status: str = None) -> List[InstallmentPlan]:
    """Get installment plans"""
    query = db.query(InstallmentPlan).filter(InstallmentPlan.book_id == book_id)
    if account_id:
        query = query.filter(InstallmentPlan.account_id == account_id)
    if status:
        query = query.filter(InstallmentPlan.status == status)
    return query.order_by(InstallmentPlan.created_at.desc()).all()


def get_installment_plan(db: Session, plan_id: str, book_id: str) -> Optional[InstallmentPlan]:
    """Get installment plan by ID"""
    return db.query(InstallmentPlan).filter(
        InstallmentPlan.id == plan_id,
        InstallmentPlan.book_id == book_id
    ).first()


def get_installment_schedules(db: Session, plan_id: str) -> List[InstallmentSchedule]:
    """Get all schedules for an installment plan"""
    return db.query(InstallmentSchedule).filter(
        InstallmentSchedule.installment_plan_id == plan_id
    ).order_by(InstallmentSchedule.period_no).all()


def get_upcoming_installments(db: Session, book_id: str, days: int = 30) -> List[InstallmentSchedule]:
    """Get upcoming installment payments"""
    from datetime import datetime
    end_date = datetime.now().date() + timedelta(days=days)

    return db.query(InstallmentSchedule).join(InstallmentPlan).filter(
        InstallmentPlan.book_id == book_id,
        InstallmentSchedule.status == "pending",
        InstallmentSchedule.due_date <= end_date
    ).order_by(InstallmentSchedule.due_date).all()


def update_installment_plan(db: Session, plan_id: str, book_id: str, data: InstallmentPlanUpdate) -> InstallmentPlan:
    """Update installment plan"""
    plan = get_installment_plan(db, plan_id, book_id)
    if not plan:
        raise NotFoundException("Installment plan not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, key, value)

    db.commit()
    db.refresh(plan)
    return plan


def settle_installment(db: Session, plan_id: str, book_id: str, account_id: str, occurred_at: datetime) -> List:
    """Settle a single installment period"""
    plan = get_installment_plan(db, plan_id, book_id)
    if not plan:
        raise NotFoundException("Installment plan not found")

    # Get next pending schedule
    schedule = db.query(InstallmentSchedule).filter(
        InstallmentSchedule.installment_plan_id == plan_id,
        InstallmentSchedule.status == "pending"
    ).order_by(InstallmentSchedule.period_no).first()

    if not schedule:
        raise ValueError("No pending installment to settle")

    # Create repayment transaction
    total_repayment = schedule.principal_amount + schedule.fee_amount
    txn_data = TransactionCreate(
        occurred_at=occurred_at,
        transaction_type=TransactionType.INSTALLMENT_REPAYMENT,
        direction=TransactionDirection.INTERNAL,
        amount=total_repayment,
        account_id=account_id,
        counterparty_account_id=plan.account_id,
        business_key=f"installment:{plan.id}:p{schedule.period_no}",
        source_type=SourceType.MANUAL,
    )
    transaction = create_transaction(db, book_id, txn_data)

    # Update schedule
    schedule.paid_amount = total_repayment
    schedule.paid_at = occurred_at
    schedule.payment_transaction_id = transaction.id
    schedule.status = "paid"

    # Update plan current period
    plan.current_period = schedule.period_no

    # Check if completed
    if plan.current_period >= plan.total_periods:
        plan.status = PlanStatus.COMPLETED.value

    db.commit()
    db.refresh(schedule)
    return schedule, transaction
