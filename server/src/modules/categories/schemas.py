from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field
from src.common.enums import CategoryType


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category_type: CategoryType
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0
    keywords: Optional[str] = None  # JSON string


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    keywords: Optional[str] = None
    is_active: Optional[bool] = None


class CategoryResponse(CategoryBase):
    id: str
    book_id: str
    is_system: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CategoryTreeNode(CategoryResponse):
    children: List["CategoryTreeNode"] = []


# Import forward reference
CategoryTreeNode.model_rebuild()
