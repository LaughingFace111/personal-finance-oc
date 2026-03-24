"""add recurring rules and pending items

Revision ID: 005
Revises: 004
Create Date: 2026-03-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("recurring_rules"):
        op.create_table(
            "recurring_rules",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("book_id", sa.String(36), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("rule_name", sa.String(100), nullable=False),
            sa.Column("transaction_type", sa.String(30), nullable=False),
            sa.Column("direction", sa.String(10), nullable=False),
            sa.Column("amount", sa.Numeric(15, 2), nullable=False),
            sa.Column("currency", sa.String(3), server_default="CNY"),
            sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
            sa.Column("counterparty_account_id", sa.String(36), sa.ForeignKey("accounts.id")),
            sa.Column("category_id", sa.String(36), sa.ForeignKey("categories.id")),
            sa.Column("merchant", sa.String(200)),
            sa.Column("note", sa.Text()),
            sa.Column("tags", sa.Text()),
            sa.Column("extra", sa.Text()),
            sa.Column("schedule_type", sa.String(20), nullable=False, server_default="monthly"),
            sa.Column("interval_value", sa.Integer(), server_default="1"),
            sa.Column("day_of_month", sa.Integer()),
            sa.Column("weekday", sa.Integer()),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date()),
            sa.Column("next_occurs_on", sa.Date(), nullable=False),
            sa.Column("last_generated_on", sa.Date()),
            sa.Column("auto_confirm", sa.Boolean(), server_default=sa.false()),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
        op.create_index("ix_recurring_rules_book_id", "recurring_rules", ["book_id"])
        op.create_index("ix_recurring_rules_next_occurs_on", "recurring_rules", ["next_occurs_on"])
        op.create_index("ix_recurring_rules_book_active", "recurring_rules", ["book_id", "is_active"])

    if not inspector.has_table("recurring_pending_items"):
        op.create_table(
            "recurring_pending_items",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("recurring_rule_id", sa.String(36), sa.ForeignKey("recurring_rules.id"), nullable=False),
            sa.Column("book_id", sa.String(36), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("expected_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(20), server_default="pending"),
            sa.Column("transaction_payload", sa.Text(), nullable=False),
            sa.Column("transaction_id", sa.String(36), sa.ForeignKey("transactions.id")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
            sa.UniqueConstraint("recurring_rule_id", "expected_date", name="uix_recurring_pending_rule_date"),
        )
        op.create_index("ix_recurring_pending_rule_id", "recurring_pending_items", ["recurring_rule_id"])
        op.create_index("ix_recurring_pending_book_id", "recurring_pending_items", ["book_id"])
        op.create_index("ix_recurring_pending_status", "recurring_pending_items", ["status"])
        op.create_index("ix_recurring_pending_book_status", "recurring_pending_items", ["book_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_recurring_pending_book_status", table_name="recurring_pending_items")
    op.drop_index("ix_recurring_pending_status", table_name="recurring_pending_items")
    op.drop_index("ix_recurring_pending_book_id", table_name="recurring_pending_items")
    op.drop_index("ix_recurring_pending_rule_id", table_name="recurring_pending_items")
    op.drop_table("recurring_pending_items")

    op.drop_index("ix_recurring_rules_book_active", table_name="recurring_rules")
    op.drop_index("ix_recurring_rules_next_occurs_on", table_name="recurring_rules")
    op.drop_index("ix_recurring_rules_book_id", table_name="recurring_rules")
    op.drop_table("recurring_rules")
