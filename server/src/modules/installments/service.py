from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from dateutil.relativedelta import relativedelta
import calendar

from sqlalchemy.orm import Session

from src.common.enums import PlanStatus, TransactionType, TransactionDirection, SourceType
from src.core import generate_uuid, NotFoundException

from .models import InstallmentPlan, InstallmentSchedule
from .schemas import CreateInstallmentRequest, InstallmentPlanUpdate
from src.modules.accounts.service import get_account, update_account_debt, update_account_frozen
from src.modules.transactions.service import create_transaction
from src.modules.transactions.schemas import TransactionCreate
from src.modules.transactions.models import Transaction


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


def create_installment_with_transaction(db: Session, book_id: str, data: CreateInstallmentRequest) -> tuple:
    """Create installment plan with the initial purchase transaction - 包含冻结额度逻辑"""

    # Validate account is credit type
    account = get_account(db, data.account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    if account.account_type not in ["credit_card", "credit_line"]:
        raise ValueError("Account must be credit card or credit line type")

    # 🛡️ L: 计算冻结金额 = 每期金额 * 剩余期数
    # 首期已支付（或者计入当前待还），后续期数需要冻结
    remaining_periods = data.total_periods - 1  # 除去第一期
    
    # 🛡️ L: 计算每期本金（如果未提供）
    if data.principal_per_period is not None:
        principal_per_period = data.principal_per_period
    else:
        # 如果未提供，则从 total_amount / total_periods 计算
        principal_per_period = Decimal(str(data.total_amount)) / Decimal(str(data.total_periods))
    
    # 🛡️ L: 计算冻结金额 = 每期金额 * 剩余期数
    if data.installment_amount and data.installment_amount > 0:
        frozen_amount = Decimal(str(data.installment_amount)) * remaining_periods if remaining_periods > 0 else Decimal("0")
    else:
        # 如果未提供每期金额，则使用计算出的每期本金 + 手续费
        installment_amount = principal_per_period + data.fee_per_period
        frozen_amount = installment_amount * remaining_periods if remaining_periods > 0 else Decimal("0")

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
            installment_amount=data.installment_amount,
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
            first_billing_date=data.start_date + relativedelta(months=1),  # 🛡️ L: 首次账单日
            first_repayment_date=data.start_date + relativedelta(months=1),
            next_execution_date=data.start_date + relativedelta(months=1),  # 🛡️ L: 下次执行日期
            repayment_day=data.repayment_day,
            status=PlanStatus.ACTIVE.value,
            note=data.note,
        )
        db.add(plan)

        # 2. 生成还款计划
        schedules = []
        current_date = data.start_date + relativedelta(months=1)
        for period in range(1, data.total_periods + 1):
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

        # 3. 创建初始消费交易（分期本金+手续费，计入支出）
        total_with_fee = data.total_amount + (data.fee_per_period * data.total_periods)
        txn_data = TransactionCreate(
            occurred_at=data.occurred_at,
            transaction_type=TransactionType.INSTALLMENT_PURCHASE,
            direction=TransactionDirection.OUT,
            amount=total_with_fee,
            account_id=data.account_id,
            category_id=data.category_id,
            merchant=data.merchant,
            note=data.note or f"分期消费: {plan.plan_name}",
            business_key=f"installment:{plan.id}",
            source_type=SourceType.MANUAL,
            include_expense_override=True,
            include_cashflow_override=False,
        )
        transaction = create_transaction(db, book_id, txn_data)

        # 4. 增加账户欠款
        update_account_debt(db, data.account_id, total_with_fee, is_increase=True)

        # 5. 🛡️ L: 冻结后续期数的额度
        if frozen_amount > 0:
            update_account_frozen(db, data.account_id, frozen_amount, is_increase=True)

        # 6. 更新计划的 transaction_id
        plan.transaction_id = transaction.id

        db.commit()
        db.refresh(plan)
        return plan, transaction
        
    except Exception as e:
        db.rollback()
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
    
    try:
        # 1. 创建单期交易记录
        # 格式: "[当前期数]/[总期数] 期"
        note = f"[{next_period}/{plan.total_periods}] 期 - {plan.plan_name}"
        
        # 🛡️ L: 使用 round 避免浮点精度问题
        amount = round(float(schedule.total_due), 2)
        
        txn_data = TransactionCreate(
            occurred_at=datetime.utcnow(),
            transaction_type=TransactionType.INSTALLMENT_REPAYMENT,
            direction=TransactionDirection.IN,  # 还款入账
            amount=Decimal(str(amount)),
            account_id=plan.account_id,
            category_id=plan.category_id,
            merchant=plan.plan_name,
            note=note,
            business_key=f"installment:{plan.id}:p{next_period}",
            source_type=SourceType.SYSTEM,  # 🛡️ L: 系统自动生成
            include_expense_override=True,  # 计入支出
            include_cashflow_override=False,
        )
        transaction = create_transaction(db, book_id, txn_data)

        # 2. 更新账户欠款（减少）- 使用同样四舍五入的金额
        update_account_debt(db, plan.account_id, Decimal(str(amount)), is_increase=False)

        # 3. 🛡️ L: 减少冻结金额
        if plan.executed_periods < plan.total_periods:
            # 还清一期，冻结金额减少一期
            update_account_frozen(
                db, 
                plan.account_id, 
                Decimal(str(amount)), 
                is_increase=False  # 减少冻结
            )

        # 4. 更新计划已执行期数
        plan.executed_periods = next_period
        plan.current_period = next_period

        # 5. 🛡️ L: 推算下一个执行日期
        if next_period < plan.total_periods:
            current_exec_date = plan.next_execution_date or datetime.now().date()
            plan.next_execution_date = _calculate_next_execution_date(
                current_exec_date, 
                plan.repayment_day or 15  # 默认15日
            )

        # 6. 检查是否完成
        if plan.executed_periods >= plan.total_periods:
            plan.status = PlanStatus.COMPLETED.value

        db.commit()
        db.refresh(plan)
        
        return {
            "plan": plan,
            "schedule": schedule,
            "transaction": transaction,
            "next_execution_date": plan.next_execution_date
        }
        
    except Exception as e:
        db.rollback()
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
