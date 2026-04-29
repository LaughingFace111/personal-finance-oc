"""add transaction templates

Revision ID: 005
Revises: 004
Create Date: 2026-04-29
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

    if inspector.has_table("transaction_templates"):
        return

    op.create_table(
        "transaction_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("book_id", sa.String(36), sa.ForeignKey("books.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("transaction_type", sa.String(20), nullable=False, server_default="expense"),
        sa.Column("category_id", sa.String(36), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2)),
        sa.Column("tags", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("book_id", "name", name="uix_transaction_templates_book_name"),
    )
    op.create_index("ix_transaction_templates_book_id", "transaction_templates", ["book_id"])
    op.create_index("ix_transaction_templates_category_id", "transaction_templates", ["category_id"])
    op.create_index("ix_transaction_templates_book_active", "transaction_templates", ["book_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_transaction_templates_book_active", table_name="transaction_templates")
    op.drop_index("ix_transaction_templates_category_id", table_name="transaction_templates")
    op.drop_index("ix_transaction_templates_book_id", table_name="transaction_templates")
    op.drop_table("transaction_templates")
