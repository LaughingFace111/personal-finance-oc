from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint

from src.core.database import Base


class ImportTemplate(Base):
    __tablename__ = "import_templates"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    template_name = Column(String(100), nullable=False)
    source_name = Column(String(100))
    file_type = Column(String(20), nullable=False, default="csv")
    sheet_name = Column(String(100))
    field_mapping = Column(Text, nullable=False)  # JSON string
    default_values = Column(Text)  # JSON string
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("book_id", "template_name", name="uix_import_templates_book_name"),
        Index("ix_import_templates_book_active", "book_id", "is_active"),
    )
