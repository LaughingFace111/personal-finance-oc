from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import relationship

from src.core.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    amount_type = Column(String(20), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False, default=0)
    frequency_unit = Column(String(20), nullable=False)
    frequency_interval = Column(Numeric(10, 0), nullable=False, default=1)
    day_of_month = Column(Numeric(2, 0))
    due_anchor_date = Column(Date, nullable=False)
    next_payment_date = Column(Date, nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    book = relationship("Book")
    account = relationship("Account")

    __table_args__ = (
        Index("ix_subscriptions_book_due", "book_id", "next_payment_date"),
    )
