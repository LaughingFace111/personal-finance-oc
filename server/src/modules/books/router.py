from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import BookCreate, BookResponse, BookUpdate
from .service import create_book, delete_book, get_book, get_books, update_book, get_default_book

router = APIRouter(prefix="/books", tags=["books"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: Optional[str] = None
) -> str:
    """Get current book ID from user or parameter"""
    if book_id:
        return book_id
    # Get or create default book
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        # Create default book
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


@router.post("", response_model=BookResponse)
def create(data: BookCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create new book"""
    return create_book(db, current_user.id, data)


@router.get("", response_model=List[BookResponse])
def list_books(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all books"""
    return get_books(db, current_user.id)


@router.get("/default", response_model=BookResponse)
def get_default(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get or create default book"""
    book = get_default_book(db, current_user.id)
    if not book:
        book = create_book(db, current_user.id, {"name": "默认账本"})
    return book


@router.get("/{book_id}", response_model=BookResponse)
def get(book_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get book by ID"""
    book = get_book(db, book_id, current_user.id)
    if not book:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.patch("/{book_id}", response_model=BookResponse)
def update(book_id: str, data: BookUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update book"""
    return update_book(db, book_id, current_user.id, data)


@router.delete("/{book_id}")
def delete(book_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete book"""
    delete_book(db, book_id, current_user.id)
    return {"message": "Book deleted"}
