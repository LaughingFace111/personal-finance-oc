from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from dateutil.relativedelta import relativedelta

from sqlalchemy.orm import Session

from src.common.enums import PlanStatus, TransactionType, TransactionDirection, SourceType
from src.core import generate_uuid, NotFoundException

from .models import LoanPlan, LoanSchedule
from .schemas import CreateLoanRequest, LoanPlanUpdate, RepayLoanRequest
from src.modules.accounts.service import get_account, update_account_balance
from src.modules.transactions.models import Transaction


def _safe_date(year: int, month: int, day: int) -> date:
    """Safe date creation handling month boundaries"""
    from calendar import monthrange
    _, last_day = monthrange(year, month)
    day = min(day, last_day)
    return date(year, month, day)


def _normalize_annual_interest_rate(rate: Decimal) -> Decimal:
    """Accept either decimal rate (0.12) or percentage (12)."""
    normalized_rate = Decimal(str(rate))
    if normalized_rate > Decimal("1"):
        normalized_rate = normalized_rate / Decimal("100")
    return normalized_rate


def _calculate_monthly_payment(principal: Decimal, annual_rate: Decimal, periods: int, method: str) -> Decimal:
    """Calculate monthly payment"""
    if method == "equal_principal":
        # 等额本金
        monthly_principal = principal / periods
        # 利息逐月递减，简单估算
        monthly_interest = principal * (annual_rate / 12) / 2
        return monthly_principal + monthly_interest
    else:
        # 等额本息 (简化计算)
        monthly_rate = annual_rate / 12
        if monthly_rate == 0:
            return principal / periods
        # 月供 = 本金 * 月利率 * (1+月利率)^期数 / ((1+月利率)^期数 - 1)
        factor = (1 + monthly_rate) ** periods
        return principal * monthly_rate * factor / (factor - 1)


def create_loan_with_account(db: Session, book_id: str, data: CreateLoanRequest) -> tuple:
    """Create loan plan with account"""
    annual_interest_rate = _normalize_annual_interest_rate(data.annual_interest_rate)

    # Create loan account
    from src.modules.accounts.schemas import AccountCreate
    from src.modules.accounts.models import Account as AccountModel
    from src.common.enums import AccountType

    account = AccountModel(
        id=generate_uuid(),
        book_id=book_id,
        name=data.account_name,
        account_type=AccountType.LOAN.value,
        institution_name=data.institution_name,
        opening_balance=data.principal_total,
        current_balance=Decimal("0"),  # 贷款账户余额为0
        debt_amount=data.principal_total,  # 负债 = 贷款本金
    )
    db.add(account)

    # Calculate monthly payment
    monthly_payment = _calculate_monthly_payment(
        data.principal_total, 
        annual_interest_rate,
        data.total_periods,
        data.repayment_method
    )

    # Create loan plan
    loan_plan = LoanPlan(
        id=generate_uuid(),
        account_id=account.id,
        loan_name=data.loan_name or data.account_name,
        principal_total=data.principal_total,
        principal_remaining=data.principal_total,
        annual_interest_rate=annual_interest_rate,
        repayment_method=data.repayment_method,
        total_periods=data.total_periods,
        current_period=0,
        monthly_payment_estimated=monthly_payment,
        first_due_date=data.first_due_date,
        repayment_day=data.repayment_day,
        status=PlanStatus.ACTIVE.value,
    )
    db.add(loan_plan)

    # Generate schedules
    schedules = []
    current_date = data.first_due_date
    remaining_principal = data.principal_total
    for period in range(1, data.total_periods + 1):
        # Calculate interest for this period
        interest = remaining_principal * (annual_interest_rate / 12)

        # Calculate principal
        if data.repayment_method == "equal_principal":
            principal = remaining_principal if period == data.total_periods else data.principal_total / data.total_periods
        else:
            # 等额本息，本金逐月递增
            principal = remaining_principal if period == data.total_periods else monthly_payment - interest

        if principal > remaining_principal:
            principal = remaining_principal

        # Calculate due date
        if data.repayment_day:
            due_date = _safe_date(current_date.year, current_date.month, data.repayment_day)
        else:
            due_date = current_date

        schedule = LoanSchedule(
            id=generate_uuid(),
            loan_plan_id=loan_plan.id,
            period_no=period,
            due_date=due_date,
            principal_due=principal,
            interest_due=interest,
            total_due=principal + interest,
            status="pending"
        )
        schedules.append(schedule)
        remaining_principal -= principal
        current_date = current_date + relativedelta(months=1)

    db.add_all(schedules)

    db.commit()
    db.refresh(loan_plan)
    db.refresh(account)
    return loan_plan, account


def get_loan_plans(db: Session, book_id: str, account_id: str = None, status: str = None) -> List[LoanPlan]:
    """Get loan plans"""
    from src.modules.accounts.models import Account
    query = db.query(LoanPlan).join(Account).filter(Account.book_id == book_id)
    if account_id:
        query = query.filter(LoanPlan.account_id == account_id)
    if status:
        query = query.filter(LoanPlan.status == status)
    return query.order_by(LoanPlan.created_at.desc()).all()


def get_loan_plan(db: Session, plan_id: str, book_id: str) -> Optional[LoanPlan]:
    """Get loan plan by ID"""
    from src.modules.accounts.models import Account
    return db.query(LoanPlan).join(Account).filter(
        LoanPlan.id == plan_id,
        Account.book_id == book_id
    ).first()


def get_loan_schedules(db: Session, plan_id: str) -> List[LoanSchedule]:
    """Get all schedules for a loan plan"""
    return db.query(LoanSchedule).filter(
        LoanSchedule.loan_plan_id == plan_id
    ).order_by(LoanSchedule.period_no).all()


def get_upcoming_loans(db: Session, book_id: str, days: int = 30) -> List[LoanSchedule]:
    """Get upcoming loan payments"""
    from datetime import datetime
    from src.modules.accounts.models import Account
    end_date = datetime.now().date() + timedelta(days=days)

    return db.query(LoanSchedule).join(LoanPlan).join(Account).filter(
        Account.book_id == book_id,
        LoanSchedule.status == "pending",
        LoanSchedule.due_date <= end_date
    ).order_by(LoanSchedule.due_date).all()


def repay_loan(db: Session, plan_id: str, book_id: str, data: RepayLoanRequest) -> List:
    """Repay loan - creates two transactions: principal + interest"""

    loan_plan = get_loan_plan(db, plan_id, book_id)
    if not loan_plan:
        raise NotFoundException("Loan plan not found")

    # Get next pending schedule or specific period
    if data.period_no:
        schedule = db.query(LoanSchedule).filter(
            LoanSchedule.loan_plan_id == plan_id,
            LoanSchedule.period_no == data.period_no
        ).first()
    else:
        schedule = db.query(LoanSchedule).filter(
            LoanSchedule.loan_plan_id == plan_id,
            LoanSchedule.status == "pending"
        ).order_by(LoanSchedule.period_no).first()

    if not schedule:
        raise ValueError("No pending loan payment to settle")

    # Validate payment amount
    if data.amount < schedule.total_due:
        raise ValueError(f"Payment amount {data.amount} is less than due {schedule.total_due}")

    # 1. Create principal repayment transaction (不计入支出，减少负债)
    principal_txn = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=data.occurred_at,
        transaction_type=TransactionType.REPAYMENT_LOAN.value,
        direction=TransactionDirection.INTERNAL.value,
        amount=schedule.principal_due,
        currency="CNY",
        account_id=data.from_account_id,
        counterparty_account_id=loan_plan.account_id,
        business_key=f"loan:{loan_plan.id}:p{schedule.period_no}",
        source_type=SourceType.MANUAL.value,
        include_in_expense=False,
        include_in_cashflow=False,
        status="confirmed"
    )

    # 2. Create interest payment transaction (计入支出)
    interest_txn = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=data.occurred_at,
        transaction_type=TransactionType.FEE.value,
        direction=TransactionDirection.OUT.value,
        amount=schedule.interest_due,
        currency="CNY",
        account_id=data.from_account_id,
        # No counterparty for interest
        business_key=f"loan:{loan_plan.id}:interest:{schedule.period_no}",
        source_type=SourceType.MANUAL.value,
        include_in_expense=True,
        include_in_cashflow=True,
        status="confirmed"
    )

    # Apply account effects
    from src.modules.transactions.service import _apply_transaction_effects
    _apply_transaction_effects(db, principal_txn)
    _apply_transaction_effects(db, interest_txn)

    db.add(principal_txn)
    db.add(interest_txn)

    # Update schedule
    schedule.paid_amount = data.amount
    schedule.paid_at = data.occurred_at
    schedule.payment_transaction_id = principal_txn.id
    schedule.interest_transaction_id = interest_txn.id
    schedule.status = "paid"

    # Update loan plan
    loan_plan.principal_remaining -= schedule.principal_due
    loan_plan.current_period = schedule.period_no
    if loan_plan.current_period >= loan_plan.total_periods:
        loan_plan.status = PlanStatus.COMPLETED.value

    db.commit()
    db.refresh(schedule)
    return [schedule, principal_txn, interest_txn]
