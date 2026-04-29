from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    filename = Column(String(500), nullable=False)
    source_name = Column(String(100))
    file_type = Column(String(20), nullable=False)  # csv/xlsx
    total_rows = Column(Integer, default=0)
    parsed_rows = Column(Integer, default=0)
    confirmed_rows = Column(Integer, default=0)
    skipped_rows = Column(Integer, default=0)
    duplicate_rows = Column(Integer, default=0)
    status = Column(String(20), default="uploaded")
    mapping_config = Column(Text)  # JSON string
    parser_version = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    rows = relationship("ImportRow", back_populates="batch", cascade="all, delete-orphan")
    reconciliation_sessions = relationship("ReconciliationSession", back_populates="evidence_import_batch")


class ImportRow(Base):
    __tablename__ = "import_rows"

    id = Column(String(36), primary_key=True)
    batch_id = Column(String(36), ForeignKey("import_batches.id"), nullable=False, index=True)
    row_no = Column(Integer, nullable=False)
    raw_data = Column(Text, nullable=False)  # JSON string
    normalized_data = Column(Text)  # JSON string
    guessed_account_id = Column(String(36))
    guessed_category_id = Column(String(36))
    guessed_transaction_type = Column(String(30))
    guessed_confidence = Column(Numeric(5, 2))  # 0-100
    duplicate_candidate_id = Column(String(36))
    user_modified = Column(String(5), default="false")
    confirm_status = Column(String(20), default="pending")
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    batch = relationship("ImportBatch", back_populates="rows")

    # Constraints
    __table_args__ = (
        UniqueConstraint("batch_id", "row_no", name="uix_import_row_batch"),
    )
