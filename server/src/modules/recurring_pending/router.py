from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book

from .schemas import PendingConfirmRequest, PendingItemResponse, PendingSkipRequest
from .service import confirm_pending_item, get_pending_items, skip_pending_item, sync_pending_items

router = APIRouter(prefix="/recurring-pending", tags=["recurring_pending"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
) -> str:
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        raise HTTPException(status_code=404, detail="No default book found")
    return default_book.id


@router.post("/sync", response_model=List[PendingItemResponse])
def sync(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    until_date: date = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return sync_pending_items(db, bid, until_date)


@router.get("", response_model=List[PendingItemResponse])
def list_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    status: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_pending_items(db, bid, status)


@router.post("/{pending_id}/confirm", response_model=PendingItemResponse)
def confirm(
    pending_id: str,
    data: PendingConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return confirm_pending_item(db, pending_id, bid, data)


@router.post("/{pending_id}/skip", response_model=PendingItemResponse)
def skip(
    pending_id: str,
    data: PendingSkipRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return skip_pending_item(db, pending_id, bid, data.reason)
