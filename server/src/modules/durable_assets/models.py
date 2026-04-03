from sqlalchemy import Column, String, DateTime, Numeric, Text, Boolean, Date
from sqlalchemy.sql import func
from src.core.database import Base


class DurableAsset(Base):
    __tablename__ = "durable_assets"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    purchase_price = Column(Numeric(12, 2), nullable=False)
    purchase_date = Column(Date, nullable=False)
    is_retired = Column(Boolean, default=False)
    retire_date = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
