from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import (
    TransactionCreate, TransactionResponse, TransactionUpdate,
    TransferCreate, RefundCreate, TransactionFilter, TransactionSummary
)
from .service import (
    create_transaction, create_transfer, create_refund,
    get_transactions, get_transaction, update_transaction, delete_transaction
)
from src.modules.books.service import get_default_book, create_book

router = APIRouter(prefix="/transactions", tags=["transactions"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


@router.post("", response_model=TransactionResponse)
def create(
    data: TransactionCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create new transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_transaction(db, bid, data)


@router.post("/transfer", response_model=List[TransactionResponse])
def transfer(
    data: TransferCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create transfer between two accounts"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_transfer(db, bid, data)


@router.post("/refund", response_model=TransactionResponse)
def refund(
    data: RefundCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create refund transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_refund(db, bid, data)


@router.get("", response_model=TransactionSummary)
def list_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    date_from: str = None,
    date_to: str = None,
    account_id: str = None,
    category_id: str = None,
    transaction_type: str = None,
    status: str = None,
    keyword: str = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """Get transactions with filters"""
    from datetime import datetime

    bid = get_current_book_id(current_user, db, book_id)

    filters = {
        "date_from": datetime.fromisoformat(date_from) if date_from else None,
        "date_to": datetime.fromisoformat(date_to) if date_to else None,
        "account_id": account_id,
        "category_id": category_id,
        "transaction_type": transaction_type,
        "status": status,
        "keyword": keyword,
        "page": page,
        "page_size": page_size
    }

    items, total = get_transactions(db, bid, filters)

    return TransactionSummary(
        total_count=total,
        total_amount=sum(i.amount for i in items),
        page=page,
        page_size=page_size,
        items=items
    )


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get(
    transaction_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get transaction by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    txn = get_transaction(db, transaction_id, bid)
    if not txn:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update(
    transaction_id: str, 
    data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_transaction(db, transaction_id, bid, data)


@router.delete("/{transaction_id}")
def delete(
    transaction_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Delete (void) transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    delete_transaction(db, transaction_id, bid)
    return {"message": "Transaction voided"}
