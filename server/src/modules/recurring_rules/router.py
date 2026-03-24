from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book

from .schemas import RecurringRuleCreate, RecurringRuleResponse, RecurringRuleUpdate
from .service import create_recurring_rule, delete_recurring_rule, get_recurring_rule, get_recurring_rules, update_recurring_rule

router = APIRouter(prefix="/recurring-rules", tags=["recurring_rules"])


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


@router.post("", response_model=RecurringRuleResponse)
def create(
    data: RecurringRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return create_recurring_rule(db, bid, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=List[RecurringRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    is_active: bool = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_recurring_rules(db, bid, is_active)


@router.get("/{rule_id}", response_model=RecurringRuleResponse)
def get(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    rule = get_recurring_rule(db, rule_id, bid)
    if not rule:
        raise HTTPException(status_code=404, detail="Recurring rule not found")
    return rule


@router.patch("/{rule_id}", response_model=RecurringRuleResponse)
def update(
    rule_id: str,
    data: RecurringRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return update_recurring_rule(db, rule_id, bid, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{rule_id}")
def delete(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    delete_recurring_rule(db, rule_id, bid)
    return {"message": "Recurring rule deleted"}
