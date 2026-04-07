from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    parent_id = Column(String(36), ForeignKey("categories.id"), nullable=True)
    name = Column(String(100), nullable=False)
    category_type = Column(String(20), nullable=False)
    icon = Column(String(50))
    color = Column(String(20))
    sort_order = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    keywords = Column(Text)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    book = relationship("Book", back_populates="categories")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")

    # Constraints
    __table_args__ = (
        UniqueConstraint("book_id", "parent_id", "name", "category_type", name="uix_category_book_parent_name_type"),
        Index("ix_categories_book_parent", "book_id", "parent_id"),
    )
