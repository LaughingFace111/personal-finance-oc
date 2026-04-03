from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from .schemas import WishlistItemCreate, WishlistItemUpdate, WishlistItemResponse
from .service import (
    create_wishlist_item,
    get_wishlist_items,
    get_wishlist_item,
    update_wishlist_item,
    delete_wishlist_item,
)
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/wishlists", tags=["wishlists"])


def get_current_book_id(db: Session, current_user: User, book_id: str = None) -> str:
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        from src.modules.books.service import create_book
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


@router.post("", response_model=WishlistItemResponse)
def create(
    data: WishlistItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    return create_wishlist_item(db, bid, data)


@router.get("", response_model=List[WishlistItemResponse])
def list_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    status: Optional[str] = Query(None, description="Filter by status: pending or purchased")
):
    bid = get_current_book_id(db, current_user, book_id)
    return get_wishlist_items(db, bid, status)


@router.get("/{item_id}", response_model=WishlistItemResponse)
def get(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    item = get_wishlist_item(db, item_id, bid)
    if not item:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    return item


@router.patch("/{item_id}", response_model=WishlistItemResponse)
def update(
    item_id: str,
    data: WishlistItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    item = update_wishlist_item(db, item_id, bid, data)
    if not item:
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    return item


@router.delete("/{item_id}")
def delete(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    if not delete_wishlist_item(db, item_id, bid):
        raise HTTPException(status_code=404, detail="Wishlist item not found")
    return {"message": "Item deleted"}
