"""add import templates

Revision ID: 004
Revises: 003
Create Date: 2026-03-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if inspector.has_table("import_templates"):
        return

    op.create_table(
        "import_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("book_id", sa.String(36), sa.ForeignKey("books.id"), nullable=False),
        sa.Column("template_name", sa.String(100), nullable=False),
        sa.Column("source_name", sa.String(100)),
        sa.Column("file_type", sa.String(20), nullable=False, server_default="csv"),
        sa.Column("sheet_name", sa.String(100)),
        sa.Column("field_mapping", sa.Text(), nullable=False),
        sa.Column("default_values", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("book_id", "template_name", name="uix_import_templates_book_name"),
    )
    op.create_index("ix_import_templates_book_id", "import_templates", ["book_id"])
    op.create_index("ix_import_templates_book_active", "import_templates", ["book_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_import_templates_book_active", table_name="import_templates")
    op.drop_index("ix_import_templates_book_id", table_name="import_templates")
    op.drop_table("import_templates")
