"""add account reconciliation

Revision ID: 011
Revises: 010
Create Date: 2026-04-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("reconciliation_sessions"):
        op.create_table(
            "reconciliation_sessions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("book_id", sa.String(length=36), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("account_id", sa.String(length=36), sa.ForeignKey("accounts.id"), nullable=False),
            sa.Column("statement_period_start", sa.Date(), nullable=False),
            sa.Column("statement_period_end", sa.Date(), nullable=False),
            sa.Column("statement_opening_balance", sa.Numeric(15, 2), nullable=True),
            sa.Column("statement_closing_balance", sa.Numeric(15, 2), nullable=False),
            sa.Column("statement_total_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
            sa.Column("ledger_total_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
            sa.Column("ledger_closing_balance", sa.Numeric(15, 2), nullable=False, server_default="0"),
            sa.Column("difference_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="in_progress"),
            sa.Column("review_state", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("evidence_source_type", sa.String(length=50), nullable=True),
            sa.Column("evidence_filename", sa.String(length=500), nullable=True),
            sa.Column("evidence_import_batch_id", sa.String(length=36), sa.ForeignKey("import_batches.id"), nullable=True),
            sa.Column("evidence_row_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matching_summary", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("close_note", sa.Text(), nullable=True),
            sa.Column("close_transaction_id", sa.String(length=36), sa.ForeignKey("transactions.id"), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if not inspector.has_table("reconciliation_statement_rows"):
        op.create_table(
            "reconciliation_statement_rows",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("session_id", sa.String(length=36), sa.ForeignKey("reconciliation_sessions.id"), nullable=False),
            sa.Column("row_no", sa.Integer(), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False),
            sa.Column("direction", sa.String(length=10), nullable=False),
            sa.Column("amount", sa.Numeric(15, 2), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="CNY"),
            sa.Column("raw_account_name", sa.String(length=200), nullable=True),
            sa.Column("counterparty", sa.String(length=200), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("order_no", sa.String(length=200), nullable=True),
            sa.Column("merchant_order_no", sa.String(length=200), nullable=True),
            sa.Column("external_ref", sa.String(length=200), nullable=True),
            sa.Column("raw_data", sa.Text(), nullable=True),
            sa.Column("normalized_data", sa.Text(), nullable=True),
            sa.Column("match_status", sa.String(length=20), nullable=False, server_default="unresolved"),
            sa.Column("match_reason", sa.Text(), nullable=True),
            sa.Column("matched_transaction_id", sa.String(length=36), sa.ForeignKey("transactions.id"), nullable=True),
            sa.Column("candidate_transaction_ids", sa.Text(), nullable=True),
            sa.Column("review_status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_reconciliation_sessions_account_period ON reconciliation_sessions (account_id, statement_period_end)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_reconciliation_sessions_book_status ON reconciliation_sessions (book_id, status)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_reconciliation_statement_rows_session_status ON reconciliation_statement_rows (session_id, match_status)"
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS ix_reconciliation_statement_rows_session_row ON reconciliation_statement_rows (session_id, row_no)"
    )


def downgrade() -> None:
    pass
