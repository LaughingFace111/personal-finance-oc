from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class TagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = None
    parent_id: Optional[str] = None


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None


class TagResponse(TagBase):
    id: str
    book_id: Optional[str] = None  # 🛡️ L: 系统标签允许为 None
    usage_count: int = 0
    is_system: bool = False
    is_active: bool = True
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TagTreeNode(TagResponse):
    """一级标签节点，包含 children（二级标签列表）"""
    children: List[TagResponse] = []
