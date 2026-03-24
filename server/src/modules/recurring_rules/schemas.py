from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from src.common.enums import TransactionDirection, TransactionType


class RecurringRuleBase(BaseModel):
    rule_name: str
    transaction_type: TransactionType
    direction: TransactionDirection
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    account_id: str
    counterparty_account_id: Optional[str] = None
    category_id: Optional[str] = None
    merchant: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[str] = None
    extra: Optional[str] = None
    schedule_type: str = "monthly"
    interval_value: int = Field(default=1, gt=0)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    start_date: date
    end_date: Optional[date] = None
    auto_confirm: bool = False


class RecurringRuleCreate(RecurringRuleBase):
    pass


class RecurringRuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    transaction_type: Optional[TransactionType] = None
    direction: Optional[TransactionDirection] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    currency: Optional[str] = None
    account_id: Optional[str] = None
    counterparty_account_id: Optional[str] = None
    category_id: Optional[str] = None
    merchant: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[str] = None
    extra: Optional[str] = None
    schedule_type: Optional[str] = None
    interval_value: Optional[int] = Field(default=None, gt=0)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    next_occurs_on: Optional[date] = None
    auto_confirm: Optional[bool] = None
    is_active: Optional[bool] = None


class RecurringRuleResponse(RecurringRuleBase):
    id: str
    book_id: str
    next_occurs_on: date
    last_generated_on: Optional[date] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
