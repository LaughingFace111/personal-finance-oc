import uuid
from typing import List, Optional
from sqlalchemy.orm import Session
from .models import WishlistItem
from .schemas import WishlistItemCreate, WishlistItemUpdate


def create_wishlist_item(db: Session, book_id: str, data: WishlistItemCreate) -> WishlistItem:
    item = WishlistItem(
        id=str(uuid.uuid4()),
        book_id=book_id,
        name=data.name,
        url=data.url,
        target_price=data.target_price,
        status=data.status,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_wishlist_items(db: Session, book_id: str, status: Optional[str] = None) -> List[WishlistItem]:
    query = db.query(WishlistItem).filter(WishlistItem.book_id == book_id)
    if status:
        query = query.filter(WishlistItem.status == status)
    return query.order_by(WishlistItem.created_at.desc()).all()


def get_wishlist_item(db: Session, item_id: str, book_id: str) -> Optional[WishlistItem]:
    return db.query(WishlistItem).filter(
        WishlistItem.id == item_id,
        WishlistItem.book_id == book_id
    ).first()


def update_wishlist_item(db: Session, item_id: str, book_id: str, data: WishlistItemUpdate) -> Optional[WishlistItem]:
    item = get_wishlist_item(db, item_id, book_id)
    if not item:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_wishlist_item(db: Session, item_id: str, book_id: str) -> bool:
    item = get_wishlist_item(db, item_id, book_id)
    if not item:
        return False
    db.delete(item)
    db.commit()
    return True
