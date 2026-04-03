from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field
from decimal import Decimal


class DurableAssetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    purchase_price: Decimal = Field(..., gt=0)
    purchase_date: date
    is_retired: bool = False
    retire_date: Optional[date] = None


class DurableAssetCreate(DurableAssetBase):
    pass


class DurableAssetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    purchase_price: Optional[Decimal] = Field(None, gt=0)
    purchase_date: Optional[date] = None
    is_retired: Optional[bool] = None
    retire_date: Optional[date] = None


class DurableAssetResponse(DurableAssetBase):
    id: str
    book_id: str
    created_at: datetime
    updated_at: datetime
    # 🛡️ L: 衍生字段（由 Service 层注入，不落库）
    days_used: int = 0
    daily_cost: Decimal = Decimal("0.00")

    class Config:
        from_attributes = True
