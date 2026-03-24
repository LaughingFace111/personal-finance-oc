from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text

from src.core.database import Base


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    rule_name = Column(String(100), nullable=False)
    transaction_type = Column(String(30), nullable=False)
    direction = Column(String(10), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="CNY")
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    counterparty_account_id = Column(String(36), ForeignKey("accounts.id"))
    category_id = Column(String(36), ForeignKey("categories.id"))
    merchant = Column(String(200))
    note = Column(Text)
    tags = Column(Text)
    extra = Column(Text)
    schedule_type = Column(String(20), nullable=False, default="monthly")
    interval_value = Column(Integer, default=1)
    day_of_month = Column(Integer)
    weekday = Column(Integer)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    next_occurs_on = Column(Date, nullable=False, index=True)
    last_generated_on = Column(Date)
    auto_confirm = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_recurring_rules_book_active", "book_id", "is_active"),
    )
