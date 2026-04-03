from sqlalchemy import Column, String, DateTime, Numeric, Text
from sqlalchemy.sql import func
from src.core.database import Base


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    url = Column(Text, nullable=True)
    target_price = Column(Numeric(12, 2), nullable=True)
    status = Column(String(20), default="pending")  # pending | purchased
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
