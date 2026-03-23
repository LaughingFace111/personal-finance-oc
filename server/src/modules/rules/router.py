from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import CategoryRuleCreate, CategoryRuleResponse, CategoryRuleUpdate
from .service import bootstrap_default_rule_assets, create_rule, delete_rule, get_rule, get_rules, update_rule
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/rules", tags=["rules"])


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
        raise HTTPException(status_code=404, detail="No default book found")
    return default_book.id


@router.post("", response_model=CategoryRuleResponse)
def create(
    data: CategoryRuleCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Create keyword rule"""
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return create_rule(db, bid, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=List[CategoryRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    is_active: bool = None
):
    """Get keyword rules"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_rules(db, bid, is_active)


@router.get("/{rule_id}", response_model=CategoryRuleResponse)
def get(
    rule_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get rule by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    rule = get_rule(db, rule_id, bid)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/{rule_id}", response_model=CategoryRuleResponse)
def update(
    rule_id: str, 
    data: CategoryRuleUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Update rule"""
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return update_rule(db, rule_id, bid, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{rule_id}")
def delete(
    rule_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Delete rule"""
    bid = get_current_book_id(current_user, db, book_id)
    delete_rule(db, rule_id, bid)
    return {"message": "Rule deleted"}


@router.post("/bootstrap-defaults")
def bootstrap_defaults(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Ensure default tags and keyword rules exist"""
    bid = get_current_book_id(current_user, db, book_id)
    return bootstrap_default_rule_assets(db, bid)
