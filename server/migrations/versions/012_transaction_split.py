"""add transaction split_group_id

Revision ID: 012
Revises: 011
Create Date: 2026-04-30

支持将一笔交易拆分为多个子交易（split items），每个子交易有独立 category_id 和 amount，
各子交易 amount 之和等于组长原始金额。

split_group_id 语义：
- 组长交易（split_group_id == id）：原始完整交易，amount = 总金额，category_id = NULL，is_hidden = True
- 子拆分（split_group_id == 组长.id）：每条有独立 category_id 和 amount
- 普通交易（split_group_id IS NULL）：原有行为不变
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "012"
down_revision: Union[str, Sequence[str], None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 split_group_id 字段
    op.add_column(
        "transactions",
        sa.Column("split_group_id", sa.String(length=36), nullable=True)
    )
    # 创建索引以加速按拆分组查询
    op.create_index("ix_transactions_split_group_id", "transactions", ["split_group_id"])

    # 添加注释（如果数据库支持）
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if hasattr(conn.dialect, 'name') and conn.dialect.name in ('postgresql', 'sqlite'):
        # SQLite / PostgreSQL 支持 COMMENT
        try:
            if conn.dialect.name == 'sqlite':
                # SQLite 不直接支持 COMMENT ON COLUMN，用 PRAGMA table_info 替代说明
                pass
        except Exception:
            pass


def downgrade() -> None:
    op.drop_index("ix_transactions_split_group_id", table_name="transactions")
    op.drop_column("transactions", "split_group_id")
