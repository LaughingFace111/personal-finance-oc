from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.core import get_db, success_response
from src.core.auth import get_current_user
from src.modules.auth.models import User
from .schemas import TagCreate, TagUpdate, TagResponse, TagTreeNode
from .service import (
    create_tag, get_tags, get_tag, update_tag, delete_tag,
    get_first_level_tags, get_tags_tree
)
from src.modules.books.service import resolve_book_id


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    return resolve_book_id(db, current_user.id, book_id)


router = APIRouter(prefix="/tags", tags=["tags"])


@router.post("", response_model=TagResponse)
def create(
    data: TagCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create a new tag (first-level or second-level)"""
    bid = get_current_book_id(current_user, db, book_id)
    try:
        return create_tag(db, bid, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tree", response_model=List[TagTreeNode])
def list_tags_tree(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get tags as grouped tree structure (first-level + children)"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_tags_tree(db, bid)


@router.get("/first-level", response_model=List[TagResponse])
def list_first_level_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get only first-level tags (for parent selector)"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_first_level_tags(db, bid)


@router.get("", response_model=List[TagResponse])
def list_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    include_inactive: bool = False
):
    """Get all tags (flat list)"""
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
    try:
        tag = update_tag(db, tag_id, bid, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    """Delete a tag (soft delete, cascades to children if first-level)"""
    bid = get_current_book_id(current_user, db, book_id)
    if not delete_tag(db, tag_id, bid):
        raise HTTPException(status_code=404, detail="Tag not found")
    return success_response(message="Tag deleted")
