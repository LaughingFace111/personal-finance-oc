from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field
from src.common.enums import PlanStatus


# Installment Plan schemas
class InstallmentPlanBase(BaseModel):
    account_id: str
    transaction_id: Optional[str] = None
    plan_name: Optional[str] = None
    total_amount: Decimal = Field(..., gt=0)
    total_periods: int = Field(..., gt=0)
    principal_per_period: Decimal = Field(..., gt=0)
    fee_per_period: Decimal = Field(default=Decimal("0"), ge=0)
    total_fee: Decimal = Field(default=Decimal("0"), ge=0)
    start_date: date
    first_repayment_date: Optional[date] = None
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    early_settlement_supported: bool = True


class InstallmentPlanCreate(InstallmentPlanBase):
    pass


class InstallmentPlanUpdate(BaseModel):
    plan_name: Optional[str] = None
    status: Optional[PlanStatus] = None
    current_period: Optional[int] = None


class InstallmentPlanResponse(InstallmentPlanBase):
    id: str
    book_id: str
    current_period: int = 1
    status: PlanStatus = PlanStatus.ACTIVE
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Installment Schedule schemas
class InstallmentScheduleResponse(BaseModel):
    id: str
    installment_plan_id: str
    period_no: int
    due_date: date
    principal_amount: Decimal
    fee_amount: Decimal
    total_due: Decimal
    paid_amount: Decimal = Decimal("0")
    paid_at: Optional[datetime] = None
    payment_transaction_id: Optional[str] = None
    status: str = "pending"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Create installment with transaction
class CreateInstallmentRequest(BaseModel):
    occurred_at: datetime
    account_id: str  # Credit card/account
    merchant: Optional[str] = None
    category_id: Optional[str] = None
    note: Optional[str] = None
    # Plan details
    total_amount: Decimal = Field(..., gt=0)
    total_periods: int = Field(..., gt=0, le=36)
    fee_per_period: Decimal = Field(default=Decimal("0"), ge=0)
    start_date: date
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    plan_name: Optional[str] = None
