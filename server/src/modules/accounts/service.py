import uuid
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Dict, Any, Tuple
from datetime import date, datetime, timedelta
from calendar import monthrange

from sqlalchemy.orm import Session
from sqlalchemy import func

from src.common.enums import AccountType, TransactionType, TransactionDirection
from src.core import ErrorCode, AppException, generate_uuid, NotFoundException

from .models import Account
from .schemas import AccountCreate, AccountUpdate


def _to_decimal_or_zero(value: Any) -> Decimal:
    """Normalize nullable numeric values from ORM/SQL aggregates to Decimal(0)."""
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _safe_date(year: int, month: int, day: int) -> date:
    """Clamp day to the last valid day of the target month."""
    return date(year, month, min(day, monthrange(year, month)[1]))


def _get_billing_cycle_dates(today: date, billing_day: int, billing_day_rule: str = "current_cycle") -> Tuple[date, date]:
    """Return the statement bill date and the statement-cycle start date."""
    current_month_bill_date = _safe_date(today.year, today.month, billing_day)
    if today.month == 1:
        previous_month_bill_date = _safe_date(today.year - 1, 12, billing_day)
    else:
        previous_month_bill_date = _safe_date(today.year, today.month - 1, billing_day)

    if billing_day_rule == "next_cycle":
        cycle_start_date = previous_month_bill_date + timedelta(days=1)
    else:
        cycle_start_date = previous_month_bill_date

    return current_month_bill_date, cycle_start_date


def _get_adjacent_bill_dates(today: date, billing_day: int) -> Tuple[date, date]:
    """
    Return the bill-date anchors used by statement calculations.

    - `last_bill_date`: the bill date that anchors the current statement decision.
      When today < billing_day, this is this month's upcoming bill date.
      When today >= billing_day, this is this month's bill date that has already occurred.
    - `next_bill_date`: the bill date for the following cycle.

    Example with billing_day=5:
    - On Apr 4 (before billing day): last=Apr 5, next=May 5
    - On Apr 5 (on billing day):     last=Apr 5, next=May 5
    - On Apr 6 (after billing day):  last=Apr 5, next=May 5
    """
    current_month_bill_date = _safe_date(today.year, today.month, billing_day)

    if today >= current_month_bill_date:
        last_bill_date = current_month_bill_date
        if current_month_bill_date.month == 12:
            next_bill_date = _safe_date(current_month_bill_date.year + 1, 1, billing_day)
        else:
            next_bill_date = _safe_date(current_month_bill_date.year, current_month_bill_date.month + 1, billing_day)
    else:
        # When today < billing_day: this month's bill has not been generated yet.
        # The most recent 'current' bill date is this month's billing date.
        # Example: today=Apr 4, billing_day=5 -> last_bill_date=Apr 5, next_bill_date=May 5
        last_bill_date = current_month_bill_date
        next_bill_date = _safe_date(
            current_month_bill_date.year + (1 if current_month_bill_date.month == 12 else 0),
            (current_month_bill_date.month % 12) + 1,
            billing_day,
        )

    return last_bill_date, next_bill_date


def _get_statement_due_date(last_bill_date: date, repayment_day: int) -> date:
    """Return the due date for the statement generated on last_bill_date."""
    if repayment_day > last_bill_date.day:
        return _safe_date(last_bill_date.year, last_bill_date.month, repayment_day)

    due_year = last_bill_date.year
    due_month = last_bill_date.month
    if due_month == 12:
        due_year += 1
        due_month = 1
    else:
        due_month += 1
    return _safe_date(due_year, due_month, repayment_day)


def create_account(db: Session, book_id: str, data: AccountCreate) -> Account:
    """Create new account"""
    # Check name uniqueness (only active accounts)
    existing = db.query(Account).filter(
        Account.book_id == book_id,
        Account.name == data.name,
        Account.is_deleted == False  # exclude soft-deleted accounts
    ).first()
    if existing:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="该账户名称已存在")

    # 判断账户类型是否为信用类（信用卡/信用账户）或贷款类
    is_credit = data.account_type.value in ["credit_card", "credit_line"]
    is_loan = data.account_type.value == "loan"

    # 信用/贷款类账户：opening_balance 作为初始欠款存入 debt_amount
    # 非信用类账户：opening_balance 存入 current_balance
    if is_credit or is_loan:
        opening_balance = Decimal("0")
        debt_amount = data.opening_balance or Decimal("0")  # 初始欠款存入 debt_amount
    else:
        opening_balance = data.opening_balance or Decimal("0")
        debt_amount = Decimal("0")

    account = Account(
        id=generate_uuid(),
        book_id=book_id,
        name=data.name,
        account_type=data.account_type.value,
        institution_name=data.institution_name,
        card_last4=data.card_last4,
        credit_limit=data.credit_limit or Decimal("0"),
        billing_day=str(data.billing_day) if data.billing_day else None,
        billing_day_rule=data.billing_day_rule or "current_cycle",
        repayment_day=str(data.repayment_day) if data.repayment_day else None,
        opening_balance=opening_balance,
        current_balance=opening_balance,
        debt_amount=debt_amount,
        currency=data.currency,
        note=data.note,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def get_accounts(db: Session, book_id: str, include_inactive: bool = False, include_deleted: bool = False) -> List[Account]:
    """Get all accounts for book"""
    query = db.query(Account).filter(Account.book_id == book_id)
    if not include_inactive:
        query = query.filter(Account.is_active == True)
    if not include_deleted:
        query = query.filter(Account.is_deleted == False)
    return query.all()


def get_account(db: Session, account_id: str, book_id: str) -> Optional[Account]:
    """Get account by ID"""
    return db.query(Account).filter(
        Account.id == account_id,
        Account.book_id == book_id
    ).first()


def get_account_by_id(db: Session, account_id: str) -> Optional[Account]:
    """Get account by ID without book filter"""
    return db.query(Account).filter(Account.id == account_id).first()


def update_account(db: Session, account_id: str, book_id: str, data: AccountUpdate) -> Account:
    """Update account"""
    account = get_account(db, account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None and key in ["billing_day", "repayment_day"]:
            value = str(value)
        setattr(account, key, value)

    db.commit()
    db.refresh(account)
    return account


def delete_account(db: Session, account_id: str, book_id: str) -> Account:
    """Soft delete account - preserves historical transactions"""
    account = get_account(db, account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")
    if account.is_deleted:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="Account already deleted")

    account.is_deleted = True
    account.is_active = False
    # 🛡️ L: 保留原名称，前面加标记，不使用固定名称避免 UNIQUE 约束冲突
    account.name = f"[已删除-{uuid.uuid4().hex[:8]}] {account.name}"
    db.commit()
    return account


def update_account_balance(db: Session, account_id: str, amount: Decimal, is_increase: bool) -> None:
    """Update account balance — MUST be called within a transaction with proper locking."""
    account = db.query(Account).filter(
        Account.id == account_id
    ).with_for_update().first()
    if not account:
        return

    if is_increase:
        account.current_balance += amount
    else:
        account.current_balance -= amount


def update_account_debt(db: Session, account_id: str, amount: Decimal, is_increase: bool) -> None:
    """Update account debt — MUST be called within a transaction with proper locking."""
    account = db.query(Account).filter(
        Account.id == account_id
    ).with_for_update().first()
    if not account:
        return

    if is_increase:
        account.debt_amount += amount
    else:
        account.debt_amount -= amount


def update_account_frozen(db: Session, account_id: str, amount: Decimal, is_increase: bool) -> None:
    """🛡️ L: Update account frozen amount (for installment plans)"""
    account = db.query(Account).filter(
        Account.id == account_id
    ).with_for_update().first()
    if not account:
        return

    if is_increase:
        account.frozen_amount += amount
    else:
        if account.frozen_amount < amount:
            raise AppException(
                status_code=400,
                code=ErrorCode.INVALID_STATE,
                message=f"Cannot unfreeze {amount}: only {account.frozen_amount} frozen"
            )
        account.frozen_amount -= amount


def calculate_credit_statement_info(db: Session, account: Account) -> Dict[str, Any]:
    """
    🛡️ L: 计算信用账户的本期待还和下一个还款日

    三段式算法：
    1. 计算上一账单日、当前账单日、下一账单日
    2. 分别统计逾期、当前已出账、未出账三个窗口的消费/退款/还款净额
    3. 展示值始终使用各窗口的剩余应还净额，而不是原始消费额
    4. 按 逾期 > 当前已出账 > 未出账投影 的优先级决定展示金额和还款日
    """
    # 如果不是信用账户，返回 None
    if account.account_type not in ['credit_card', 'credit_line']:
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None,
            'is_overdue': False,
            'credit_balance': 0.0,
        }
    
    # 如果未设置账单日或还款日，返回 None
    billing_day = account.billing_day
    repayment_day = account.repayment_day
    
    if not billing_day or not repayment_day:
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None,
            'is_overdue': False,
            'credit_balance': 0.0,
        }
    
    try:
        billing_day = int(billing_day)
        repayment_day = int(repayment_day)
    except (ValueError, TypeError):
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None,
            'is_overdue': False,
            'credit_balance': 0.0,
        }
    
    today = date.today()
    billing_day_rule = account.billing_day_rule or "current_cycle"
    last_bill_date, next_bill_date = _get_adjacent_bill_dates(today, billing_day)
    current_debt = _to_decimal_or_zero(account.debt_amount)

    if last_bill_date.month == 1:
        prev_bill_date = _safe_date(last_bill_date.year - 1, 12, billing_day)
    else:
        prev_bill_date = _safe_date(last_bill_date.year, last_bill_date.month - 1, billing_day)

    if billing_day_rule == "next_cycle":
        current_cycle_start_date = prev_bill_date
        unbilled_cycle_start_date = last_bill_date
    else:
        current_cycle_start_date = prev_bill_date
        unbilled_cycle_start_date = last_bill_date + timedelta(days=1)

    current_cycle_start_dt = datetime.combine(current_cycle_start_date, datetime.min.time())
    unbilled_cycle_start_dt = datetime.combine(unbilled_cycle_start_date, datetime.min.time())
    next_bill_date_dt = datetime.combine(next_bill_date, datetime.min.time())

    # 延迟导入避免循环依赖
    from src.modules.transactions.models import Transaction as TxnModel
    OriginalTxn = TxnModel.__table__.alias("statement_original_txn")
    RefundTxn = TxnModel.__table__.alias("statement_refund_txn")

    expense_types = [
        TransactionType.EXPENSE.value,
        TransactionType.FEE.value,
        TransactionType.INSTALLMENT_PURCHASE.value,
    ]

    def _sum_expenses(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Decimal:
        expense_total = db.query(func.sum(TxnModel.amount)).filter(
            TxnModel.account_id == account.id,
            TxnModel.status == "confirmed",
            TxnModel.direction == TransactionDirection.OUT.value,
            TxnModel.transaction_type.in_(expense_types),
        )
        if start_dt is not None:
            expense_total = expense_total.filter(TxnModel.occurred_at >= start_dt)
        if end_dt is not None:
            expense_total = expense_total.filter(TxnModel.occurred_at < end_dt)
        return _to_decimal_or_zero(expense_total.scalar())

    def _sum_refunds(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Decimal:
        linked_refunds = db.query(func.sum(RefundTxn.c.amount)).join(
            OriginalTxn, RefundTxn.c.related_transaction_id == OriginalTxn.c.id
        ).filter(
            RefundTxn.c.account_id == account.id,
            RefundTxn.c.status == "confirmed",
            RefundTxn.c.transaction_type == TransactionType.REFUND.value,
            OriginalTxn.c.account_id == account.id,
        )
        if start_dt is not None:
            linked_refunds = linked_refunds.filter(OriginalTxn.c.occurred_at >= start_dt)
        if end_dt is not None:
            linked_refunds = linked_refunds.filter(OriginalTxn.c.occurred_at < end_dt)

        unlinked_refunds = db.query(func.sum(TxnModel.amount)).filter(
            TxnModel.account_id == account.id,
            TxnModel.status == "confirmed",
            TxnModel.transaction_type == TransactionType.REFUND.value,
            TxnModel.related_transaction_id.is_(None),
        )
        if start_dt is not None:
            unlinked_refunds = unlinked_refunds.filter(TxnModel.occurred_at >= start_dt)
        if end_dt is not None:
            unlinked_refunds = unlinked_refunds.filter(TxnModel.occurred_at < end_dt)

        return _to_decimal_or_zero(linked_refunds.scalar()) + _to_decimal_or_zero(unlinked_refunds.scalar())

    def _sum_repayments(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Decimal:
        repayments = db.query(func.sum(TxnModel.amount)).filter(
            TxnModel.counterparty_account_id == account.id,
            TxnModel.status == "confirmed",
            TxnModel.transaction_type == TransactionType.REPAYMENT_CREDIT_CARD.value,
        )
        if start_dt is not None:
            repayments = repayments.filter(TxnModel.occurred_at >= start_dt)
        if end_dt is not None:
            repayments = repayments.filter(TxnModel.occurred_at < end_dt)
        return _to_decimal_or_zero(repayments.scalar())

    def _calculate_raw_window_charges(start_dt: Optional[datetime], end_dt: Optional[datetime]) -> Decimal:
        return _sum_expenses(start_dt, end_dt) - _sum_refunds(start_dt, end_dt)

    # Repayments should offset the oldest billed debt first. If we bucket
    # repayments only by their occurred_at date, a repayment made after the next
    # cycle starts can be incorrectly treated as paying the new cycle instead of
    # the older billed statement, which keeps "本期待还" unchanged.
    raw_current_billed = _calculate_raw_window_charges(current_cycle_start_dt, unbilled_cycle_start_dt)
    raw_unbilled = _calculate_raw_window_charges(unbilled_cycle_start_dt, next_bill_date_dt)
    total_repayments = _sum_repayments(None, None)
    raw_overdue = max(Decimal("0"), current_debt + total_repayments - raw_current_billed - raw_unbilled)

    remaining_repayments = total_repayments

    overdue_debt = max(Decimal("0"), raw_overdue - remaining_repayments)
    remaining_repayments = max(Decimal("0"), remaining_repayments - raw_overdue)

    current_billed_net = max(Decimal("0"), raw_current_billed - remaining_repayments)
    remaining_repayments = max(Decimal("0"), remaining_repayments - raw_current_billed)

    unbilled_net = max(Decimal("0"), raw_unbilled - remaining_repayments)

    prev_billed_due_date = _get_statement_due_date(prev_bill_date, repayment_day)
    current_billed_due_date = _get_statement_due_date(last_bill_date, repayment_day)
    next_projected_due_date = _get_statement_due_date(next_bill_date, repayment_day)

    if overdue_debt > Decimal("0"):
        statement_balance = overdue_debt
        next_repay_date = prev_billed_due_date
        is_overdue = today > prev_billed_due_date
    elif current_billed_net > Decimal("0"):
        statement_balance = current_billed_net
        next_repay_date = current_billed_due_date
        is_overdue = today > current_billed_due_date
    else:
        statement_balance = max(Decimal("0"), unbilled_net)
        next_repay_date = next_projected_due_date
        is_overdue = False

    days_until = (next_repay_date - today).days

    credit_balance = -current_debt if current_debt < Decimal("0") else Decimal("0")

    return {
        'current_statement_balance': statement_balance,
        'next_repayment_date': next_repay_date.isoformat(),
        'days_until_repayment': days_until,
        'is_overdue': is_overdue,
        'credit_balance': float(credit_balance),
    }


def get_credit_accounts_repayment_summary(db: Session, book_id: str) -> List[Dict[str, Any]]:
    """
    🛡️ L: 获取所有信用账户的待还摘要（用于首页展示）
    """
    from sqlalchemy import func
    
    accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.account_type.in_(['credit_card', 'credit_line']),
        Account.is_active == True,
        Account.is_deleted == False
    ).all()
    
    summary = []
    for account in accounts:
        info = calculate_credit_statement_info(db, account)
        if info['current_statement_balance'] is not None:
            summary.append({
                'account_id': account.id,
                'account_name': account.name,
                'statement_balance': info['current_statement_balance'],
                'repayment_date': info['next_repayment_date'],
                'days_until_repayment': info['days_until_repayment'],
                'is_overdue': info['is_overdue']
            })
    
    # 按还款日期排序（近的在前）
    summary.sort(key=lambda x: x['repayment_date'] or '9999-12-31')
    
    return summary
