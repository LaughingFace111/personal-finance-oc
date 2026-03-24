from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class PendingItemResponse(BaseModel):
    id: str
    recurring_rule_id: str
    book_id: str
    expected_date: date
    status: str = "pending"
    transaction_payload: str
    transaction_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PendingConfirmRequest(BaseModel):
    account_id: Optional[str] = None
    occurred_at: Optional[datetime] = None


class PendingSkipRequest(BaseModel):
    reason: Optional[str] = None
