from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from src.common.enums import ReimbursementStatus as ReimbursementStatusEnum


class ReimbursementRequestBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_transaction_id: Optional[str] = None
    contact_name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    occurred_at: datetime


class ReimbursementRequestCreate(ReimbursementRequestBase):
    pass


class ReimbursementRequestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contact_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1)
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[str] = None
    occurred_at: Optional[datetime] = None


class ReimbursementRequestResponse(ReimbursementRequestBase):
    id: str
    book_id: str
    status: ReimbursementStatusEnum = ReimbursementStatusEnum.PENDING
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
