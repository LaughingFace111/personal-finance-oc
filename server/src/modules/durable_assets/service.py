import uuid
from datetime import date
from typing import List, Optional
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session
from .models import DurableAsset
from .schemas import DurableAssetCreate, DurableAssetUpdate


def _compute_derivatives(asset: DurableAsset) -> dict:
    """
    🛡️ L 的摊销算式 — 动态计算衍生指标，不落库
    Days_Used = (Retire_Date OR Today) - Purchase_Date
    Daily_Cost = Purchase_Price / max(1, Days_Used)  ← 除零兜底绝对不能省！
    """
    reference_date: date = (
        asset.retire_date
        if asset.is_retired and asset.retire_date
        else date.today()
    )
    delta = reference_date - asset.purchase_date
    days_used = max(1, delta.days)  # 🛡️ L: 除零兜底 — 当天购买也保证至少为1

    daily_cost = (
        (asset.purchase_price / Decimal(days_used))
        .quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    )

    return {
        "days_used": days_used,
        "daily_cost": daily_cost,
    }


def create_asset(db: Session, book_id: str, data: DurableAssetCreate) -> dict:
    asset = DurableAsset(
        id=str(uuid.uuid4()),
        book_id=book_id,
        name=data.name,
        purchase_price=data.purchase_price,
        purchase_date=data.purchase_date,
        is_retired=data.is_retired,
        retire_date=data.retire_date,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    result = _asset_to_dict(asset)
    result.update(_compute_derivatives(asset))
    return result


def get_assets(db: Session, book_id: str, include_retired: bool = False) -> List[dict]:
    query = db.query(DurableAsset).filter(DurableAsset.book_id == book_id)
    if not include_retired:
        query = query.filter(DurableAsset.is_retired == False)
    assets = query.order_by(DurableAsset.purchase_date.desc()).all()

    results = []
    for asset in assets:
        r = _asset_to_dict(asset)
        r.update(_compute_derivatives(asset))
        results.append(r)
    return results


def get_asset(db: Session, asset_id: str, book_id: str) -> Optional[dict]:
    asset = db.query(DurableAsset).filter(
        DurableAsset.id == asset_id,
        DurableAsset.book_id == book_id
    ).first()
    if not asset:
        return None
    r = _asset_to_dict(asset)
    r.update(_compute_derivatives(asset))
    return r


def update_asset(db: Session, asset_id: str, book_id: str, data: DurableAssetUpdate) -> Optional[dict]:
    asset = db.query(DurableAsset).filter(
        DurableAsset.id == asset_id,
        DurableAsset.book_id == book_id
    ).first()
    if not asset:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(asset, key, value)

    db.commit()
    db.refresh(asset)

    r = _asset_to_dict(asset)
    r.update(_compute_derivatives(asset))
    return r


def delete_asset(db: Session, asset_id: str, book_id: str) -> bool:
    asset = db.query(DurableAsset).filter(
        DurableAsset.id == asset_id,
        DurableAsset.book_id == book_id
    ).first()
    if not asset:
        return False
    db.delete(asset)
    db.commit()
    return True


def _asset_to_dict(asset: DurableAsset) -> dict:
    return {
        "id": asset.id,
        "book_id": asset.book_id,
        "name": asset.name,
        "purchase_price": asset.purchase_price,
        "purchase_date": asset.purchase_date,
        "is_retired": asset.is_retired,
        "retire_date": asset.retire_date,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
    }
