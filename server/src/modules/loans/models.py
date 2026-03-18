from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base


class LoanPlan(Base):
    __tablename__ = "loan_plans"

    id = Column(String(36), primary_key=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    loan_name = Column(String(200))
    principal_total = Column(Numeric(15, 2), nullable=False)
    principal_remaining = Column(Numeric(15, 2), nullable=False)
    annual_interest_rate = Column(Numeric(8, 4), nullable=False)
    repayment_method = Column(String(30), default="equal_principal_interest")
    total_periods = Column(Integer, nullable=False)
    current_period = Column(Integer, default=0)
    monthly_payment_estimated = Column(Numeric(15, 2), nullable=False)
    first_due_date = Column(Date, nullable=False)
    repayment_day = Column(Integer)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    schedules = relationship("LoanSchedule", back_populates="plan", cascade="all, delete-orphan")


class LoanSchedule(Base):
    __tablename__ = "loan_schedules"

    id = Column(String(36), primary_key=True)
    loan_plan_id = Column(String(36), ForeignKey("loan_plans.id"), nullable=False, index=True)
    period_no = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    principal_due = Column(Numeric(15, 2), nullable=False)
    interest_due = Column(Numeric(15, 2), nullable=False)
    total_due = Column(Numeric(15, 2), nullable=False)
    paid_amount = Column(Numeric(15, 2), default=0)
    paid_at = Column(DateTime)
    payment_transaction_id = Column(String(36))
    interest_transaction_id = Column(String(36))
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    plan = relationship("LoanPlan", back_populates="schedules")

    # Constraints
    __table_args__ = (
        UniqueConstraint("loan_plan_id", "period_no", name="uix_loan_period"),
        Index("ix_loan_schedules_due_date", "due_date"),
    )
