from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from src.core import get_db, success_response
from .schemas import TagCreate, TagUpdate, TagResponse
from .service import create_tag, get_tags, get_tag, update_tag, delete_tag


def get_current_book_id(book_id: Optional[str] = None):
    """Get current book_id from query param or return None"""
    return book_id


router = APIRouter(prefix="/tags", tags=["tags"])


@router.post("", response_model=TagResponse)
def create(data: TagCreate, book_id: str, db: Session = Depends(get_db)):
    """Create a new tag"""
    return create_tag(db, book_id, data)


@router.get("", response_model=List[TagResponse])
def list_tags(book_id: str, include_inactive: bool = False, db: Session = Depends(get_db)):
    """Get all tags"""
    return get_tags(db, book_id, include_inactive)


@router.get("/{tag_id}", response_model=TagResponse)
def get(tag_id: str, db: Session = Depends(get_db)):
    """Get a tag by ID"""
    tag = get_tag(db, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
def update(tag_id: str, data: TagUpdate, db: Session = Depends(get_db)):
    """Update a tag"""
    tag = update_tag(db, tag_id, data)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.delete("/{tag_id}")
def delete(tag_id: str, db: Session = Depends(get_db)):
    """Delete a tag"""
    if not delete_tag(db, tag_id):
        raise HTTPException(status_code=404, detail="Tag not found")
    return success_response(message="Tag deleted")
