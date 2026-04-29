from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint

from src.core.database import Base


class TransactionTemplate(Base):
    __tablename__ = "transaction_templates"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    transaction_type = Column(String(20), nullable=False, default="expense")
    category_id = Column(String(36), ForeignKey("categories.id"), nullable=False, index=True)
    amount = Column(Numeric(15, 2))
    tags = Column(Text)  # JSON string of tag ids
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("book_id", "name", name="uix_transaction_templates_book_name"),
        Index("ix_transaction_templates_book_active", "book_id", "is_active"),
    )
