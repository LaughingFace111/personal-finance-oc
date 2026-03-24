from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book

from .schemas import ImportTemplateCreate, ImportTemplateResponse, ImportTemplateUpdate
from .service import (
    create_import_template,
    delete_import_template,
    get_import_template,
    get_import_templates,
    update_import_template,
)

router = APIRouter(prefix="/import-templates", tags=["import_templates"])


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


@router.post("", response_model=ImportTemplateResponse)
def create(
    data: ImportTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return create_import_template(db, bid, data)


@router.get("", response_model=List[ImportTemplateResponse])
def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    is_active: bool = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_import_templates(db, bid, is_active)


@router.get("/{template_id}", response_model=ImportTemplateResponse)
def get(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    template = get_import_template(db, template_id, bid)
    if not template:
        raise HTTPException(status_code=404, detail="Import template not found")
    return template


@router.patch("/{template_id}", response_model=ImportTemplateResponse)
def update(
    template_id: str,
    data: ImportTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return update_import_template(db, template_id, bid, data)


@router.delete("/{template_id}")
def delete(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    delete_import_template(db, template_id, bid)
    return {"message": "Import template deleted"}
