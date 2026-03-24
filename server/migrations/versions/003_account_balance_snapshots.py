"""add account balance snapshots

Revision ID: 003
Revises: 002
Create Date: 2026-03-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if inspector.has_table("account_balance_snapshots"):
        return

    op.create_table(
        "account_balance_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("end_of_day_balance", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("account_id", "snapshot_date", name="uix_account_balance_snapshots_account_date"),
    )
    op.create_index("ix_account_balance_snapshots_user_id", "account_balance_snapshots", ["user_id"])
    op.create_index("ix_account_balance_snapshots_account_id", "account_balance_snapshots", ["account_id"])
    op.create_index("ix_account_balance_snapshots_snapshot_date", "account_balance_snapshots", ["snapshot_date"])
    op.create_index(
        "ix_account_balance_snapshots_user_date",
        "account_balance_snapshots",
        ["user_id", "snapshot_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_account_balance_snapshots_user_date", table_name="account_balance_snapshots")
    op.drop_index("ix_account_balance_snapshots_snapshot_date", table_name="account_balance_snapshots")
    op.drop_index("ix_account_balance_snapshots_account_id", table_name="account_balance_snapshots")
    op.drop_index("ix_account_balance_snapshots_user_id", table_name="account_balance_snapshots")
    op.drop_table("account_balance_snapshots")
