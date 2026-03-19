import uuid
from typing import List, Optional
from sqlalchemy.orm import Session
from .models import Tag
from .schemas import TagCreate, TagUpdate


def create_tag(db: Session, book_id: str, tag_data: TagCreate) -> Tag:
    tag = Tag(
        id=str(uuid.uuid4()),
        book_id=book_id,
        name=tag_data.name,
        color=tag_data.color,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def get_tags(db: Session, book_id: str, include_inactive: bool = False) -> List[Tag]:
    query = db.query(Tag).filter(Tag.book_id == book_id)
    if not include_inactive:
        query = query.filter(Tag.is_active == True)
    return query.order_by(Tag.name).all()


def get_tag(db: Session, tag_id: str, book_id: str = None) -> Optional[Tag]:
    query = db.query(Tag).filter(Tag.id == tag_id)
    if book_id:
        query = query.filter(Tag.book_id == book_id)
    return query.first()


def update_tag(db: Session, tag_id: str, book_id: str, tag_data: TagUpdate) -> Optional[Tag]:
    tag = get_tag(db, tag_id, book_id)
    if not tag:
        return None
    for key, value in tag_data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag_id: str, book_id: str = None) -> bool:
    tag = get_tag(db, tag_id, book_id)
    if not tag:
        return False
    # Soft delete - set is_active to False instead of hard delete
    tag.is_active = False
    db.commit()
    return True
