from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import create_book, get_default_book
from src.modules.books.schemas import BookCreate

from .schemas import (
    BudgetBreakdownSchema,
    BudgetCreateSchema,
    BudgetSchema,
    BudgetSummarySchema,
    BudgetUpdateSchema,
)
from .service import (
    create_budget,
    delete_budget,
    get_budget,
    get_budget_breakdown,
    get_budget_summary,
    get_budgets,
    update_budget,
)

router = APIRouter(prefix="/budgets", tags=["budgets"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
) -> str:
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        default_book = create_book(db, current_user.id, BookCreate(name="默认账本"))
    return default_book.id


@router.get("", response_model=list[BudgetSummarySchema])
def list_budgets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_budgets(db, bid)


@router.post("", response_model=BudgetSchema)
def create(
    data: BudgetCreateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return create_budget(db, bid, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{budget_id}", response_model=BudgetSchema)
def detail(
    budget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return get_budget(db, budget_id, bid)
    except ValueError as exc:
        status_code = 404 if str(exc) == "Budget not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.patch("/{budget_id}", response_model=BudgetSchema)
def update(
    budget_id: str,
    data: BudgetUpdateSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return update_budget(db, budget_id, bid, data)
    except ValueError as exc:
        status_code = 404 if str(exc) == "Budget not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.delete("/{budget_id}")
def remove(
    budget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    if not delete_budget(db, budget_id, bid):
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted"}


@router.get("/{budget_id}/summary", response_model=BudgetSummarySchema)
def summary(
    budget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return get_budget_summary(db, budget_id, bid)
    except ValueError as exc:
        status_code = 404 if str(exc) == "Budget not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.get("/{budget_id}/breakdown", response_model=BudgetBreakdownSchema)
def breakdown(
    budget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return get_budget_breakdown(db, budget_id, bid)
    except ValueError as exc:
        status_code = 404 if str(exc) == "Budget not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
