from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class BudgetCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    period_type: Literal["monthly", "custom_range"]
    dimension_type: Literal["overall", "category", "tag"] = "overall"
    amount: Decimal = Field(..., gt=0)
    start_date: date
    end_date: date
    category_id: str | None = None
    tag_id: str | None = None
    rollup_children: bool = True
    note: str | None = None


class BudgetUpdateSchema(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    dimension_type: Literal["overall", "category", "tag"] | None = None
    amount: Decimal | None = Field(None, gt=0)
    start_date: date | None = None
    end_date: date | None = None
    category_id: str | None = None
    tag_id: str | None = None
    rollup_children: bool | None = None
    status: Literal["active", "archived"] | None = None
    note: str | None = None


class BudgetSchema(BaseModel):
    id: str
    book_id: str
    name: str
    period_type: str
    dimension_type: str
    amount: Decimal
    start_date: date
    end_date: date
    category_id: str | None
    category_name: str | None = None
    tag_id: str | None
    tag_name: str | None = None
    rollup_children: bool
    status: str
    note: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetCategoryBreakdownItemSchema(BaseModel):
    category_id: str | None
    category_name: str | None
    gross_amount: Decimal
    refund_deduction: Decimal
    net_amount: Decimal


class BudgetSummarySchema(BaseModel):
    id: str
    name: str
    period_type: str
    dimension_type: str
    amount: Decimal
    start_date: date
    end_date: date
    category_id: str | None
    category_name: str | None = None
    tag_id: str | None
    tag_name: str | None = None
    rollup_children: bool
    status: str
    spent_amount: Decimal
    remaining_amount: Decimal
    usage_ratio: float
    alert_status: str
    category_breakdown: list[BudgetCategoryBreakdownItemSchema] = Field(default_factory=list)


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
    dimension_type: str
    category_id: str | None
    category_name: str | None = None
    tag_id: str | None
    tag_name: str | None = None
    rollup_children: bool
    gross_expense: Decimal
    refund_deduction: Decimal
    net_expense: Decimal
    category_breakdown: list[BudgetCategoryBreakdownItemSchema]
    transactions: list[BudgetBreakdownItemSchema]
