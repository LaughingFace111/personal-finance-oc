from decimal import Decimal
from typing import List, Optional, Dict, Any, Tuple
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func

from src.common.enums import AccountType, TransactionType, TransactionDirection
from src.core import ErrorCode, AppException, generate_uuid, NotFoundException

from .models import Account
from .schemas import AccountCreate, AccountUpdate


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
    """Update account balance"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return

    if is_increase:
        account.current_balance += amount
    else:
        account.current_balance -= amount


def update_account_debt(db: Session, account_id: str, amount: Decimal, is_increase: bool) -> None:
    """Update account debt"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return

    if is_increase:
        account.debt_amount += amount
    else:
        account.debt_amount -= amount


def update_account_frozen(db: Session, account_id: str, amount: Decimal, is_increase: bool) -> None:
    """🛡️ L: Update account frozen amount (for installment plans)"""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return

    if is_increase:
        account.frozen_amount += amount
    else:
        account.frozen_amount -= amount
        # 确保不会变成负数
        if account.frozen_amount < 0:
            account.frozen_amount = 0


def calculate_credit_statement_info(db: Session, account: Account) -> Dict[str, Any]:
    """
    🛡️ L: 计算信用账户的本期待还和下一个还款日
    
    算法：
    1. 根据 billing_day 推算最近一次出账日 D_last_bill
    2. 根据 repayment_day 推算下一个还款日 D_next_repay
    3. 计算 D_last_bill 之后的净消费（支出 - 退款）
    4. Statement_Balance = max(0, Current_Debt - Unbilled_Net_Expense)
    """
    # 如果不是信用账户，返回 None
    if account.account_type not in ['credit_card', 'credit_line']:
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None
        }
    
    # 如果未设置账单日或还款日，返回 None
    billing_day = account.billing_day
    repayment_day = account.repayment_day
    
    if not billing_day or not repayment_day:
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None
        }
    
    try:
        billing_day = int(billing_day)
        repayment_day = int(repayment_day)
    except (ValueError, TypeError):
        return {
            'current_statement_balance': None,
            'next_repayment_date': None,
            'days_until_repayment': None
        }
    
    today = date.today()
    current_year = today.year
    current_month = today.month
    
    # 推算最近一次出账日（D_last_bill）
    # 出账日 = 每月 billing_day
    # 如果今天 >= 本月账单日，则最近出账日是本月账单日
    # 否则，上月账单日
    if today.day >= billing_day:
        last_bill_date = date(current_year, current_month, billing_day)
    else:
        # 上个月
        if current_month == 1:
            last_bill_date = date(current_year - 1, 12, billing_day)
        else:
            last_bill_date = date(current_year, current_month - 1, billing_day)
    
    # 推算下一个还款日（D_next_repay）
    # 还款日通常在出账日之后
    # 找到下一个还款日：如果今天 <= 本月还款日，则为本月；否则为下月
    if today.day <= repayment_day:
        next_repay_date = date(current_year, current_month, repayment_day)
    else:
        # 下个月
        if current_month == 12:
            next_repay_date = date(current_year + 1, 1, repayment_day)
        else:
            next_repay_date = date(current_year, current_month + 1, repayment_day)
    
    # 计算距还款日天数
    days_until = (next_repay_date - today).days
    
    # 查询 D_last_bill 之后的交易（计算未出账净消费）
    # Unbilled_Net_Expense = 支出总额 - 退款总额（出账日之后）
    last_bill_datetime = datetime.combine(last_bill_date, datetime.min.time())
    
    # 延迟导入避免循环依赖
    from src.modules.transactions.models import Transaction as TxnModel
    
    # 净消费 = 支出总额 - 退款总额（出账日之后）
    expense_query = db.query(func.sum(TxnModel.amount)).filter(
        TxnModel.account_id == account.id,
        TxnModel.occurred_at >= last_bill_datetime,
        TxnModel.status == "confirmed",
        TxnModel.direction == TransactionDirection.OUT.value,
        TxnModel.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value
        ])
    )
    expense_total = expense_query.scalar() or Decimal("0")
    
    # 退款（减少负债）
    refund_query = db.query(func.sum(TxnModel.amount)).filter(
        TxnModel.account_id == account.id,
        TxnModel.occurred_at >= last_bill_datetime,
        TxnModel.status == "confirmed",
        TxnModel.transaction_type == TransactionType.REFUND.value
    )
    refund_total = refund_query.scalar() or Decimal("0")
    
    # 未出账净消费
    unbilled_net = expense_total - refund_total
    
    # 本期待还 = max(0, 当前总欠款 - 未出账净消费)
    # 原理：当前总欠款中，减去尚未出账的消费，剩下的是已出账且未还的
    current_debt = account.debt_amount or Decimal("0")
    statement_balance = max(Decimal("0"), current_debt - unbilled_net)
    
    return {
        'current_statement_balance': statement_balance,
        'next_repayment_date': next_repay_date.isoformat(),
        'days_until_repayment': max(0, days_until)
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
