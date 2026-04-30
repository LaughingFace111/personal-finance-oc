"""add reimbursement requests

Revision ID: 013
Revises: 012
Create Date: 2026-04-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "013"
down_revision: Union[str, Sequence[str], None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reimbursement_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("source_transaction_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("contact_name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CNY"),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"]),
        sa.ForeignKeyConstraint(["source_transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reimbursement_requests_book_id", "reimbursement_requests", ["book_id"])
    op.create_index("ix_reimbursement_requests_source_transaction_id", "reimbursement_requests", ["source_transaction_id"])
    op.create_index("ix_reimbursement_requests_status", "reimbursement_requests", ["status"])
    op.create_index("ix_reimbursement_requests_occurred_at", "reimbursement_requests", ["occurred_at"])
    op.create_index(
        "ix_reimbursements_book_status",
        "reimbursement_requests",
        ["book_id", "status"],
    )
    op.create_index(
        "ix_reimbursements_book_occurred_at",
        "reimbursement_requests",
        ["book_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_reimbursements_book_occurred_at", table_name="reimbursement_requests")
    op.drop_index("ix_reimbursements_book_status", table_name="reimbursement_requests")
    op.drop_index("ix_reimbursement_requests_occurred_at", table_name="reimbursement_requests")
    op.drop_index("ix_reimbursement_requests_status", table_name="reimbursement_requests")
    op.drop_index("ix_reimbursement_requests_source_transaction_id", table_name="reimbursement_requests")
    op.drop_index("ix_reimbursement_requests_book_id", table_name="reimbursement_requests")
    op.drop_table("reimbursement_requests")
