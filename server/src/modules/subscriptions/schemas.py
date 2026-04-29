from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field


AmountType = Literal["fixed", "variable"]
FrequencyUnit = Literal["weekly", "monthly", "yearly", "custom_days"]


class SubscriptionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    amount_type: AmountType
    amount: Decimal = Field(..., ge=0)
    frequency_unit: FrequencyUnit
    frequency_interval: int = Field(..., ge=1)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    due_anchor_date: date
    next_payment_date: date
    account_id: str


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    amount_type: Optional[AmountType] = None
    amount: Optional[Decimal] = Field(default=None, ge=0)
    frequency_unit: Optional[FrequencyUnit] = None
    frequency_interval: Optional[int] = Field(default=None, ge=1)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    due_anchor_date: Optional[date] = None
    next_payment_date: Optional[date] = None
    account_id: Optional[str] = None


class SubscriptionResponse(SubscriptionBase):
    id: str
    book_id: str
    account_name: Optional[str] = None
    cadence_label: str
    due_detail: str
    days_until_payment: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpcomingBillResponse(BaseModel):
    id: str
    name: str
    amount_type: AmountType
    amount: Decimal
    frequency_unit: FrequencyUnit
    frequency_interval: int
    day_of_month: Optional[int] = None
    due_anchor_date: date
    next_payment_date: date
    account_id: str
    account_name: Optional[str] = None
    cadence_label: str
    due_detail: str
    days_until_payment: int
