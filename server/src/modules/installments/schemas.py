from datetime import date, datetime
from decimal import Decimal
import json
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator
from src.common.enums import PlanStatus


# Installment Plan schemas
class InstallmentPlanBase(BaseModel):
    account_id: str
    transaction_id: Optional[str] = None
    category_id: Optional[str] = None
    plan_name: Optional[str] = None
    total_amount: Decimal = Field(..., gt=0)
    total_periods: int = Field(..., gt=0)
    principal_per_period: Optional[Decimal] = Field(default=None, ge=0)  # 🛡️ L: 可选，允许 0
    fee_per_period: Decimal = Field(default=Decimal("0"), ge=0)
    total_fee: Decimal = Field(default=Decimal("0"), ge=0)
    start_date: date
    first_execution_date: Optional[date] = None
    first_billing_date: Optional[date] = None
    first_repayment_date: Optional[date] = None
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    early_settlement_supported: bool = True
    tags: Optional[List[str]] = None


class InstallmentPlanCreate(InstallmentPlanBase):
    pass


class InstallmentPlanUpdate(BaseModel):
    plan_name: Optional[str] = None
    status: Optional[PlanStatus] = None
    current_period: Optional[int] = None


class InstallmentPlanResponse(InstallmentPlanBase):
    id: str
    book_id: str
    account_name: Optional[str] = None  # 🛡️ L: 关联账户名称（卡片展示用）
    executed_periods: int = 0  # 🛡️ L: 已执行期数（前端进度条需要）
    current_period: int = 1
    next_execution_date: Optional[date] = None  # 🛡️ L: 下次执行日
    installment_amount: Decimal = Decimal("0")  # 🛡️ L: 每期金额
    status: PlanStatus = PlanStatus.ACTIVE
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, value):
        if value in (None, "", []):
            return None
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError:
                return None
        return value

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
    tags: Optional[List[str]] = None
    note: Optional[str] = None
    # Plan details
    total_amount: Decimal = Field(..., gt=0)
    total_periods: int = Field(..., gt=0, le=36)
    fee_per_period: Decimal = Field(default=Decimal("0"), ge=0)
    installment_amount: Decimal = Field(default=Decimal("0"), ge=0)  # 🛡️ L: 每期金额
    principal_per_period: Decimal = Field(default=None, ge=0)  # 🛡️ L: 每期本金，可选
    start_date: date
    first_execution_date: Optional[date] = None
    first_billing_date: Optional[date] = None
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    plan_name: Optional[str] = None

    @field_validator("tags", mode="before")
    @classmethod
    def parse_request_tags(cls, value):
        if value in (None, "", []):
            return None
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError:
                return None
        return value
