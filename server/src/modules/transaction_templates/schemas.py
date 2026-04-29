from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TransactionTemplateBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=100)
    transaction_type: str = Field(default="expense", pattern="^(income|expense)$")
    category_id: str
    amount: Optional[Decimal] = Field(default=None, gt=0)
    tags: Optional[str] = None


class TransactionTemplateCreate(TransactionTemplateBase):
    pass


class TransactionTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    transaction_type: Optional[str] = Field(default=None, pattern="^(income|expense)$")
    category_id: Optional[str] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    tags: Optional[str] = None
    is_active: Optional[bool] = None


class TransactionTemplateResponse(TransactionTemplateBase):
    id: str
    book_id: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
