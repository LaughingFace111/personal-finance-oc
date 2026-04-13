"""add account state events

Revision ID: 008
Revises: 007
Create Date: 2026-04-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if inspector.has_table("account_state_events"):
        return

    op.create_table(
        "account_state_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("account_id", sa.String(length=36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("delta_frozen_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("delta_debt_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("delta_credit_limit", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("source_plan_id", sa.String(length=36), sa.ForeignKey("installment_plans.id"), nullable=True),
        sa.Column("source_transaction_id", sa.String(length=36), sa.ForeignKey("transactions.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_account_state_events_account_id", "account_state_events", ["account_id"])
    op.create_index("ix_account_state_events_event_type", "account_state_events", ["event_type"])
    op.create_index("ix_account_state_events_event_date", "account_state_events", ["event_date"])
    op.create_index("ix_account_state_events_source_plan_id", "account_state_events", ["source_plan_id"])
    op.create_index(
        "ix_account_state_events_source_transaction_id",
        "account_state_events",
        ["source_transaction_id"],
    )
    op.create_index(
        "ix_account_state_events_account_date",
        "account_state_events",
        ["account_id", "event_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_account_state_events_account_date", table_name="account_state_events")
    op.drop_index("ix_account_state_events_source_transaction_id", table_name="account_state_events")
    op.drop_index("ix_account_state_events_source_plan_id", table_name="account_state_events")
    op.drop_index("ix_account_state_events_event_date", table_name="account_state_events")
    op.drop_index("ix_account_state_events_event_type", table_name="account_state_events")
    op.drop_index("ix_account_state_events_account_id", table_name="account_state_events")
    op.drop_table("account_state_events")
