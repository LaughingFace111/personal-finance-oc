import uuid
from datetime import datetime
from typing import Generator

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


# Create engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=settings.DEBUG,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    _ensure_legacy_installment_schema(bind_engine=engine)
    _ensure_budget_schema(bind_engine=engine)


def _ensure_legacy_installment_schema(bind_engine) -> None:
    """Backfill legacy SQLite schemas that predate newer installment fields."""
    if bind_engine.dialect.name != "sqlite":
        return

    plan_columns = {
        "category_id": "VARCHAR(36)",
        "installment_amount": "NUMERIC(15, 2) NOT NULL DEFAULT 0",
        "executed_periods": "INTEGER NOT NULL DEFAULT 0",
        "handling_fee": "NUMERIC(15, 2) DEFAULT 0",
        "interest": "NUMERIC(15, 2) DEFAULT 0",
        "application_date": "DATETIME",
        "first_execution_date": "DATE",
        "first_billing_date": "DATE",
        "next_execution_date": "DATE",
        "tags": "TEXT",
        "note": "VARCHAR(500)",
    }

    with bind_engine.begin() as connection:
        inspector = inspect(connection)
        if inspector.has_table("installment_plans"):
            existing_plan_columns = {
                column["name"] for column in inspector.get_columns("installment_plans")
            }
            for column_name, ddl in plan_columns.items():
                if column_name not in existing_plan_columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE installment_plans ADD COLUMN {column_name} {ddl}"
                    )

            connection.exec_driver_sql(
                """
                UPDATE installment_plans
                SET installment_amount = COALESCE(NULLIF(installment_amount, 0), principal_per_period + COALESCE(fee_per_period, 0)),
                    executed_periods = COALESCE(executed_periods, 0),
                    handling_fee = COALESCE(NULLIF(handling_fee, 0), total_fee, 0),
                    interest = COALESCE(NULLIF(interest, 0), 0),
                    first_execution_date = COALESCE(first_execution_date, first_repayment_date),
                    first_billing_date = COALESCE(first_billing_date, first_repayment_date),
                    next_execution_date = COALESCE(next_execution_date, first_repayment_date)
                """
            )

        if inspector.has_table("account_state_events"):
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_account_state_events_account_id ON account_state_events (account_id)"
            )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_account_state_events_event_type ON account_state_events (event_type)"
            )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_account_state_events_event_date ON account_state_events (event_date)"
            )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_account_state_events_source_plan_id ON account_state_events (source_plan_id)"
            )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_account_state_events_source_transaction_id ON account_state_events (source_transaction_id)"
            )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_account_state_events_account_date ON account_state_events (account_id, event_date)"
            )


def _ensure_budget_schema(bind_engine) -> None:
    if bind_engine.dialect.name != "sqlite":
        return

    budget_columns = {
        "dimension_type": "VARCHAR(20) NOT NULL DEFAULT 'overall'",
        "category_id": "VARCHAR(36)",
        "tag_id": "VARCHAR(36)",
        "rollup_children": "BOOLEAN NOT NULL DEFAULT 1",
    }

    with bind_engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("budgets"):
            return

        existing_columns = {
            column["name"] for column in inspector.get_columns("budgets")
        }
        for column_name, ddl in budget_columns.items():
            if column_name not in existing_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE budgets ADD COLUMN {column_name} {ddl}"
                )
