"""add missing tags and accounts columns

Revision ID: 007
Revises: 006
Create Date: 2026-04-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tag_columns = {column["name"] for column in inspector.get_columns("tags")}
    with op.batch_alter_table("tags") as batch_op:
        if "is_system" not in tag_columns:
            batch_op.add_column(
                sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false())
            )

    tag_indexes = {index["name"] for index in inspector.get_indexes("tags")}
    if "ix_tags_book_active" not in tag_indexes:
        op.create_index("ix_tags_book_active", "tags", ["book_id", "is_active"])

    account_columns = {column["name"] for column in inspector.get_columns("accounts")}
    with op.batch_alter_table("accounts") as batch_op:
        if "billing_day_rule" not in account_columns:
            batch_op.add_column(
                sa.Column(
                    "billing_day_rule",
                    sa.String(length=20),
                    nullable=False,
                    server_default="current_cycle",
                )
            )
        if "is_deleted" not in account_columns:
            batch_op.add_column(
                sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false())
            )
        if "frozen_amount" not in account_columns:
            batch_op.add_column(
                sa.Column(
                    "frozen_amount",
                    sa.Numeric(15, 2),
                    nullable=False,
                    server_default="0",
                )
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tag_indexes = {index["name"] for index in inspector.get_indexes("tags")}
    if "ix_tags_book_active" in tag_indexes:
        op.drop_index("ix_tags_book_active", table_name="tags")

    tag_columns = {column["name"] for column in inspector.get_columns("tags")}
    with op.batch_alter_table("tags") as batch_op:
        if "is_system" in tag_columns:
            batch_op.drop_column("is_system")

    account_columns = {column["name"] for column in inspector.get_columns("accounts")}
    with op.batch_alter_table("accounts") as batch_op:
        if "frozen_amount" in account_columns:
            batch_op.drop_column("frozen_amount")
        if "is_deleted" in account_columns:
            batch_op.drop_column("is_deleted")
        if "billing_day_rule" in account_columns:
            batch_op.drop_column("billing_day_rule")
