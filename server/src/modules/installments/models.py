from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from src.core.database import Base


class InstallmentPlan(Base):
    __tablename__ = "installment_plans"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    transaction_id = Column(String(36), ForeignKey("transactions.id"))
    category_id = Column(String(36), ForeignKey("categories.id"))  # 🛡️ L: 分类ID
    plan_name = Column(String(200))
    total_amount = Column(Numeric(15, 2), nullable=False)  # 总金额
    installment_amount = Column(Numeric(15, 2), nullable=False)  # 🛡️ L: 每期金额
    total_periods = Column(Integer, nullable=False)  # 总期数
    executed_periods = Column(Integer, default=0)  # 🛡️ L: 已执行期数
    current_period = Column(Integer, default=1)  # 当前期数
    principal_per_period = Column(Numeric(15, 2), nullable=False)  # 每期本金
    fee_per_period = Column(Numeric(15, 2), default=0)  # 每期手续费
    handling_fee = Column(Numeric(15, 2), default=0)  # 🛡️ L: 手续费（别名）
    total_fee = Column(Numeric(15, 2), default=0)  # 总手续费
    interest = Column(Numeric(15, 2), default=0)  # 🛡️ L: 利息
    start_date = Column(Date, nullable=False)  # 开始日期（申请日期）
    application_date = Column(DateTime)  # 🛡️ L: 申请日期
    first_execution_date = Column(Date)  # 🛡️ L: 首次执行日期
    first_billing_date = Column(Date)  # 🛡️ L: 首次账单日
    first_repayment_date = Column(Date)
    next_execution_date = Column(Date)  # 🛡️ L: 下次执行日期
    repayment_day = Column(Integer)
    status = Column(String(20), default="active")
    early_settlement_supported = Column(Boolean, default=True)
    tags = Column(Text)  # 🛡️ L: 标签ID数组(JSON)
    note = Column(String(500))  # 🛡️ L: 备注
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


class InstallmentStateEvent(Base):
    __tablename__ = "account_state_events"

    id = Column(String(36), primary_key=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    event_date = Column(Date, nullable=False, index=True)
    delta_frozen_amount = Column(Numeric(15, 2), default=Decimal("0"))
    delta_debt_amount = Column(Numeric(15, 2), default=Decimal("0"))
    delta_credit_limit = Column(Numeric(15, 2), default=Decimal("0"))
    source_plan_id = Column(String(36), ForeignKey("installment_plans.id"), index=True)
    source_transaction_id = Column(String(36), ForeignKey("transactions.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_account_state_events_account_date", "account_id", "event_date"),
    )
