from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.core import get_db, success_response
from src.core.auth import get_current_user
from src.modules.auth.models import User
from .schemas import TagCreate, TagUpdate, TagResponse
from .service import create_tag, get_tags, get_tag, update_tag, delete_tag
from src.modules.books.service import get_default_book


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
        from src.modules.books.service import create_book
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


router = APIRouter(prefix="/tags", tags=["tags"])


@router.post("", response_model=TagResponse)
def create(
    data: TagCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create a new tag"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_tag(db, bid, data)


@router.get("", response_model=List[TagResponse])
def list_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    include_inactive: bool = False
):
    """Get all tags"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_tags(db, bid, include_inactive)


@router.get("/{tag_id}", response_model=TagResponse)
def get(
    tag_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get a tag by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    tag = get_tag(db, tag_id, bid)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
def update(
    tag_id: str, 
    data: TagUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update a tag"""
    bid = get_current_book_id(current_user, db, book_id)
    tag = update_tag(db, tag_id, bid, data)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.delete("/{tag_id}")
def delete(
    tag_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Delete a tag"""
    bid = get_current_book_id(current_user, db, book_id)
    if not delete_tag(db, tag_id, bid):
        raise HTTPException(status_code=404, detail="Tag not found")
    return success_response(message="Tag deleted")
