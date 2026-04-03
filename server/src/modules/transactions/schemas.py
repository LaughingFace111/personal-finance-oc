from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field
from src.common.enums import TransactionType, TransactionDirection, TransactionStatus, SourceType


class TransactionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")  # 禁止额外字段

    occurred_at: datetime
    posted_at: Optional[datetime] = None
    transaction_type: TransactionType
    direction: TransactionDirection
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    category_id: Optional[str] = None
    merchant: Optional[str] = None
    note: Optional[str] = None
    external_ref: Optional[str] = None
    source_type: SourceType = SourceType.MANUAL
    source_batch_id: Optional[str] = None
    source_row_no: Optional[int] = None
    tags: Optional[str] = None  # JSON string
    extra: Optional[str] = None  # JSON string
    related_transaction_id: Optional[str] = None
    business_key: Optional[str] = None
    include_in_expense: bool = True
    include_in_income: bool = True
    include_in_cashflow: bool = True


class TransactionCreate(TransactionBase):
    model_config = ConfigDict(extra="forbid")  # 禁止额外字段

    account_id: str
    counterparty_account_id: Optional[str] = None
    
    # 🛡️ L: Override flags for special transactions
    include_expense_override: Optional[bool] = None  # 是否覆盖 include_in_expense
    include_income_override: Optional[bool] = None
    include_cashflow_override: Optional[bool] = None


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")  # 禁止额外字段

    occurred_at: Optional[datetime] = None
    posted_at: Optional[datetime] = None
    amount: Optional[Decimal] = Field(None, gt=0)
    account_id: Optional[str] = None
    counterparty_account_id: Optional[str] = None
    category_id: Optional[str] = None
    merchant: Optional[str] = None
    note: Optional[str] = None
    status: Optional[TransactionStatus] = None
    tags: Optional[str] = None


class TransactionResponse(TransactionBase):
    id: str
    book_id: str
    account_id: str
    counterparty_account_id: Optional[str] = None
    import_hash: Optional[str] = None
    status: TransactionStatus = TransactionStatus.CONFIRMED
    created_at: datetime
    updated_at: datetime
    has_refund: bool = False  # 是否已有退款
    is_hidden: bool = False  # 🛡️ L: 隐身账单标记（列表展示用）

    class Config:
        from_attributes = True


# Transfer transaction
class TransferCreate(BaseModel):
    occurred_at: datetime
    from_account_id: str
    to_account_id: str
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    note: Optional[str] = None
    tags: Optional[str] = None


class CreditCardRepaymentCreate(BaseModel):
    occurred_at: datetime
    from_account_id: str
    credit_card_account_id: str
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    note: Optional[str] = None
    tags: Optional[str] = None


# Refund transaction
class RefundCreate(BaseModel):
    occurred_at: datetime
    original_transaction_id: str
    refund_account_id: str  # 退款入账账户
    amount: Decimal = Field(..., gt=0)
    note: Optional[str] = None


# Transaction list filter
class TransactionFilter(BaseModel):
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    account_id: Optional[str] = None
    category_id: Optional[str] = None
    transaction_type: Optional[TransactionType] = None
    status: Optional[TransactionStatus] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 50
    include_hidden: bool = False  # 🛡️ L: 是否包含隐身账单（默认不包含）


# Transaction summary
class TransactionSummary(BaseModel):
    total_count: int
    total_amount: Decimal
    page: int
    page_size: int
    items: List[TransactionResponse]
