from datetime import date, datetime, timedelta
from decimal import Decimal
import json
from typing import List, Optional
from dateutil.relativedelta import relativedelta
import calendar

from sqlalchemy.orm import Session

from src.common.enums import PlanStatus, TransactionType, TransactionDirection, SourceType
from src.core import generate_uuid, NotFoundException

from .models import InstallmentPlan, InstallmentSchedule
from .schemas import CreateInstallmentRequest, InstallmentPlanUpdate
from src.modules.transactions.service import create_transaction
from src.modules.transactions.schemas import TransactionCreate
from src.core.cache import clear_overview_cache  # 🛡️ L: 缓存失效
from src.modules.transactions.models import Transaction


def _write_installment_balance_snapshot(db: Session, account, plan, executed_period: int) -> None:
    """🛡️ L: 分期执行后同步写入余额快照"""
    from src.modules.account_balance_snapshots import AccountBalanceSnapshot
    from src.modules.books.models import Book
    from datetime import date as date_type

    book = db.query(Book).filter(Book.id == plan.book_id).with_for_update().first()
    if not book:
        return

    snapshot_date = date_type.today()
    balance_value = account.debt_amount  # 信用账户快照用负债额

    existing = db.query(AccountBalanceSnapshot).filter(
        AccountBalanceSnapshot.account_id == account.id,
        AccountBalanceSnapshot.snapshot_date == snapshot_date
    ).with_for_update().first()

    if existing:
        existing.end_of_day_balance = balance_value
        existing.updated_at = datetime.utcnow()
    else:
        snap = AccountBalanceSnapshot(
            id=generate_uuid(),
            user_id=book.user_id,
            account_id=account.id,
            snapshot_date=snapshot_date,
            end_of_day_balance=balance_value,
        )
        db.add(snap)



def _safe_date(year: int, month: int, day: int) -> date:
    """Safe date creation handling month boundaries"""
    from calendar import monthrange
    _, last_day = monthrange(year, month)
    day = min(day, last_day)
    return date(year, month, day)


def _calculate_next_execution_date(current_date: date, repayment_day: int) -> date:
    """
    🛡️ L: 推算下次执行日期（跨月防错）
    
    逻辑：
    1. 将当前日期 + 1个月
    2. 如果原日期是月末（如31日），新日期也调整为月末
    3. 确保新日期的日期部分不超过该月的最大天数
    
    示例：
    - 1月31日 -> 2月28日 (2月没有31日)
    - 1月30日 -> 2月28日 (2月没有30日)
    - 1月15日 -> 2月15日 (正常跨月)
    """
    # 跨月
    next_month = current_date + relativedelta(months=1)
    
    # 检查原日期是否为月末（取原日期的月份最后一天）
    original_last_day = calendar.monthrange(current_date.year, current_date.month)[1]
    is_original_eom = current_date.day >= original_last_day
    
    if is_original_eom:
        # 原日期是月末，新日期也设为月末
        new_last_day = calendar.monthrange(next_month.year, next_month.month)[1]
        return date(next_month.year, next_month.month, new_last_day)
    else:
        # 原日期非月末，保持日期部分
        new_last_day = calendar.monthrange(next_month.year, next_month.month)[1]
        target_day = min(repayment_day, new_last_day)
        return date(next_month.year, next_month.month, target_day)


def generate_installment_schedules(plan: InstallmentPlan, data: CreateInstallmentRequest) -> List[InstallmentSchedule]:
    """Generate schedules using the user-provided first billing/execution date as period 1."""
    schedules = []
    first_schedule_date = data.first_billing_date or data.first_execution_date
    if first_schedule_date is None:
        first_schedule_date = data.start_date + relativedelta(months=1)

    from decimal import ROUND_DOWN
    total = Decimal(str(data.total_amount))
    periods = Decimal(str(data.total_periods))
    base_principal = (total / periods).quantize(Decimal("0.01"), rounding=ROUND_DOWN)

    for period in range(1, data.total_periods + 1):
        due_date = first_schedule_date + relativedelta(months=period - 1)

        # 尾差兜底：最后一期用减法确保总额精确等于 total_amount
        if period < data.total_periods:
            period_principal = base_principal
        else:
            period_principal = total - (base_principal * (data.total_periods - 1))

        schedule = InstallmentSchedule(
            id=generate_uuid(),
            installment_plan_id=plan.id,
            period_no=period,
            due_date=due_date,
            principal_amount=period_principal,
            fee_amount=plan.fee_per_period,
            total_due=period_principal + plan.fee_per_period,
            status="pending"
        )
        schedules.append(schedule)

    return schedules


def create_installment_with_transaction(db: Session, book_id: str, data: CreateInstallmentRequest) -> tuple:
    """Create installment plan and freeze credit without generating any transaction."""

    # 🛡️ L: 获取账户行级锁，防止并发创建分期击穿冻结逻辑
    from src.modules.accounts.models import Account
    account = db.query(Account).filter(
        Account.id == data.account_id
    ).with_for_update().first()
    if not account:
        raise NotFoundException("Account not found")

    if account.account_type not in ["credit_card", "credit_line"]:
        raise ValueError("Account must be credit card or credit line type")

    # 🛡️ L: 计算每期本金（如果未提供）
    if data.principal_per_period is not None:
        principal_per_period = data.principal_per_period
    else:
        # 如果未提供，则从 total_amount / total_periods 计算
        principal_per_period = Decimal(str(data.total_amount)) / Decimal(str(data.total_periods))

    # 🛡️ L: 冻结额度按总本金冻结；每期冻结额用于执行期释放
    installment_amount = (
        Decimal(str(data.installment_amount))
        if data.installment_amount and data.installment_amount > 0
        else principal_per_period + data.fee_per_period
    )
    serialized_tags = json.dumps(data.tags, ensure_ascii=False) if data.tags else None
    frozen_amount = Decimal(str(data.total_amount))
    first_execution_date = data.first_execution_date or data.start_date + relativedelta(months=1)
    first_billing_date = data.first_billing_date or data.start_date + relativedelta(months=1)

    # 使用事务保证原子性
    try:
        # 1. 创建分期计划
        plan = InstallmentPlan(
            id=generate_uuid(),
            book_id=book_id,
            account_id=data.account_id,
            transaction_id=None,  # 稍后填充
            category_id=data.category_id,
            plan_name=data.plan_name or data.merchant,
            total_amount=data.total_amount,
            installment_amount=installment_amount,
            total_periods=data.total_periods,
            executed_periods=0,  # 🛡️ L: 已执行期数
            current_period=0,  # 🛡️ L: 当前期数（0表示未开始执行）
            principal_per_period=principal_per_period,
            fee_per_period=data.fee_per_period,
            handling_fee=data.fee_per_period * data.total_periods,  # 🛡️ L: 总手续费
            total_fee=data.fee_per_period * data.total_periods,
            interest=Decimal("0"),  # 🛡️ L: 利息（可扩展）
            start_date=data.start_date,
            application_date=datetime.utcnow(),  # 🛡️ L: 申请日期
            first_execution_date=first_execution_date,
            first_billing_date=first_billing_date,
            first_repayment_date=data.start_date + relativedelta(months=1),
            next_execution_date=first_execution_date,  # 🛡️ L: 下次执行日期
            repayment_day=data.repayment_day,
            status=PlanStatus.ACTIVE.value,
            tags=serialized_tags,
            note=data.note,
        )
        db.add(plan)

        # 2. 生成还款计划：第1期严格使用用户配置的首次日期
        schedules = generate_installment_schedules(plan, data)
        db.add_all(schedules)

        # 3. 创建分期时只冻结额度，不生成交易，也不增加 debt_amount
        if frozen_amount > 0:
            account.frozen_amount = (account.frozen_amount or Decimal("0")) + frozen_amount

        db.commit()
        db.refresh(plan)
        clear_overview_cache()  # 🛡️ L: create_installment_with_transaction
        return plan, None
        
    except Exception as e:
        db.rollback()
        clear_overview_cache()  # 🛡️ L: 异常时也清除
        raise e


def execute_installment_period(db: Session, plan_id: str, book_id: str) -> dict:
    """
    🛡️ L: 执行单期分期扣款
    
    步骤：
    1. 校验剩余期数
    2. 创建单期 Transaction 交易记录
    3. 减少对应账户的 frozen_amount
    4. 推算下一个执行日期（处理跨月问题）
    5. 更新计划状态
    """
    plan = get_installment_plan(db, plan_id, book_id)
    if not plan:
        raise NotFoundException("分期计划不存在")
    
    if plan.status != PlanStatus.ACTIVE.value:
        raise ValueError(f"分期计划状态异常: {plan.status}")
    
    # 计算下一期
    next_period = plan.executed_periods + 1
    if next_period > plan.total_periods:
        raise ValueError("分期已全部执行完成")
    
    # 获取下一期的还款计划
    schedule = db.query(InstallmentSchedule).filter(
        InstallmentSchedule.installment_plan_id == plan_id,
        InstallmentSchedule.period_no == next_period
    ).first()
    
    if not schedule:
        raise ValueError(f"第 {next_period} 期还款计划不存在")
    
    # 🛡️ L: 获取账户行级锁，防止并发执行同一期
    from src.modules.accounts.models import Account
    account = db.query(Account).filter(
        Account.id == plan.account_id
    ).with_for_update().first()
    today = date.today()

    if schedule.due_date and schedule.due_date > today:
        raise ValueError(f"分期未到执行日: {schedule.due_date.isoformat()}")

    try:
        # 1. 为本期分期生成一笔支出账单，发生日期以计划日为准
        note = f"[{next_period}/{plan.total_periods}] 期 - {plan.plan_name}"
        amount = Decimal(str(schedule.total_due))
        occurred_at = datetime.combine(schedule.due_date, datetime.min.time())

        txn_data = TransactionCreate(
            occurred_at=occurred_at,
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=amount,
            account_id=plan.account_id,
            category_id=plan.category_id,
            merchant=plan.plan_name,
            note=note,
            business_key=f"installment:{plan.id}:p{next_period}",
            source_type=SourceType.SYSTEM,
            include_expense_override=True,
            include_cashflow_override=False,
        )
        transaction = create_transaction(db, book_id, txn_data)

        # 2. 交易创建时已完成 debt/frozen 迁移，这里只刷新账户对象
        db.refresh(account)

        # 4. 更新计划进度
        plan.executed_periods = next_period
        plan.current_period = next_period

        # 5. 🛡️ L: 推算下一个执行日期
        if next_period < plan.total_periods:
            current_exec_date = plan.next_execution_date or datetime.now().date()
            plan.next_execution_date = _calculate_next_execution_date(
                current_exec_date,
                plan.repayment_day or 15
            )

        # 6. 🛡️ L: 同步写入余额快照
        _write_installment_balance_snapshot(db, account, plan, next_period)

        # 7. 检查是否完成
        if plan.executed_periods >= plan.total_periods:
            plan.status = PlanStatus.COMPLETED.value
            # 全额解冻
            account.frozen_amount = Decimal("0")

        db.commit()
        db.refresh(plan)

        result = {
            "plan": plan,
            "schedule": schedule,
            "transaction": transaction,
            "next_execution_date": plan.next_execution_date
        }
        clear_overview_cache()  # 🛡️ L: execute_installment_period（return 之前清除）
        return result

    except Exception as e:
        db.rollback()
        clear_overview_cache()  # 🛡️ L: 异常时也清除缓存
        raise e


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
    clear_overview_cache()  # 🛡️ L: update plan
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
        transaction_type=TransactionType.REPAYMENT_CREDIT_CARD,
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
    clear_overview_cache()  # 🛡️ L: settle_installment
    return schedule, transaction


def get_installment_schedules(db: Session, plan_id: str) -> List[dict]:
    """Get all schedules for an installment plan"""
    schedules = db.query(InstallmentSchedule).filter(
        InstallmentSchedule.installment_plan_id == plan_id
    ).order_by(InstallmentSchedule.period_no).all()
    
    return [
        {
            "period_no": s.period_no,
            "due_date": s.due_date.isoformat() if s.due_date else None,
            "principal_amount": float(s.principal_amount),
            "fee_amount": float(s.fee_amount),
            "total_due": float(s.total_due),
            "status": s.status
        }
        for s in schedules
    ]
