from decimal import Decimal
from typing import List, Optional

from sqlalchemy.orm import Session

from src.common.enums import AccountType
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

    account = Account(
        id=generate_uuid(),
        book_id=book_id,
        name=data.name,
        account_type=data.account_type.value,
        institution_name=data.institution_name,
        card_last4=data.card_last4,
        credit_limit=data.credit_limit or Decimal("0"),
        billing_day=str(data.billing_day) if data.billing_day else None,
        repayment_day=str(data.repayment_day) if data.repayment_day else None,
        opening_balance=data.opening_balance or Decimal("0"),
        current_balance=data.opening_balance or Decimal("0"),
        currency=data.currency,
        note=data.note,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def get_accounts(db: Session, book_id: str, include_inactive: bool = False) -> List[Account]:
    """Get all accounts for book"""
    query = db.query(Account).filter(Account.book_id == book_id)
    if not include_inactive:
        query = query.filter(Account.is_active == True)
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


def delete_account(db: Session, account_id: str, book_id: str) -> None:
    """Delete (deactivate) account"""
    account = get_account(db, account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    account.is_active = False
    db.commit()


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
