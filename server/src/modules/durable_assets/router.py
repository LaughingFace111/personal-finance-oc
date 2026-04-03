from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from .schemas import DurableAssetCreate, DurableAssetUpdate
from .service import (
    create_asset,
    get_assets,
    get_asset,
    update_asset,
    delete_asset,
)
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/durable-assets", tags=["durable-assets"])


def get_current_book_id(db: Session, current_user: User, book_id: str = None) -> str:
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        from src.modules.books.service import create_book
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


@router.post("", response_model=dict)
def create(
    data: DurableAssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """创建大件资产记录"""
    bid = get_current_book_id(db, current_user, book_id)
    return create_asset(db, bid, data)


@router.get("", response_model=List[dict])
def list_assets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    include_retired: bool = Query(False, description="是否包含已退役资产")
):
    """获取大件资产列表（附带实时衍生的 days_used 和 daily_cost）"""
    bid = get_current_book_id(db, current_user, book_id)
    return get_assets(db, bid, include_retired)


@router.get("/{asset_id}", response_model=dict)
def get(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    item = get_asset(db, asset_id, bid)
    if not item:
        raise HTTPException(status_code=404, detail="Asset not found")
    return item


@router.patch("/{asset_id}", response_model=dict)
def update(
    asset_id: str,
    data: DurableAssetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    item = update_asset(db, asset_id, bid, data)
    if not item:
        raise HTTPException(status_code=404, detail="Asset not found")
    return item


@router.delete("/{asset_id}")
def delete(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    bid = get_current_book_id(db, current_user, book_id)
    if not delete_asset(db, asset_id, bid):
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"message": "Asset deleted"}
