from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class BudgetCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    period_type: Literal["monthly", "custom_range"]
    amount: Decimal = Field(..., gt=0)
    start_date: date
    end_date: date
    note: str | None = None


class BudgetUpdateSchema(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    amount: Decimal | None = Field(None, gt=0)
    start_date: date | None = None
    end_date: date | None = None
    status: Literal["active", "archived"] | None = None
    note: str | None = None


class BudgetSchema(BaseModel):
    id: str
    book_id: str
    name: str
    period_type: str
    amount: Decimal
    start_date: date
    end_date: date
    status: str
    note: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetSummarySchema(BaseModel):
    id: str
    name: str
    period_type: str
    amount: Decimal
    start_date: date
    end_date: date
    status: str
    spent_amount: Decimal
    remaining_amount: Decimal
    usage_ratio: float
    alert_status: str


class BudgetBreakdownItemSchema(BaseModel):
    id: str
    occurred_at: datetime
    transaction_type: str
    merchant: str | None
    note: str | None
    category_id: str | None
    category_name: str | None
    amount: Decimal
    impact_amount: Decimal
    related_transaction_id: str | None = None


class BudgetBreakdownSchema(BaseModel):
    budget_id: str
    gross_expense: Decimal
    refund_deduction: Decimal
    net_expense: Decimal
    transactions: list[BudgetBreakdownItemSchema]

