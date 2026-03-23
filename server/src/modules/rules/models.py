from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from src.core.database import Base


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    rule_name = Column(String(100))
    match_field = Column(String(30), nullable=False, default="combined")  # combined/merchant/description/counterparty/account
    match_type = Column(String(20), default="contains")  # exact/contains/regex
    match_value = Column(String(500), nullable=False)
    target_type = Column(String(20), nullable=False, default="category")  # account/category/tag
    target_category_id = Column(String(36), ForeignKey("categories.id"))
    target_account_id = Column(String(36), ForeignKey("accounts.id"))
    target_tag_id = Column(String(36), ForeignKey("tags.id"))
    target_tags_json = Column(Text)  # Reserved for future multi-tag support
    priority = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index("ix_rules_book_active", "book_id", "is_active"),
    )
