from datetime import date, datetime, timedelta
from decimal import Decimal
import json
import logging
from typing import List, Optional
from dateutil.relativedelta import relativedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.common.enums import PlanStatus, TransactionType, TransactionDirection, SourceType
from src.core import generate_uuid, NotFoundException

from .models import InstallmentPlan, InstallmentSchedule
from .schemas import CreateInstallmentRequest, InstallmentPlanUpdate
from src.modules.transactions.service import create_transaction, delete_transaction
from src.modules.transactions.schemas import TransactionCreate
from src.modules.accounts.service import update_account_frozen as update_account_frozen_amount
from src.core.cache import clear_overview_cache  # 🛡️ L: 缓存失效
from src.modules.transactions.models import Transaction
from src.modules.tags.models import Tag

logger = logging.getLogger(__name__)


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


def compute_period_date(start_date: date, target_day: int, period_index: int) -> date:
    """Derive the period date from creation date and target billing day."""
    if target_day < 1 or target_day > 31:
        raise ValueError("target_day must be between 1 and 31")
    if period_index < 0:
        raise ValueError("period_index must be >= 0")

    first_period_month = start_date.replace(day=1)
    if start_date.day > target_day:
        first_period_month = first_period_month + relativedelta(months=1)

    period_month = first_period_month + relativedelta(months=period_index)
    return _safe_date(period_month.year, period_month.month, target_day)


def _parse_json_list(raw_value) -> List[str]:
    if raw_value in (None, "", []):
        return []
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item).strip()]
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError:
            parsed = [item.strip() for item in raw_value.split(",") if item.strip()]
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def _resolve_plan_transaction_tags(db: Session, book_id: str, raw_tags) -> Optional[str]:
    """
    Transactions store tag names as JSON.
    Installment plans may persist tag ids for edit forms, so resolve ids to names here.
    """
    values = _parse_json_list(raw_tags)
    if not values:
        return None

    tag_rows = db.query(Tag.id, Tag.name).filter(
        ((Tag.book_id == book_id) | (Tag.is_system == True)),
        Tag.id.in_(values),
    ).all()
    tag_name_by_id = {tag_id: tag_name for tag_id, tag_name in tag_rows}

    normalized_names: List[str] = []
    for value in values:
        normalized = tag_name_by_id.get(value, value)
        if normalized and normalized not in normalized_names:
            normalized_names.append(normalized)

    return json.dumps(normalized_names, ensure_ascii=False) if normalized_names else None


def _get_first_schedule_date(data: CreateInstallmentRequest) -> date:
    if data.first_billing_date:
        return data.first_billing_date
    if data.first_execution_date:
        return data.first_execution_date
    if data.repayment_day is None:
        raise ValueError("repayment_day is required for installment schedules")
    return compute_period_date(data.start_date, data.repayment_day, 0)


def _resolve_schedule_anchor_date(
    plan: InstallmentPlan,
    data: Optional[CreateInstallmentRequest] = None,
) -> date:
    if plan.first_billing_date:
        return plan.first_billing_date
    if plan.first_execution_date:
        return plan.first_execution_date
    if data is not None:
        return _get_first_schedule_date(data)
    if plan.repayment_day is None:
        raise ValueError("repayment_day is required for installment schedules")
    return compute_period_date(plan.start_date, plan.repayment_day, 0)


def _get_next_pending_schedule_date(db: Session, plan_id: str) -> Optional[date]:
    next_pending_schedule = db.query(InstallmentSchedule).filter(
        InstallmentSchedule.installment_plan_id == plan_id,
        InstallmentSchedule.status == "pending",
    ).order_by(InstallmentSchedule.period_no).first()
    return next_pending_schedule.due_date if next_pending_schedule else None


def generate_installment_schedules(plan: InstallmentPlan, data: CreateInstallmentRequest) -> List[InstallmentSchedule]:
    """Generate schedules from creation date and target billing day."""
    schedules = []
    first_schedule_date = _resolve_schedule_anchor_date(plan, data)
    target_day = first_schedule_date.day

    logger.info(
        "Generating installment schedules plan_id=%s first_schedule_date=%s first_billing_date=%s first_execution_date=%s repayment_day=%s total_periods=%s",
        plan.id,
        first_schedule_date.isoformat(),
        plan.first_billing_date.isoformat() if plan.first_billing_date else None,
        plan.first_execution_date.isoformat() if plan.first_execution_date else None,
        plan.repayment_day,
        data.total_periods,
    )

    from decimal import ROUND_DOWN
    total = Decimal(str(data.total_amount))
    periods = Decimal(str(data.total_periods))
    base_principal = (total / periods).quantize(Decimal("0.01"), rounding=ROUND_DOWN)

    for period in range(1, data.total_periods + 1):
        # 首期严格锚定用户配置的首次日期，后续期次从该日期按月顺延。
        due_date = compute_period_date(first_schedule_date, target_day, period - 1)
        logger.info(
            "Installment schedule due_date computed plan_id=%s period=%s due_date=%s",
            plan.id,
            period,
            due_date.isoformat(),
        )

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


def _has_collapsed_due_dates(schedules: List[InstallmentSchedule]) -> bool:
    if len(schedules) <= 1:
        return False
    return len({schedule.due_date for schedule in schedules}) == 1


def _rebuild_collapsed_schedules_if_needed(db: Session, plan: InstallmentPlan) -> bool:
    schedules = db.query(InstallmentSchedule).filter(
        InstallmentSchedule.installment_plan_id == plan.id
    ).order_by(InstallmentSchedule.period_no).all()
    if not _has_collapsed_due_dates(schedules):
        return False

    if any(schedule.status != "pending" for schedule in schedules):
        logger.warning(
            "Detected collapsed installment due_dates but skipped rebuild because schedules are not all pending plan_id=%s",
            plan.id,
        )
        return False

    first_schedule_date = _resolve_schedule_anchor_date(plan)
    logger.warning(
        "Detected collapsed installment due_dates; rebuilding schedules plan_id=%s first_schedule_date=%s schedule_count=%s",
        plan.id,
        first_schedule_date.isoformat(),
        len(schedules),
    )

    for schedule in schedules:
        db.delete(schedule)
    db.flush()

    rebuilt_schedules: List[InstallmentSchedule] = []
    target_day = first_schedule_date.day
    for period in range(1, plan.total_periods + 1):
        due_date = compute_period_date(first_schedule_date, target_day, period - 1)
        original_schedule = schedules[period - 1]
        rebuilt_schedules.append(
            InstallmentSchedule(
                id=generate_uuid(),
                installment_plan_id=plan.id,
                period_no=period,
                due_date=due_date,
                principal_amount=original_schedule.principal_amount,
                fee_amount=original_schedule.fee_amount,
                total_due=original_schedule.total_due,
                status="pending",
            )
        )
        logger.info(
            "Rebuilt installment schedule due_date plan_id=%s period=%s due_date=%s",
            plan.id,
            period,
            due_date.isoformat(),
        )

    db.add_all(rebuilt_schedules)
    db.flush()
    return True


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
    first_schedule_date = _get_first_schedule_date(data)
    first_execution_date = data.first_execution_date or first_schedule_date
    first_billing_date = data.first_billing_date or first_schedule_date
    if data.first_billing_date is None and data.first_execution_date is None and data.repayment_day is None:
        raise ValueError("first_billing_date, first_execution_date or repayment_day is required")

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
            first_repayment_date=first_schedule_date,
            next_execution_date=first_execution_date,  # 🛡️ L: 下次执行日期
            repayment_day=data.repayment_day,
            status=PlanStatus.ACTIVE.value,
            tags=serialized_tags,
            note=data.note,
        )
        db.add(plan)
        db.flush()
        plan.first_execution_date = first_execution_date
        plan.first_billing_date = first_billing_date
        plan.first_repayment_date = first_schedule_date
        db.flush()

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
    try:
        # 1. 为本期分期生成一笔支出账单，发生日期以计划日为准
        note = f"[{next_period}/{plan.total_periods}] 期 - {plan.plan_name}"
        principal_amount = Decimal(str(schedule.principal_amount))
        fee_amount = Decimal(str(schedule.fee_amount))
        amount = principal_amount + fee_amount
        occurred_at = datetime.combine(schedule.due_date, datetime.min.time())
        transaction_extra = json.dumps(
            {
                "installment_period_no": next_period,
                "installment_schedule_id": schedule.id,
                "principal_amount": str(principal_amount),
                "fee_amount": str(fee_amount),
                # 银行额度冻结只占用本金，执行期释放时也只能释放本金。
                "frozen_release_amount": str(principal_amount),
                "book_amount": str(amount),
            },
            ensure_ascii=False,
        )

        txn_data = TransactionCreate(
            occurred_at=occurred_at,
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=amount,
            account_id=plan.account_id,
            category_id=plan.category_id,
            merchant=plan.plan_name,
            note=note,
            tags=_resolve_plan_transaction_tags(db, book_id, plan.tags),
            extra=transaction_extra,
            business_key=f"installment:{plan.id}:p{next_period}",
            source_type=SourceType.SYSTEM,
            include_expense_override=True,
            include_cashflow_override=False,
        )
        transaction = create_transaction(db, book_id, txn_data)

        # 2. 交易创建时已完成 debt/frozen 迁移，这里只刷新账户对象
        db.refresh(account)

        # 3. 标记期次已执行
        schedule.payment_transaction_id = transaction.id
        schedule.paid_amount = amount
        schedule.paid_at = occurred_at
        schedule.status = "executed"

        # 4. 更新计划进度
        plan.executed_periods = next_period
        plan.current_period = next_period

        # 5. 🛡️ L: 推算下一个执行日期
        plan.next_execution_date = _get_next_pending_schedule_date(db, plan.id)

        # 6. 🛡️ L: 同步写入余额快照
        _write_installment_balance_snapshot(db, account, plan, next_period)

        # 7. 检查是否完成
        if plan.executed_periods >= plan.total_periods:
            plan.status = PlanStatus.COMPLETED.value

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
    plan = db.query(InstallmentPlan).filter(
        InstallmentPlan.id == plan_id,
        InstallmentPlan.book_id == book_id
    ).first()
    if plan and _rebuild_collapsed_schedules_if_needed(db, plan):
        db.commit()
        db.refresh(plan)
    return plan


def get_installment_schedules(db: Session, plan_id: str) -> List[InstallmentSchedule]:
    """Get all schedules for an installment plan"""
    plan = db.query(InstallmentPlan).filter(InstallmentPlan.id == plan_id).first()
    if plan and _rebuild_collapsed_schedules_if_needed(db, plan):
        db.commit()
        db.refresh(plan)
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
    update_data = data.model_dump(exclude_unset=True)
    schedule_related_fields = {"start_date", "repayment_day"}
    should_rebuild_schedule = bool(schedule_related_fields & set(update_data.keys()))
    if plan.executed_periods > 0 and should_rebuild_schedule:
        raise ValueError("已执行期次后禁止修改创建日期或账单日")

    if "tags" in update_data:
        update_data["tags"] = json.dumps(update_data["tags"], ensure_ascii=False) if update_data["tags"] else None

    for key, value in update_data.items():
        setattr(plan, key, value)

    if should_rebuild_schedule:
        first_schedule_date = plan.first_billing_date or plan.first_execution_date
        if not first_schedule_date:
            first_schedule_date = compute_period_date(plan.start_date, plan.repayment_day, 0)
        plan.first_execution_date = first_schedule_date
        plan.first_billing_date = first_schedule_date
        plan.first_repayment_date = first_schedule_date
        plan.next_execution_date = first_schedule_date
        schedules = db.query(InstallmentSchedule).filter(
            InstallmentSchedule.installment_plan_id == plan.id
        ).order_by(InstallmentSchedule.period_no).all()
        for schedule in schedules:
            schedule.due_date = compute_period_date(first_schedule_date, first_schedule_date.day, schedule.period_no - 1)

    db.commit()
    db.refresh(plan)
    clear_overview_cache()  # 🛡️ L: update plan
    return plan


def revert_installment_period(db: Session, period_id: str, book_id: str) -> dict:
    """Revert an executed installment period and rollback account impact."""
    schedule = db.query(InstallmentSchedule).join(InstallmentPlan).filter(
        InstallmentSchedule.id == period_id,
        InstallmentPlan.book_id == book_id,
    ).first()
    if not schedule:
        raise NotFoundException("Installment period not found")

    plan = schedule.plan
    if schedule.period_no != plan.executed_periods:
        raise HTTPException(status_code=400, detail="只能按顺序撤回最新执行的一期分期任务")
    if schedule.status != "executed":
        raise HTTPException(status_code=400, detail="Only executed installment periods can be reverted")
    if not schedule.payment_transaction_id:
        raise HTTPException(status_code=400, detail="Installment period has no linked transaction")

    transaction = db.query(Transaction).filter(
        Transaction.id == schedule.payment_transaction_id,
        Transaction.book_id == book_id,
    ).first()
    if not transaction:
        raise NotFoundException("Linked transaction not found")
    if transaction.posted_at is not None:
        raise HTTPException(status_code=400, detail="Settled transaction cannot be reverted")

    delete_transaction(db, transaction.id, book_id)
    update_account_frozen_amount(
        db,
        plan.account_id,
        Decimal(str(schedule.principal_amount)),
        is_increase=True,
    )

    schedule.payment_transaction_id = None
    schedule.paid_amount = Decimal("0")
    schedule.paid_at = None
    schedule.status = "pending"

    if plan.executed_periods == schedule.period_no:
        plan.executed_periods -= 1
        plan.current_period = max(plan.executed_periods, 0)
    else:
        executed_count = db.query(InstallmentSchedule).filter(
            InstallmentSchedule.installment_plan_id == plan.id,
            InstallmentSchedule.status == "executed",
        ).count()
        plan.executed_periods = executed_count
        plan.current_period = executed_count

    plan.status = PlanStatus.ACTIVE.value
    plan.next_execution_date = schedule.due_date

    db.commit()
    db.refresh(schedule)
    db.refresh(plan)
    clear_overview_cache()
    return {"plan": plan, "schedule": schedule}


def delete_installment_plan(db: Session, plan_id: str, book_id: str) -> None:
    """Delete an unexecuted installment plan and release frozen amount."""
    plan = get_installment_plan(db, plan_id, book_id)
    if not plan:
        raise NotFoundException("Installment plan not found")
    if plan.executed_periods > 0:
        raise ValueError("已执行过期次的分期计划禁止删除")

    from src.modules.accounts.models import Account

    account = db.query(Account).filter(Account.id == plan.account_id).with_for_update().first()
    if not account:
        raise NotFoundException("Account not found")

    account.frozen_amount = max(
        Decimal("0"),
        Decimal(str(account.frozen_amount or 0)) - Decimal(str(plan.total_amount or 0)),
    )
    db.delete(plan)
    db.commit()
    clear_overview_cache()


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
