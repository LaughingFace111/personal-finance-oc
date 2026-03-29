from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship

from src.core.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    occurred_at = Column(DateTime, nullable=False, index=True)
    posted_at = Column(DateTime)
    transaction_type = Column(String(30), nullable=False)
    direction = Column(String(10), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="CNY")
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    counterparty_account_id = Column(String(36), ForeignKey("accounts.id"))
    category_id = Column(String(36), ForeignKey("categories.id"), index=True)
    merchant = Column(String(200))
    note = Column(Text)
    external_ref = Column(String(200))
    source_type = Column(String(20), default="manual")
    source_batch_id = Column(String(36))
    source_row_no = Column(Integer)
    import_hash = Column(String(64), index=True)
    status = Column(String(20), default="confirmed", index=True)
    tags = Column(Text)  # JSON string
    extra = Column(Text)  # JSON string
    related_transaction_id = Column(String(36), index=True)
    business_key = Column(String(100))
    include_in_expense = Column(Boolean, default=True, index=True)  # 🛡️ L: 添加索引
    include_in_income = Column(Boolean, default=True, index=True)  # 🛡️ L: 添加索引
    include_in_cashflow = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    book = relationship("Book", back_populates="transactions")
    account = relationship("Account", foreign_keys=[account_id], back_populates="transactions")
    counterparty_account = relationship("Account", foreign_keys=[counterparty_account_id])
    category = relationship("Category")

    # Constraints
    __table_args__ = (
        Index("ix_transactions_book_date", "book_id", "occurred_at"),
        Index("ix_transactions_book_type", "book_id", "transaction_type"),
        Index("ix_transactions_book_category", "book_id", "category_id"),
        # 🛡️ L: 新增复合索引以加速报表查询
        Index("ix_transactions_book_income_period", "book_id", "include_in_income", "occurred_at"),
        Index("ix_transactions_book_expense_period", "book_id", "include_in_expense", "occurred_at"),
        Index("ix_transactions_book_type_status_period", "book_id", "transaction_type", "status", "occurred_at"),
        UniqueConstraint("book_id", "source_type", "business_key", name="uix_transaction_business_key"),
    )
