from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from src.core.database import Base


class Tag(Base):
    __tablename__ = "tags"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
