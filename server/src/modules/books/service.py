from typing import List, Optional

from sqlalchemy.orm import Session

from src.core import ErrorCode, AppException, generate_uuid, NotFoundException

from .models import Book
from .schemas import BookCreate, BookUpdate


def create_book(db: Session, user_id: str, data: BookCreate) -> Book:
    """Create new book"""
    # Check if name exists for this user
    existing = db.query(Book).filter(
        Book.user_id == user_id,
        Book.name == data.name
    ).first()
    if existing:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="Book name already exists")

    # Check if this is the first book (make it default)
    is_first = db.query(Book).filter(Book.user_id == user_id).count() == 0

    book = Book(
        id=generate_uuid(),
        user_id=user_id,
        name=data.name,
        description=data.description,
        currency=data.currency,
        is_default=is_first,
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def get_books(db: Session, user_id: str) -> List[Book]:
    """Get all books for user"""
    return db.query(Book).filter(Book.user_id == user_id).all()


def get_book(db: Session, book_id: str, user_id: str) -> Optional[Book]:
    """Get book by ID"""
    return db.query(Book).filter(
        Book.id == book_id,
        Book.user_id == user_id
    ).first()


def get_default_book(db: Session, user_id: str) -> Optional[Book]:
    """Get default book for user"""
    return db.query(Book).filter(
        Book.user_id == user_id,
        Book.is_default == True
    ).first()


def update_book(db: Session, book_id: str, user_id: str, data: BookUpdate) -> Book:
    """Update book"""
    book = get_book(db, book_id, user_id)
    if not book:
        raise NotFoundException("Book not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(book, key, value)

    db.commit()
    db.refresh(book)
    return book


def delete_book(db: Session, book_id: str, user_id: str) -> None:
    """Delete book"""
    book = get_book(db, book_id, user_id)
    if not book:
        raise NotFoundException("Book not found")

    db.delete(book)
    db.commit()
