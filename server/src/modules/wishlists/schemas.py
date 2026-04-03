from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from decimal import Decimal


class WishlistItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    url: Optional[str] = None
    target_price: Optional[Decimal] = Field(None, ge=0)
    status: str = Field(default="pending")  # pending | purchased


class WishlistItemCreate(WishlistItemBase):
    pass


class WishlistItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    url: Optional[str] = None
    target_price: Optional[Decimal] = Field(None, ge=0)
    status: Optional[str] = None


class WishlistItemResponse(WishlistItemBase):
    id: str
    book_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
