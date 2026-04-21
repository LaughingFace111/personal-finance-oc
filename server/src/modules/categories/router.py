from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import CategoryCreate, CategoryResponse, CategoryUpdate
from .service import (
    create_category, delete_category, get_category, get_categories,
    get_category_tree, update_category, get_frequent_categories
)

router = APIRouter(prefix="/categories", tags=["categories"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    if book_id:
        return book_id
    from src.modules.books.service import get_default_book, create_book
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


@router.post("", response_model=CategoryResponse)
def create(
    data: CategoryCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create new category"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_category(db, bid, data)


@router.get("", response_model=List[CategoryResponse])
def list_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    category_type: str = None,
    include_inactive: bool = False
):
    """Get all categories"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_categories(db, bid, category_type, include_inactive)


@router.get("/frequent", response_model=List[CategoryResponse])
def list_frequent_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    limit: int = 10
):
    """Get frequently used categories from the last 90 days"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_frequent_categories(db, bid, limit)


@router.get("/tree", response_model=List[dict])
def list_category_tree(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    category_type: str = None
):
    """Get category tree"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_category_tree(db, bid, category_type)


@router.get("/{category_id}", response_model=CategoryResponse)
def get(
    category_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get category by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    category = get_category(db, category_id, bid)
    if not category:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.patch("/{category_id}", response_model=CategoryResponse)
def update(
    category_id: str, 
    data: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update category"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_category(db, category_id, bid, data)


@router.delete("/{category_id}")
def delete(
    category_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Soft delete category"""
    bid = get_current_book_id(current_user, db, book_id)
    delete_category(db, category_id, bid)
    return {"message": "Category deleted"}
