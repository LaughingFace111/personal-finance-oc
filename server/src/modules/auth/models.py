from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.orm import relationship

from src.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(100))
    avatar_url = Column(String(500))
    timezone = Column(String(50), default="Asia/Shanghai")
    currency_default = Column(String(3), default="CNY")
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    books = relationship("Book", back_populates="user", cascade="all, delete-orphan")
