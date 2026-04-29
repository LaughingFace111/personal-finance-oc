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
    _ensure_frequent_items_schema(bind_engine=engine)
    _ensure_account_archive_schema(bind_engine=engine)
    _ensure_subscription_schema(bind_engine=engine)


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


def _ensure_frequent_items_schema(bind_engine) -> None:
    if bind_engine.dialect.name != "sqlite":
        return

    table_columns = {
        "tags": {
            "usage_count": "INTEGER NOT NULL DEFAULT 0",
        },
        "categories": {
            "usage_count": "INTEGER NOT NULL DEFAULT 0",
        },
    }

    with bind_engine.begin() as connection:
        inspector = inspect(connection)
        for table_name, columns in table_columns.items():
            if not inspector.has_table(table_name):
                continue

            existing_columns = {
                column["name"] for column in inspector.get_columns(table_name)
            }
            for column_name, ddl in columns.items():
                if column_name not in existing_columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"
                    )


def _ensure_account_archive_schema(bind_engine) -> None:
    if bind_engine.dialect.name != "sqlite":
        return

    with bind_engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("accounts"):
            return

        existing_columns = {
            column["name"] for column in inspector.get_columns("accounts")
        }
        if "is_archived" not in existing_columns:
            connection.exec_driver_sql(
                "ALTER TABLE accounts ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0"
            )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_accounts_is_archived ON accounts (is_archived)"
        )


def _ensure_subscription_schema(bind_engine) -> None:
    if bind_engine.dialect.name != "sqlite":
        return

    with bind_engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("subscriptions"):
            connection.exec_driver_sql(
                """
                CREATE TABLE subscriptions (
                    id VARCHAR(36) PRIMARY KEY,
                    book_id VARCHAR(36) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    amount_type VARCHAR(20) NOT NULL,
                    amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
                    frequency_unit VARCHAR(20) NOT NULL,
                    frequency_interval NUMERIC(10, 0) NOT NULL DEFAULT 1,
                    day_of_month NUMERIC(2, 0),
                    due_anchor_date DATE NOT NULL,
                    next_payment_date DATE NOT NULL,
                    account_id VARCHAR(36) NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(book_id) REFERENCES books (id),
                    FOREIGN KEY(account_id) REFERENCES accounts (id)
                )
                """
            )
        else:
            existing_columns = {
                column["name"] for column in inspector.get_columns("subscriptions")
            }
            if "cycle_days" in existing_columns or "next_due_date" in existing_columns:
                connection.exec_driver_sql("ALTER TABLE subscriptions RENAME TO subscriptions_legacy_phase8")
                connection.exec_driver_sql(
                    """
                    CREATE TABLE subscriptions (
                        id VARCHAR(36) PRIMARY KEY,
                        book_id VARCHAR(36) NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        amount_type VARCHAR(20) NOT NULL,
                        amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
                        frequency_unit VARCHAR(20) NOT NULL,
                        frequency_interval NUMERIC(10, 0) NOT NULL DEFAULT 1,
                        day_of_month NUMERIC(2, 0),
                        due_anchor_date DATE NOT NULL,
                        next_payment_date DATE NOT NULL,
                        account_id VARCHAR(36) NOT NULL,
                        created_at DATETIME,
                        updated_at DATETIME,
                        FOREIGN KEY(book_id) REFERENCES books (id),
                        FOREIGN KEY(account_id) REFERENCES accounts (id)
                    )
                    """
                )
                connection.exec_driver_sql(
                    """
                    INSERT INTO subscriptions (
                        id, book_id, name, amount_type, amount,
                        frequency_unit, frequency_interval, day_of_month,
                        due_anchor_date, next_payment_date, account_id, created_at, updated_at
                    )
                    SELECT
                        id,
                        book_id,
                        name,
                        amount_type,
                        amount,
                        'custom_days',
                        CASE
                            WHEN trim(coalesce(cycle_days, '')) GLOB '[0-9]*' AND trim(coalesce(cycle_days, '')) <> ''
                                THEN CAST(trim(cycle_days) AS INTEGER)
                            ELSE 30
                        END,
                        NULL,
                        next_due_date,
                        next_due_date,
                        account_id,
                        created_at,
                        updated_at
                    FROM subscriptions_legacy_phase8
                    """
                )
                connection.exec_driver_sql("DROP TABLE subscriptions_legacy_phase8")

        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_subscriptions_book_id ON subscriptions (book_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_subscriptions_account_id ON subscriptions (account_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_subscriptions_next_payment_date ON subscriptions (next_payment_date)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_subscriptions_book_due ON subscriptions (book_id, next_payment_date)"
        )
