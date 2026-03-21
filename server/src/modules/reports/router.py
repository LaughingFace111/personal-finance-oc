from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import resolve_book_id

from .service import get_overview, get_expense_by_category, get_accounts_summary, get_upcoming_debts

from datetime import date, timedelta

router = APIRouter(prefix="/reports", tags=["reports"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    return resolve_book_id(db, current_user.id, book_id)


@router.get("/overview")
def overview(
    date_from: str = None,
    date_to: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get dashboard overview"""
    bid = get_current_book_id(current_user, db, book_id)

    if not date_from:
        today = date.today()
        date_from = today.replace(day=1)
    else:
        date_from = date.fromisoformat(date_from)

    if not date_to:
        date_to = date.today()
    else:
        date_to = date.fromisoformat(date_to)

    return get_overview(db, bid, date_from, date_to)


@router.get("/expense-by-category")
def expense_by_category(
    date_from: str = None,
    date_to: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get expense breakdown by category"""
    bid = get_current_book_id(current_user, db, book_id)

    if not date_from:
        today = date.today()
        date_from = today.replace(day=1)
    else:
        date_from = date.fromisoformat(date_from)

    if not date_to:
        date_to = date.today()
    else:
        date_to = date.fromisoformat(date_to)

    return get_expense_by_category(db, bid, date_from, date_to)


@router.get("/accounts")
def accounts_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get accounts summary"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_accounts_summary(db, bid)


@router.get("/upcoming-debts")
def upcoming_debts(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get upcoming debt payments"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_upcoming_debts(db, bid, days)
