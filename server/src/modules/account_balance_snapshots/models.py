from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint

from src.core.database import Base


class AccountBalanceSnapshot(Base):
    __tablename__ = "account_balance_snapshots"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    end_of_day_balance = Column(Numeric(15, 2), nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("account_id", "snapshot_date", name="uix_account_balance_snapshots_account_date"),
        Index("ix_account_balance_snapshots_user_date", "user_id", "snapshot_date"),
    )
