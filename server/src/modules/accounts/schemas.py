from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field
from src.common.enums import AccountType


class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    account_type: AccountType
    institution_name: Optional[str] = None
    card_last4: Optional[str] = None
    credit_limit: Optional[Decimal] = Field(default=Decimal("0"), ge=0)
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    opening_balance: Decimal = Field(default=Decimal("0"))
    current_balance: Decimal = Field(default=Decimal("0"))
    currency: str = "CNY"
    note: Optional[str] = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    institution_name: Optional[str] = None
    card_last4: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    note: Optional[str] = None
    is_active: Optional[bool] = None


class AccountResponse(AccountBase):
    id: str
    book_id: str
    debt_amount: Decimal = Field(default=Decimal("0"))
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Account balance response
class AccountBalanceResponse(BaseModel):
    account_id: str
    account_name: str
    account_type: AccountType
    current_balance: Decimal
    debt_amount: Decimal
    credit_limit: Optional[Decimal] = None
