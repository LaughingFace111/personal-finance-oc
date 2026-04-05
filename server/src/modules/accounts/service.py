from decimal import Decimal
from typing import List, Optional, Dict, Any, Tuple
from datetime import date, datetime, timedelta
from calendar import monthrange

from sqlalchemy.orm import Session
from sqlalchemy import func

from src.common.enums import AccountType, TransactionType, TransactionDirection, SourceType
from src.core import ErrorCode, AppException, generate_uuid, NotFoundException

from .models import Account
from .schemas import AccountCreate, AccountUpdate


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
    """Return the most recent past/current bill date and the next upcoming bill date."""
    current_month_bill_date = _safe_date(today.year, today.month, billing_day)

    if today >= current_month_bill_date:
        last_bill_date = current_month_bill_date
        if current_month_bill_date.month == 12:
            next_bill_date = _safe_date(current_month_bill_date.year + 1, 1, billing_day)
        else:
            next_bill_date = _safe_date(current_month_bill_date.year, current_month_bill_date.month + 1, billing_day)
    else:
        next_bill_date = current_month_bill_date
        if current_month_bill_date.month == 1:
            last_bill_date = _safe_date(current_month_bill_date.year - 1, 12, billing_day)
        else:
            last_bill_date = _safe_date(current_month_bill_date.year, current_month_bill_date.month - 1, billing_day)

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
    # Check name uniqueness
    existing = db.query(Account).filter(
        Account.book_id == book_id,
        Account.name == data.name
    ).first()
    if existing:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="Account name already exists")

    # 判断账户类型是否为信用类（信用卡/信用账户）
    is_credit = data.account_type.value in ["credit_card", "credit_line"]
    
    # 信用类账户：opening_balance 作为初始欠款存入 debt_amount
    # 非信用类账户：opening_balance 存入 current_balance
    if is_credit:
        opening_balance = Decimal("0")  # 信用账户的 opening_balance 固定为 0
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
    account.name = f"[已删除] {account.name}"
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
        account.frozen_amount -= amount
        # 确保不会变成负数
        if account.frozen_amount < 0:
            account.frozen_amount = Decimal("0")


def calculate_credit_statement_info(db: Session, account: Account) -> Dict[str, Any]:
    """
    🛡️ L: 计算信用账户的本期待还和下一个还款日
    
    算法：
    1. 推算最近已出账日和即将出账日
    2. 基于最近已出账日统一计算未出账区间净消费
    3. 旧账单欠款 = 当前总欠款 - 未出账净消费
    4. 若旧账未清，继续锚定最近已出账账单；否则轮转到即将出账的新账单
    """
    # 如果不是信用账户，返回 None
    if account.account_type not in ['credit_card', 'credit_line']:
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None,
            'is_overdue': False
        }
    
    # 如果未设置账单日或还款日，返回 None
    billing_day = account.billing_day
    repayment_day = account.repayment_day
    
    if not billing_day or not repayment_day:
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None,
            'is_overdue': False
        }
    
    try:
        billing_day = int(billing_day)
        repayment_day = int(repayment_day)
    except (ValueError, TypeError):
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None,
            'is_overdue': False
        }
    
    today = date.today()
    billing_day_rule = account.billing_day_rule or "current_cycle"
    last_bill_date, next_bill_date = _get_adjacent_bill_dates(today, billing_day)
    current_debt = account.debt_amount or Decimal("0")

    if billing_day_rule == "next_cycle":
        unbilled_cycle_start_date = last_bill_date
    else:
        unbilled_cycle_start_date = last_bill_date + timedelta(days=1)

    unbilled_cycle_start_datetime = datetime.combine(unbilled_cycle_start_date, datetime.min.time())

    # 延迟导入避免循环依赖
    from src.modules.transactions.models import Transaction as TxnModel

    # 净消费 = 支出总额 - 退款总额（出账日之后）
    expense_query = db.query(func.sum(TxnModel.amount)).filter(
        TxnModel.account_id == account.id,
        TxnModel.occurred_at >= unbilled_cycle_start_datetime,
        TxnModel.status == "confirmed",
        TxnModel.direction == TransactionDirection.OUT.value,
        ~(
            (TxnModel.source_type == SourceType.SYSTEM.value) &
            (TxnModel.business_key.like("installment:%"))
        ),
        TxnModel.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value
        ])
    )
    expense_total = expense_query.scalar() or Decimal("0")

    # 退款（减少负债）
    # 当前为简化实现：所有出账日后的退款均视为冲抵未出账消费。
    # 完整实现需要区分退款对应的原消费是否已经出账。
    refund_query = db.query(func.sum(TxnModel.amount)).filter(
        TxnModel.account_id == account.id,
        TxnModel.occurred_at >= unbilled_cycle_start_datetime,
        TxnModel.status == "confirmed",
        TxnModel.transaction_type == TransactionType.REFUND.value
    )
    refund_total = refund_query.scalar() or Decimal("0")

    unbilled_net = expense_total - refund_total
    old_billed_debt = current_debt - unbilled_net

    if old_billed_debt > Decimal("0"):
        statement_balance = old_billed_debt
        target_bill_date = last_bill_date
    else:
        statement_balance = max(Decimal("0"), unbilled_net)
        target_bill_date = next_bill_date

    next_repay_date = _get_statement_due_date(target_bill_date, repayment_day)
    is_overdue = today > next_repay_date
    days_until = (next_repay_date - today).days
    
    return {
        'current_statement_balance': statement_balance,
        'next_repayment_date': next_repay_date.isoformat(),
        'days_until_repayment': days_until,
        'is_overdue': is_overdue
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
                'days_until_repayment': info['days_until_repayment']
            })
    
    # 按还款日期排序（近的在前）
    summary.sort(key=lambda x: x['repayment_date'] or '9999-12-31')
    
    return summary
