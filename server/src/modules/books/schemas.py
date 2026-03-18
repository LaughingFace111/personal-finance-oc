from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BookBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    currency: str = "CNY"


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    currency: Optional[str] = None


class BookResponse(BookBase):
    id: str
    user_id: str
    is_default: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
