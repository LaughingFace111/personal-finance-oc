from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import relationship

from src.core.database import Base


class ReimbursementRequest(Base):
    __tablename__ = "reimbursement_requests"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    source_transaction_id = Column(String(36), ForeignKey("transactions.id"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)
    contact_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="CNY")
    occurred_at = Column(DateTime, nullable=False, index=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    book = relationship("Book")
    source_transaction = relationship("Transaction")

    __table_args__ = (
        Index("ix_reimbursements_book_status", "book_id", "status"),
        Index("ix_reimbursements_book_occurred_at", "book_id", "occurred_at"),
    )
