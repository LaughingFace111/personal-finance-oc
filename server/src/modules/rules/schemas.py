from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CategoryRuleBase(BaseModel):
    rule_name: Optional[str] = None
    match_field: str  # merchant/description/counterparty
    match_type: str = "contains"  # exact/contains/regex
    match_value: str
    target_category_id: Optional[str] = None
    target_account_id: Optional[str] = None
    priority: int = 0


class CategoryRuleCreate(CategoryRuleBase):
    pass


class CategoryRuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    target_category_id: Optional[str] = None
    target_account_id: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryRuleResponse(CategoryRuleBase):
    id: str
    book_id: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
