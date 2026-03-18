from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base


class InstallmentPlan(Base):
    __tablename__ = "installment_plans"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    transaction_id = Column(String(36), ForeignKey("transactions.id"))
    plan_name = Column(String(200))
    total_amount = Column(Numeric(15, 2), nullable=False)
    total_periods = Column(Integer, nullable=False)
    current_period = Column(Integer, default=1)
    principal_per_period = Column(Numeric(15, 2), nullable=False)
    fee_per_period = Column(Numeric(15, 2), default=0)
    total_fee = Column(Numeric(15, 2), default=0)
    start_date = Column(Date, nullable=False)
    first_repayment_date = Column(Date)
    repayment_day = Column(Integer)
    status = Column(String(20), default="active")
    early_settlement_supported = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    schedules = relationship("InstallmentSchedule", back_populates="plan", cascade="all, delete-orphan")


class InstallmentSchedule(Base):
    __tablename__ = "installment_schedules"

    id = Column(String(36), primary_key=True)
    installment_plan_id = Column(String(36), ForeignKey("installment_plans.id"), nullable=False, index=True)
    period_no = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    principal_amount = Column(Numeric(15, 2), nullable=False)
    fee_amount = Column(Numeric(15, 2), default=0)
    total_due = Column(Numeric(15, 2), nullable=False)
    paid_amount = Column(Numeric(15, 2), default=0)
    paid_at = Column(DateTime)
    payment_transaction_id = Column(String(36), ForeignKey("transactions.id"))
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    plan = relationship("InstallmentPlan", back_populates="schedules")

    # Constraints
    __table_args__ = (
        UniqueConstraint("installment_plan_id", "period_no", name="uix_installment_period"),
        Index("ix_installment_schedules_due_date", "due_date"),
    )
