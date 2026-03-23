"""extend keyword rules with tag target

Revision ID: 002
Revises: 001
Create Date: 2026-03-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table("tags"):
        op.create_table(
            "tags",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("book_id", sa.String(36), nullable=False),
            sa.Column("parent_id", sa.String(36), nullable=True),
            sa.Column("name", sa.String(50), nullable=False),
            sa.Column("color", sa.String(20), nullable=True),
            sa.Column("is_active", sa.Boolean(), default=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        )
        op.create_index("ix_tags_book_id", "tags", ["book_id"])
        op.create_index("ix_tags_parent_id", "tags", ["parent_id"])

    existing_columns = {column["name"] for column in inspector.get_columns("category_rules")}
    with op.batch_alter_table("category_rules") as batch_op:
        if "target_type" not in existing_columns:
            batch_op.add_column(sa.Column("target_type", sa.String(length=20), nullable=True, server_default="category"))
        if "target_tag_id" not in existing_columns:
            batch_op.add_column(sa.Column("target_tag_id", sa.String(length=36), nullable=True))
        if "target_tags_json" not in existing_columns:
            batch_op.add_column(sa.Column("target_tags_json", sa.Text(), nullable=True))

    op.execute("UPDATE category_rules SET target_type = 'account' WHERE target_account_id IS NOT NULL")
    op.execute("UPDATE category_rules SET target_type = 'category' WHERE target_category_id IS NOT NULL")

    with op.batch_alter_table("category_rules") as batch_op:
        batch_op.alter_column("target_type", nullable=False, server_default="category")
        foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys("category_rules")}
        if "fk_category_rules_target_tag_id" not in foreign_keys:
            batch_op.create_foreign_key("fk_category_rules_target_tag_id", "tags", ["target_tag_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("category_rules") as batch_op:
        batch_op.drop_constraint("fk_category_rules_target_tag_id", type_="foreignkey")
        batch_op.drop_column("target_tags_json")
        batch_op.drop_column("target_tag_id")
        batch_op.drop_column("target_type")
