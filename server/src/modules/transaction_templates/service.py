from typing import List, Optional

from sqlalchemy.orm import Session

from src.core import NotFoundException, generate_uuid
from src.modules.categories.models import Category

from .models import TransactionTemplate
from .schemas import TransactionTemplateCreate, TransactionTemplateUpdate


def create_transaction_template(
    db: Session,
    book_id: str,
    data: TransactionTemplateCreate,
) -> TransactionTemplate:
    _ensure_category_exists(db, book_id, data.category_id)

    template = TransactionTemplate(
        id=generate_uuid(),
        book_id=book_id,
        **data.model_dump(),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def get_transaction_templates(
    db: Session,
    book_id: str,
    is_active: bool | None = None,
) -> List[TransactionTemplate]:
    query = db.query(TransactionTemplate).filter(TransactionTemplate.book_id == book_id)
    if is_active is not None:
        query = query.filter(TransactionTemplate.is_active == is_active)
    return query.order_by(TransactionTemplate.updated_at.desc()).all()


def get_transaction_template(
    db: Session,
    template_id: str,
    book_id: str,
) -> Optional[TransactionTemplate]:
    return db.query(TransactionTemplate).filter(
        TransactionTemplate.id == template_id,
        TransactionTemplate.book_id == book_id,
    ).first()


def update_transaction_template(
    db: Session,
    template_id: str,
    book_id: str,
    data: TransactionTemplateUpdate,
) -> TransactionTemplate:
    template = get_transaction_template(db, template_id, book_id)
    if not template:
        raise NotFoundException("Transaction template not found")

    payload = data.model_dump(exclude_unset=True)
    category_id = payload.get("category_id")
    if category_id:
        _ensure_category_exists(db, book_id, category_id)

    for key, value in payload.items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


def delete_transaction_template(db: Session, template_id: str, book_id: str) -> None:
    template = get_transaction_template(db, template_id, book_id)
    if not template:
        raise NotFoundException("Transaction template not found")

    db.delete(template)
    db.commit()


def _ensure_category_exists(db: Session, book_id: str, category_id: str) -> None:
    exists = db.query(Category.id).filter(
        Category.id == category_id,
        Category.book_id == book_id,
    ).first()
    if not exists:
        raise NotFoundException("Category not found")
