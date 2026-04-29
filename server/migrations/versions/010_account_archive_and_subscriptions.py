"""add account archive and subscriptions

Revision ID: 010
Revises: 009
Create Date: 2026-04-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if inspector.has_table("accounts"):
        existing = _column_names(inspector, "accounts")
        if "is_archived" not in existing:
            op.add_column(
                "accounts",
                sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            )
        conn.exec_driver_sql(
            """
            UPDATE accounts
            SET is_active = 1
            WHERE is_archived = 1
              AND is_deleted = 0
              AND is_active = 0
            """
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_accounts_is_archived ON accounts (is_archived)"
        )

    if not inspector.has_table("subscriptions"):
        op.create_table(
            "subscriptions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("book_id", sa.String(length=36), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("amount_type", sa.String(length=20), nullable=False),
            sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
            sa.Column("frequency_unit", sa.String(length=20), nullable=False),
            sa.Column("frequency_interval", sa.Numeric(10, 0), nullable=False, server_default="1"),
            sa.Column("day_of_month", sa.Numeric(2, 0), nullable=True),
            sa.Column("due_anchor_date", sa.Date(), nullable=False),
            sa.Column("next_payment_date", sa.Date(), nullable=False),
            sa.Column("account_id", sa.String(length=36), sa.ForeignKey("accounts.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    else:
        existing = _column_names(inspector, "subscriptions")
        if "cycle_days" in existing or "next_due_date" in existing:
            conn.exec_driver_sql("ALTER TABLE subscriptions RENAME TO subscriptions_legacy_phase8")
            op.create_table(
                "subscriptions",
                sa.Column("id", sa.String(length=36), primary_key=True),
                sa.Column("book_id", sa.String(length=36), sa.ForeignKey("books.id"), nullable=False),
                sa.Column("name", sa.String(length=100), nullable=False),
                sa.Column("amount_type", sa.String(length=20), nullable=False),
                sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
                sa.Column("frequency_unit", sa.String(length=20), nullable=False),
                sa.Column("frequency_interval", sa.Numeric(10, 0), nullable=False, server_default="1"),
                sa.Column("day_of_month", sa.Numeric(2, 0), nullable=True),
                sa.Column("due_anchor_date", sa.Date(), nullable=False),
                sa.Column("next_payment_date", sa.Date(), nullable=False),
                sa.Column("account_id", sa.String(length=36), sa.ForeignKey("accounts.id"), nullable=False),
                sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
                sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            )
            conn.exec_driver_sql(
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
            conn.exec_driver_sql("DROP TABLE subscriptions_legacy_phase8")

    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_book_id ON subscriptions (book_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_account_id ON subscriptions (account_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_next_payment_date ON subscriptions (next_payment_date)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_book_due ON subscriptions (book_id, next_payment_date)"
    )


def downgrade() -> None:
    pass
