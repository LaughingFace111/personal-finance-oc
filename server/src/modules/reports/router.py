from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book, create_book

from .service import (
    get_account_balance_trend,
    get_overview,
    get_expense_by_category,
    get_income_by_category,
    get_accounts_summary,
    get_upcoming_debts,
    get_daily_summary,
    get_monthly_comparison,
    get_period_comparison,
    get_category_monthly_insight,
    get_tags_by_category,
    get_tag_detail,
)

from datetime import date, timedelta

router = APIRouter(prefix="/reports", tags=["reports"])


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


@router.get("/account-balance-trend")
def account_balance_trend(
    range: int = 30,
    account_id: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    """Get account balance trend report"""
    bid = get_current_book_id(current_user, db, book_id)

    try:
        return get_account_balance_trend(db, bid, account_id=account_id, days=range)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "Account not found" else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


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


@router.get("/daily-summary")
def daily_summary(
    date_from: str = None,
    date_to: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get daily income and expense summary"""
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

    return get_daily_summary(db, bid, date_from, date_to)


@router.get("/income-by-category")
def income_by_category(
    date_from: str = None,
    date_to: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get income breakdown by category"""
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

    return get_income_by_category(db, bid, date_from, date_to)


@router.get("/monthly-comparison")
def monthly_comparison(
    year: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get monthly income/expense comparison for a year"""
    bid = get_current_book_id(current_user, db, book_id)

    if not year:
        today = date.today()
        year = today.year

    return get_monthly_comparison(db, bid, year)


@router.get("/period-comparison")
def period_comparison(
    year: int,
    month: int,
    type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    """Get monthly MoM/YoY comparison for a metric"""
    bid = get_current_book_id(current_user, db, book_id)

    try:
        return get_period_comparison(db, bid, year, month, type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/category-insight")
def category_insight(
    category_id: str,
    year: int,
    month: int,
    direction: str = "expense",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    """Get category monthly insight"""
    bid = get_current_book_id(current_user, db, book_id)

    try:
        return get_category_monthly_insight(db, bid, category_id, year, month, direction)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "Category not found" else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/tags-by-category")
def tags_by_category(
    direction: str,
    date_from: str = None,
    date_to: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get tag distribution report"""
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

    try:
        return get_tags_by_category(db, bid, date_from, date_to, direction)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tag-detail")
def tag_detail(
    tag_id: str,
    direction: str,
    date_from: str = None,
    date_to: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get tag detail report"""
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

    try:
        return get_tag_detail(db, bid, tag_id, date_from, date_to, direction)
    except ValueError as exc:
        status_code = 404 if str(exc) == "Tag not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
