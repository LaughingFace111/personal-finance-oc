from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field
from src.common.enums import AccountType


class AccountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("账户名称不能为空或全空格")
        return stripped

    @classmethod
    def model_validate(cls, data, **kwargs):
        if isinstance(data, dict) and "name" in data:
            data = dict(data)
            data["name"] = cls.validate_name(data["name"])
        return super().model_validate(data, **kwargs)
    account_type: AccountType
    institution_name: Optional[str] = None
    card_last4: Optional[str] = None
    credit_limit: Optional[Decimal] = Field(default=Decimal("0"), ge=0)
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    billing_day_rule: Optional[str] = Field(default="current_cycle")  # "current_cycle" or "next_cycle"
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    opening_balance: Optional[Decimal] = Field(default=Decimal("0"))
    current_balance: Optional[Decimal] = Field(default=Decimal("0"))
    currency: str = "CNY"
    note: Optional[str] = None


class AccountCreate(AccountBase):
    pass  # name validation inherited from AccountBase


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    institution_name: Optional[str] = None
    card_last4: Optional[str] = None
    credit_limit: Optional[Decimal] = None
    billing_day: Optional[int] = Field(default=None, ge=1, le=31)
    billing_day_rule: Optional[str] = None
    repayment_day: Optional[int] = Field(default=None, ge=1, le=31)
    note: Optional[str] = None


class AccountResponse(AccountBase):
    id: str
    book_id: str
    debt_amount: Decimal = Field(default=Decimal("0"))
    frozen_amount: Decimal = Field(default=Decimal("0"))  # 🛡️ L: 冻结额度
    is_active: bool = True
    is_archived: bool = False
    is_deleted: bool = False  # 软删除标记
    created_at: datetime
    updated_at: datetime
    
    # 🛡️ L: 本期待还计算字段（信用账户专用）
    current_statement_balance: Optional[Decimal] = None  # 本期待还金额
    next_repayment_date: Optional[str] = None  # 下一个还款日期 (YYYY-MM-DD)
    days_until_repayment: Optional[int] = None  # 距还款日天数

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


class NetWorthAccountItem(BaseModel):
    id: str
    name: str
    account_type: AccountType
    role: Literal["asset", "liability"]
    value: Decimal


class NetWorthResponse(BaseModel):
    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal
    assets_by_type: Dict[str, Decimal]
    liabilities_by_type: Dict[str, Decimal]
    accounts: List[NetWorthAccountItem]
    calculated_at: datetime
