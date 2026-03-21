from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import AccountCreate, AccountResponse, AccountUpdate
from .service import create_account, delete_account, get_account, get_accounts, update_account
from .rebuild import rebuild_account_balance, rebuild_book_accounts
from src.modules.books.service import resolve_book_id

router = APIRouter(prefix="/accounts", tags=["accounts"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    return resolve_book_id(db, current_user.id, book_id)


@router.post("", response_model=AccountResponse)
def create(
    data: AccountCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create new account"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_account(db, bid, data)


@router.get("", response_model=List[AccountResponse])
def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    include_inactive: bool = False
):
    """Get all accounts"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_accounts(db, bid, include_inactive)


@router.get("/{account_id}", response_model=AccountResponse)
def get(
    account_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get account by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    account = get_account(db, account_id, bid)
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.patch("/{account_id}", response_model=AccountResponse)
def update(
    account_id: str, 
    data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update account"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_account(db, account_id, bid, data)


@router.delete("/{account_id}")
def delete(
    account_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Delete (deactivate) account"""
    bid = get_current_book_id(current_user, db, book_id)
    delete_account(db, account_id, bid)
    return {"message": "Account deleted"}


@router.post("/rebuild/{account_id}")
def rebuild_single(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rebuild single account balance"""
    result = rebuild_account_balance(db, account_id)
    return result


@router.post("/rebuild")
def rebuild_book(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Rebuild all accounts in the book"""
    bid = get_current_book_id(current_user, db, book_id)
    results = rebuild_book_accounts(db, bid)
    return {"book_id": bid, "accounts": results}
