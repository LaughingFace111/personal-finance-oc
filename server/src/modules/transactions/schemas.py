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


class LinkedRefundTransaction(BaseModel):
    id: str
    occurred_at: datetime
    amount: Decimal
    currency: str
    account_id: str
    note: Optional[str] = None
    status: TransactionStatus = TransactionStatus.CONFIRMED


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
    refunded_amount: Decimal = Decimal("0")
    remaining_refundable_amount: Decimal = Decimal("0")
    original_amount: Optional[Decimal] = None
    is_partially_refunded: bool = False
    is_fully_refunded: bool = False
    linked_refunds: List[LinkedRefundTransaction] = Field(default_factory=list)
    split_group_id: Optional[str] = None  # 拆分组 ID（组长与子拆分共享）
    is_split_parent: bool = False  # 是否为拆分组长
    is_split_child: bool = False   # 🛡️ L: Phase 10 - 是否为拆分子交易
    split_parent_id: Optional[str] = None  # 🛡️ L: Phase 10 - 子交易→组长引用
    split_children_count: int = 0  # 子拆分数（仅组长有值）

    class Config:
        from_attributes = True


# Transfer transaction
class TransferCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurred_at: Optional[datetime] = None
    from_account_id: str
    to_account_id: str
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    note: Optional[str] = None
    tags: Optional[str] = None
    fee_amount: Decimal = Field(default=Decimal("0"), ge=0)
    fee_account_id: Optional[str] = None


class CreditCardRepaymentCreate(BaseModel):
    occurred_at: datetime
    from_account_id: str
    credit_card_account_id: str
    amount: Decimal = Field(..., gt=0)
    currency: str = "CNY"
    note: Optional[str] = None
    tags: Optional[str] = None


class TransferEditResponse(BaseModel):
    transaction_id: str
    occurred_at: datetime
    from_account_id: str
    to_account_id: str
    amount: Decimal
    note: Optional[str] = None
    tags: Optional[str] = None
    fee_amount: Decimal = Field(default=Decimal("0"), ge=0)
    fee_account_id: Optional[str] = None


# Refund transaction
class RefundCreate(BaseModel):
    occurred_at: datetime
    original_transaction_id: str
    refund_account_id: str  # 退款入账账户
    amount: Decimal = Field(..., gt=0)
    note: Optional[str] = None
    reason: Optional[str] = None


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


# ─── Transaction Split ────────────────────────────────────────────────────────


class SplitItemCreate(BaseModel):
    """单条拆分的创建输入"""
    model_config = ConfigDict(extra="forbid")

    category_id: str
    amount: Decimal = Field(..., gt=0)
    note: Optional[str] = None


class SplitItemResponse(BaseModel):
    """单条拆分在响应中的结构"""
    id: str
    occurred_at: datetime
    amount: Decimal
    currency: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    merchant: Optional[str] = None
    note: Optional[str] = None
    status: TransactionStatus = TransactionStatus.CONFIRMED

    class Config:
        from_attributes = True


class TransactionSplitResponse(BaseModel):
    """拆分操作的完整响应，包含组长和所有子拆分"""
    parent: TransactionResponse  # 组长交易
    splits: List[SplitItemResponse]  # 子拆分列表
    original_category_id: Optional[str] = None  # 原始 category_id（用于还原）


class SplitReplaceRequest(BaseModel):
    """替换（编辑）拆分的请求体"""
    model_config = ConfigDict(extra="forbid")

    splits: List[SplitItemCreate] = Field(..., min_length=2)


# ─── Phase 10: Transaction Split (Simplified) ─────────────────────────────────


class SplitItem(BaseModel):
    """Phase 10 拆分条目的创建输入（简化版）"""
    model_config = ConfigDict(extra="forbid")

    amount: Decimal = Field(..., gt=0)
    category_id: Optional[str] = None
    note: Optional[str] = None


class SplitCreate(BaseModel):
    """Phase 10 创建拆分的请求体"""
    model_config = ConfigDict(extra="forbid")

    splits: List[SplitItem] = Field(..., min_length=2)


class SplitDetailResponse(BaseModel):
    """Phase 10 拆分详情响应：组长 + 所有子交易"""
    original_transaction: TransactionResponse
    children: List[TransactionResponse]
