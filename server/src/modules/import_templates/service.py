from typing import List, Optional

from sqlalchemy.orm import Session

from src.core import NotFoundException, generate_uuid

from .models import ImportTemplate
from .schemas import ImportTemplateCreate, ImportTemplateUpdate


def create_import_template(db: Session, book_id: str, data: ImportTemplateCreate) -> ImportTemplate:
    template = ImportTemplate(
        id=generate_uuid(),
        book_id=book_id,
        **data.model_dump(),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def get_import_templates(db: Session, book_id: str, is_active: bool = None) -> List[ImportTemplate]:
    query = db.query(ImportTemplate).filter(ImportTemplate.book_id == book_id)
    if is_active is not None:
        query = query.filter(ImportTemplate.is_active == is_active)
    return query.order_by(ImportTemplate.updated_at.desc()).all()


def get_import_template(db: Session, template_id: str, book_id: str) -> Optional[ImportTemplate]:
    return db.query(ImportTemplate).filter(
        ImportTemplate.id == template_id,
        ImportTemplate.book_id == book_id,
    ).first()


def update_import_template(
    db: Session, template_id: str, book_id: str, data: ImportTemplateUpdate
) -> ImportTemplate:
    template = get_import_template(db, template_id, book_id)
    if not template:
        raise NotFoundException("Import template not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


def delete_import_template(db: Session, template_id: str, book_id: str) -> None:
    template = get_import_template(db, template_id, book_id)
    if not template:
        raise NotFoundException("Import template not found")

    db.delete(template)
    db.commit()
