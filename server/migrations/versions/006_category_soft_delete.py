"""add category soft delete flag

Revision ID: 006
Revises: 005
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("categories")}
    if "is_deleted" not in columns:
        op.add_column(
            "categories",
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("categories")}
    if "is_deleted" in columns:
        op.drop_column("categories", "is_deleted")
