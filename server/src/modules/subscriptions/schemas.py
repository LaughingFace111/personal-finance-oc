from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


AmountType = Literal["fixed", "variable"]


class SubscriptionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    amount_type: AmountType
    amount: Decimal = Field(..., ge=0)
    cycle_days: str = Field(..., min_length=1, max_length=20)
    next_due_date: date
    account_id: str


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    amount_type: Optional[AmountType] = None
    amount: Optional[Decimal] = Field(default=None, ge=0)
    cycle_days: Optional[str] = Field(default=None, min_length=1, max_length=20)
    next_due_date: Optional[date] = None
    account_id: Optional[str] = None


class SubscriptionResponse(SubscriptionBase):
    id: str
    book_id: str
    account_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpcomingBillResponse(BaseModel):
    id: str
    name: str
    amount_type: AmountType
    amount: Decimal
    cycle_days: str
    next_due_date: date
    account_id: str
    account_name: Optional[str] = None
    days_until_due: int
