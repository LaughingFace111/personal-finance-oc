import enum
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from src.core.database import Base


class ReconciliationStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    BALANCED = "balanced"
    ADJUSTED = "adjusted"
    DISCREPANT = "discrepant"


class ReconciliationReviewState(str, enum.Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"


class ReconciliationMatchStatus(str, enum.Enum):
    MATCHED = "matched"
    MISSING = "missing"
    DUPLICATE = "duplicate"
    UNRESOLVED = "unresolved"


class ReconciliationSession(Base):
    __tablename__ = "reconciliation_sessions"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    statement_period_start = Column(Date, nullable=False)
    statement_period_end = Column(Date, nullable=False)
    statement_opening_balance = Column(Numeric(15, 2))
    statement_closing_balance = Column(Numeric(15, 2), nullable=False)
    statement_total_amount = Column(Numeric(15, 2), nullable=False, default=0)
    ledger_total_amount = Column(Numeric(15, 2), nullable=False, default=0)
    ledger_closing_balance = Column(Numeric(15, 2), nullable=False, default=0)
    difference_amount = Column(Numeric(15, 2), nullable=False, default=0)
    status = Column(String(20), nullable=False, default=ReconciliationStatus.IN_PROGRESS.value, index=True)
    review_state = Column(String(20), nullable=False, default=ReconciliationReviewState.PENDING.value)
    evidence_source_type = Column(String(50))
    evidence_filename = Column(String(500))
    evidence_import_batch_id = Column(String(36), ForeignKey("import_batches.id"))
    evidence_row_count = Column(Integer, nullable=False, default=0)
    matching_summary = Column(Text)
    notes = Column(Text)
    close_note = Column(Text)
    close_transaction_id = Column(String(36), ForeignKey("transactions.id"))
    closed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = relationship("Account")
    evidence_import_batch = relationship("ImportBatch", back_populates="reconciliation_sessions")
    close_transaction = relationship("Transaction", foreign_keys=[close_transaction_id])
    statement_rows = relationship(
        "ReconciliationStatementRow",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ReconciliationStatementRow.row_no.asc()",
    )

    __table_args__ = (
        Index("ix_reconciliation_sessions_account_period", "account_id", "statement_period_end"),
        Index("ix_reconciliation_sessions_book_status", "book_id", "status"),
    )


class ReconciliationStatementRow(Base):
    __tablename__ = "reconciliation_statement_rows"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("reconciliation_sessions.id"), nullable=False, index=True)
    row_no = Column(Integer, nullable=False)
    occurred_at = Column(DateTime, nullable=False, index=True)
    direction = Column(String(10), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="CNY")
    raw_account_name = Column(String(200))
    counterparty = Column(String(200))
    description = Column(Text)
    order_no = Column(String(200))
    merchant_order_no = Column(String(200))
    external_ref = Column(String(200))
    raw_data = Column(Text)
    normalized_data = Column(Text)
    match_status = Column(String(20), nullable=False, default=ReconciliationMatchStatus.UNRESOLVED.value, index=True)
    match_reason = Column(Text)
    matched_transaction_id = Column(String(36), ForeignKey("transactions.id"))
    candidate_transaction_ids = Column(Text)
    review_status = Column(String(20), nullable=False, default="pending")
    review_note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("ReconciliationSession", back_populates="statement_rows")
    matched_transaction = relationship("Transaction", foreign_keys=[matched_transaction_id])

    __table_args__ = (
        Index("ix_reconciliation_rows_session_status", "session_id", "match_status"),
        Index("ix_reconciliation_rows_session_row", "session_id", "row_no"),
    )
