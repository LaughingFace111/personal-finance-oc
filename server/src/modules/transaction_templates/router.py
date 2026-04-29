from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book

from .schemas import (
    TransactionTemplateCreate,
    TransactionTemplateResponse,
    TransactionTemplateUpdate,
)
from .service import (
    create_transaction_template,
    delete_transaction_template,
    get_transaction_template,
    get_transaction_templates,
    update_transaction_template,
)

router = APIRouter(prefix="/transaction-templates", tags=["transaction_templates"])


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


@router.post("", response_model=TransactionTemplateResponse)
def create(
    data: TransactionTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return create_transaction_template(db, bid, data)


@router.get("", response_model=List[TransactionTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    is_active: bool = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_transaction_templates(db, bid, is_active)


@router.get("/{template_id}", response_model=TransactionTemplateResponse)
def get(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    template = get_transaction_template(db, template_id, bid)
    if not template:
        raise HTTPException(status_code=404, detail="Transaction template not found")
    return template


@router.patch("/{template_id}", response_model=TransactionTemplateResponse)
def update(
    template_id: str,
    data: TransactionTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return update_transaction_template(db, template_id, bid, data)


@router.delete("/{template_id}")
def delete(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    delete_transaction_template(db, template_id, bid)
    return {"message": "Transaction template deleted"}
