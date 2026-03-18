from datetime import datetime
from typing import List

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from src.core.database import Base


class Book(Base):
    __tablename__ = "books"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    currency = Column(String(3), default="CNY")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="books")
    accounts = relationship("Account", back_populates="book", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="book", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="book", cascade="all, delete-orphan")
