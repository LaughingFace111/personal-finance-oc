from sqlalchemy import Boolean, Column, DateTime, Index, String
from sqlalchemy.sql import func
from src.core.database import Base


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        Index("ix_tags_book_active", "book_id", "is_active"),
    )

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), nullable=False, index=True)
    parent_id = Column(String(36), nullable=True, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)  # 🛡️ L: 系统标签，所有账本共享
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    @property
    def is_deleted(self) -> bool:
        return not bool(self.is_active)
