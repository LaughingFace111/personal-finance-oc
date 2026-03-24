from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint

from src.core.database import Base


class PendingItem(Base):
    __tablename__ = "recurring_pending_items"

    id = Column(String(36), primary_key=True)
    recurring_rule_id = Column(String(36), ForeignKey("recurring_rules.id"), nullable=False, index=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    expected_date = Column(Date, nullable=False)
    status = Column(String(20), default="pending", index=True)
    transaction_payload = Column(Text, nullable=False)  # JSON string
    transaction_id = Column(String(36), ForeignKey("transactions.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("recurring_rule_id", "expected_date", name="uix_recurring_pending_rule_date"),
        Index("ix_recurring_pending_book_status", "book_id", "status"),
    )
