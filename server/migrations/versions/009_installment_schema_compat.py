"""backfill installment compatibility columns

Revision ID: 009
Revises: 008
Create Date: 2026-04-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("installment_plans"):
        return

    existing = _column_names(inspector, "installment_plans")

    columns_to_add = [
        ("category_id", sa.Column("category_id", sa.String(length=36), nullable=True)),
        (
            "installment_amount",
            sa.Column("installment_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        ),
        (
            "executed_periods",
            sa.Column("executed_periods", sa.Integer(), nullable=False, server_default="0"),
        ),
        ("handling_fee", sa.Column("handling_fee", sa.Numeric(15, 2), nullable=True, server_default="0")),
        ("interest", sa.Column("interest", sa.Numeric(15, 2), nullable=True, server_default="0")),
        ("application_date", sa.Column("application_date", sa.DateTime(), nullable=True)),
        ("first_execution_date", sa.Column("first_execution_date", sa.Date(), nullable=True)),
        ("first_billing_date", sa.Column("first_billing_date", sa.Date(), nullable=True)),
        ("next_execution_date", sa.Column("next_execution_date", sa.Date(), nullable=True)),
        ("tags", sa.Column("tags", sa.Text(), nullable=True)),
        ("note", sa.Column("note", sa.String(length=500), nullable=True)),
    ]

    for column_name, column in columns_to_add:
        if column_name not in existing:
            op.add_column("installment_plans", column)

    conn.exec_driver_sql(
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

    inspector = sa.inspect(conn)
    if not inspector.has_table("account_state_events"):
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

    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_account_state_events_account_id ON account_state_events (account_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_account_state_events_event_type ON account_state_events (event_type)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_account_state_events_event_date ON account_state_events (event_date)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_account_state_events_source_plan_id ON account_state_events (source_plan_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_account_state_events_source_transaction_id ON account_state_events (source_transaction_id)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_account_state_events_account_date ON account_state_events (account_id, event_date)"
    )


def downgrade() -> None:
    pass
