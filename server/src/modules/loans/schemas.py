from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field
from src.common.enums import PlanStatus


# Loan Plan schemas
class LoanPlanBase(BaseModel):
    account_id: str
    loan_name: Optional[str] = None
    principal_total: Decimal = Field(..., gt=0)
    principal_remaining: Decimal = Field(..., gt=0)
    annual_interest_rate: Decimal = Field(..., ge=0, le=1)
    repayment_method: str = "equal_principal_interest"  # equal_principal_interest / equal_principal / custom
    total_periods: int = Field(..., gt=0)
    first_due_date: date
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)


class LoanPlanCreate(LoanPlanBase):
    pass


class LoanPlanUpdate(BaseModel):
    loan_name: Optional[str] = None
    status: Optional[PlanStatus] = None
    principal_remaining: Optional[Decimal] = None


class LoanPlanResponse(LoanPlanBase):
    id: str
    book_id: str
    current_period: int = 0
    monthly_payment_estimated: Decimal
    status: PlanStatus = PlanStatus.ACTIVE
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Loan Schedule schemas
class LoanScheduleResponse(BaseModel):
    id: str
    loan_plan_id: str
    period_no: int
    due_date: date
    principal_due: Decimal
    interest_due: Decimal
    total_due: Decimal
    paid_amount: Decimal = Decimal("0")
    paid_at: Optional[datetime] = None
    payment_transaction_id: Optional[str] = None
    interest_transaction_id: Optional[str] = None
    status: str = "pending"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Create loan with initial balance
class CreateLoanRequest(BaseModel):
    occurred_at: datetime
    account_id: str  # Loan account
    account_name: str
    institution_name: Optional[str] = None
    loan_name: Optional[str] = None
    principal_total: Decimal = Field(..., gt=0)
    annual_interest_rate: Decimal = Field(..., ge=0, le=1)
    total_periods: int = Field(..., gt=0)
    first_due_date: date
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    note: Optional[str] = None


# Repay loan request
class RepayLoanRequest(BaseModel):
    occurred_at: datetime
    from_account_id: str  # Payment account (debit card, etc)
    amount: Decimal = Field(..., gt=0)
    period_no: Optional[int] = None  # If None, auto-settle next period
    note: Optional[str] = None
