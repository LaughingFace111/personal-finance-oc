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
            sa.Column("cycle_days", sa.String(length=20), nullable=False),
            sa.Column("next_due_date", sa.Date(), nullable=False),
            sa.Column("account_id", sa.String(length=36), sa.ForeignKey("accounts.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_book_id ON subscriptions (book_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_account_id ON subscriptions (account_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_next_due_date ON subscriptions (next_due_date)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_subscriptions_book_due ON subscriptions (book_id, next_due_date)"
    )


def downgrade() -> None:
    pass
