from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# User schemas
class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    email: Optional[str] = None
    nickname: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: Optional[str] = None
    currency_default: Optional[str] = None


class UserResponse(UserBase):
    id: str
    avatar_url: Optional[str] = None
    timezone: str = "Asia/Shanghai"
    currency_default: str = "CNY"
    status: str = "active"
    created_at: datetime
    updated_at: datetime
    default_book_id: Optional[str] = None

    class Config:
        from_attributes = True


# Auth schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
