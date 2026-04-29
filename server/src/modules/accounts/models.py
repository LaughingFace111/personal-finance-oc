from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    account_type = Column(String(20), nullable=False)
    institution_name = Column(String(100))
    card_last4 = Column(String(4))
    credit_limit = Column(Numeric(15, 2), default=0)
    billing_day = Column(String(10))  # Store as string to allow None
    billing_day_rule = Column(String(20), default="current_cycle")  # "current_cycle" or "next_cycle"
    repayment_day = Column(String(10))
    opening_balance = Column(Numeric(15, 2), default=0)
    current_balance = Column(Numeric(15, 2), default=0)
    debt_amount = Column(Numeric(15, 2), default=0)
    frozen_amount = Column(Numeric(15, 2), default=0)  # 🛡️ L: 冻结额度（分期专用）
    currency = Column(String(3), default="CNY")
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False, nullable=False, index=True)
    is_deleted = Column(Boolean, default=False)  # 软删除标记
    note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    book = relationship("Book", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", foreign_keys="Transaction.account_id")
    counterparty_transactions = relationship("Transaction", back_populates="counterparty_account", foreign_keys="Transaction.counterparty_account_id")

    # Constraints
    __table_args__ = (
        UniqueConstraint("book_id", "name", name="uix_accounts_book_name"),
        Index("ix_accounts_book_type", "book_id", "account_type"),
    )
