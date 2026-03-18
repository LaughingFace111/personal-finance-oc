"""initial migration

Revision ID: 001
Revises: 
Create Date: 2026-03-18

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table('users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('nickname', sa.String(100)),
        sa.Column('avatar_url', sa.String(500)),
        sa.Column('timezone', sa.String(50), default='Asia/Shanghai'),
        sa.Column('currency_default', sa.String(3), default='CNY'),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    # Books
    op.create_table('books',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('currency', sa.String(3), default='CNY'),
        sa.Column('is_default', sa.Boolean, default=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_books_user_id', 'books', ['user_id'])

    # Accounts
    op.create_table('accounts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('book_id', sa.String(36), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('account_type', sa.String(20), nullable=False),
        sa.Column('institution_name', sa.String(100)),
        sa.Column('card_last4', sa.String(4)),
        sa.Column('credit_limit', sa.Numeric(15, 2), default=0),
        sa.Column('billing_day', sa.String(10)),
        sa.Column('repayment_day', sa.String(10)),
        sa.Column('opening_balance', sa.Numeric(15, 2), default=0),
        sa.Column('current_balance', sa.Numeric(15, 2), default=0),
        sa.Column('debt_amount', sa.Numeric(15, 2), default=0),
        sa.Column('currency', sa.String(3), default='CNY'),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('note', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_accounts_book_id', 'accounts', ['book_id'])
    op.create_index('ix_accounts_book_type', 'accounts', ['book_id', 'account_type'])
    op.create_unique_constraint('uix_accounts_book_name', 'accounts', ['book_id', 'name'])

    # Categories
    op.create_table('categories',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('book_id', sa.String(36), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('parent_id', sa.String(36), sa.ForeignKey('categories.id')),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('category_type', sa.String(20), nullable=False),
        sa.Column('icon', sa.String(50)),
        sa.Column('color', sa.String(20)),
        sa.Column('sort_order', sa.Integer, default=0),
        sa.Column('is_system', sa.Boolean, default=False),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('keywords', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_categories_book_id', 'categories', ['book_id'])
    op.create_index('ix_categories_book_parent', 'categories', ['book_id', 'parent_id'])
    op.create_unique_constraint('uix_category_book_parent_name_type', 'categories', ['book_id', 'parent_id', 'name', 'category_type'])

    # Transactions
    op.create_table('transactions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('book_id', sa.String(36), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('occurred_at', sa.DateTime, nullable=False),
        sa.Column('posted_at', sa.DateTime),
        sa.Column('transaction_type', sa.String(30), nullable=False),
        sa.Column('direction', sa.String(10), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(3), default='CNY'),
        sa.Column('account_id', sa.String(36), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('counterparty_account_id', sa.String(36), sa.ForeignKey('accounts.id')),
        sa.Column('category_id', sa.String(36), sa.ForeignKey('categories.id')),
        sa.Column('merchant', sa.String(200)),
        sa.Column('note', sa.Text),
        sa.Column('external_ref', sa.String(200)),
        sa.Column('source_type', sa.String(20), default='manual'),
        sa.Column('source_batch_id', sa.String(36)),
        sa.Column('source_row_no', sa.Integer),
        sa.Column('import_hash', sa.String(64)),
        sa.Column('status', sa.String(20), default='confirmed'),
        sa.Column('tags', sa.Text),
        sa.Column('extra', sa.Text),
        sa.Column('related_transaction_id', sa.String(36)),
        sa.Column('business_key', sa.String(100)),
        sa.Column('include_in_expense', sa.Boolean, default=True),
        sa.Column('include_in_income', sa.Boolean, default=True),
        sa.Column('include_in_cashflow', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_transactions_book_id', 'transactions', ['book_id'])
    op.create_index('ix_transactions_occurred_at', 'transactions', ['occurred_at'])
    op.create_index('ix_transactions_account_id', 'transactions', ['account_id'])
    op.create_index('ix_transactions_category_id', 'transactions', ['category_id'])
    op.create_index('ix_transactions_import_hash', 'transactions', ['import_hash'])
    op.create_index('ix_transactions_status', 'transactions', ['status'])
    op.create_index('ix_transactions_book_date', 'transactions', ['book_id', 'occurred_at'])
    op.create_index('ix_transactions_book_type', 'transactions', ['book_id', 'transaction_type'])
    op.create_unique_constraint('uix_transaction_business_key', 'transactions', ['book_id', 'source_type', 'business_key'])

    # Installment Plans
    op.create_table('installment_plans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('book_id', sa.String(36), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('account_id', sa.String(36), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('transaction_id', sa.String(36), sa.ForeignKey('transactions.id')),
        sa.Column('plan_name', sa.String(200)),
        sa.Column('total_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('total_periods', sa.Integer, nullable=False),
        sa.Column('current_period', sa.Integer, default=1),
        sa.Column('principal_per_period', sa.Numeric(15, 2), nullable=False),
        sa.Column('fee_per_period', sa.Numeric(15, 2), default=0),
        sa.Column('total_fee', sa.Numeric(15, 2), default=0),
        sa.Column('start_date', sa.Date, nullable=False),
        sa.Column('first_repayment_date', sa.Date),
        sa.Column('repayment_day', sa.Integer),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('early_settlement_supported', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_installment_plans_book_id', 'installment_plans', ['book_id'])

    # Installment Schedules
    op.create_table('installment_schedules',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('installment_plan_id', sa.String(36), sa.ForeignKey('installment_plans.id'), nullable=False),
        sa.Column('period_no', sa.Integer, nullable=False),
        sa.Column('due_date', sa.Date, nullable=False),
        sa.Column('principal_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('fee_amount', sa.Numeric(15, 2), default=0),
        sa.Column('total_due', sa.Numeric(15, 2), nullable=False),
        sa.Column('paid_amount', sa.Numeric(15, 2), default=0),
        sa.Column('paid_at', sa.DateTime),
        sa.Column('payment_transaction_id', sa.String(36), sa.ForeignKey('transactions.id')),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_installment_schedules_plan_id', 'installment_schedules', ['installment_plan_id'])
    op.create_index('ix_installment_schedules_due_date', 'installment_schedules', ['due_date'])
    op.create_unique_constraint('uix_installment_period', 'installment_schedules', ['installment_plan_id', 'period_no'])

    # Loan Plans
    op.create_table('loan_plans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('account_id', sa.String(36), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('loan_name', sa.String(200)),
        sa.Column('principal_total', sa.Numeric(15, 2), nullable=False),
        sa.Column('principal_remaining', sa.Numeric(15, 2), nullable=False),
        sa.Column('annual_interest_rate', sa.Numeric(8, 4), nullable=False),
        sa.Column('repayment_method', sa.String(30), default='equal_principal_interest'),
        sa.Column('total_periods', sa.Integer, nullable=False),
        sa.Column('current_period', sa.Integer, default=0),
        sa.Column('monthly_payment_estimated', sa.Numeric(15, 2), nullable=False),
        sa.Column('first_due_date', sa.Date, nullable=False),
        sa.Column('repayment_day', sa.Integer),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_loan_plans_account_id', 'loan_plans', ['account_id'])

    # Loan Schedules
    op.create_table('loan_schedules',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('loan_plan_id', sa.String(36), sa.ForeignKey('loan_plans.id'), nullable=False),
        sa.Column('period_no', sa.Integer, nullable=False),
        sa.Column('due_date', sa.Date, nullable=False),
        sa.Column('principal_due', sa.Numeric(15, 2), nullable=False),
        sa.Column('interest_due', sa.Numeric(15, 2), nullable=False),
        sa.Column('total_due', sa.Numeric(15, 2), nullable=False),
        sa.Column('paid_amount', sa.Numeric(15, 2), default=0),
        sa.Column('paid_at', sa.DateTime),
        sa.Column('payment_transaction_id', sa.String(36)),
        sa.Column('interest_transaction_id', sa.String(36)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_loan_schedules_plan_id', 'loan_schedules', ['loan_plan_id'])
    op.create_index('ix_loan_schedules_due_date', 'loan_schedules', ['due_date'])
    op.create_unique_constraint('uix_loan_period', 'loan_schedules', ['loan_plan_id', 'period_no'])

    # Import Batches
    op.create_table('import_batches',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('book_id', sa.String(36), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('source_name', sa.String(100)),
        sa.Column('file_type', sa.String(20), nullable=False),
        sa.Column('total_rows', sa.Integer, default=0),
        sa.Column('parsed_rows', sa.Integer, default=0),
        sa.Column('confirmed_rows', sa.Integer, default=0),
        sa.Column('skipped_rows', sa.Integer, default=0),
        sa.Column('duplicate_rows', sa.Integer, default=0),
        sa.Column('status', sa.String(20), default='uploaded'),
        sa.Column('mapping_config', sa.Text),
        sa.Column('parser_version', sa.String(20)),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_import_batches_book_id', 'import_batches', ['book_id'])

    # Import Rows
    op.create_table('import_rows',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('batch_id', sa.String(36), sa.ForeignKey('import_batches.id'), nullable=False),
        sa.Column('row_no', sa.Integer, nullable=False),
        sa.Column('raw_data', sa.Text, nullable=False),
        sa.Column('normalized_data', sa.Text),
        sa.Column('guessed_account_id', sa.String(36)),
        sa.Column('guessed_category_id', sa.String(36)),
        sa.Column('guessed_transaction_type', sa.String(30)),
        sa.Column('guessed_confidence', sa.Numeric(5, 2)),
        sa.Column('duplicate_candidate_id', sa.String(36)),
        sa.Column('user_modified', sa.String(5), default='false'),
        sa.Column('confirm_status', sa.String(20), default='pending'),
        sa.Column('error_message', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_import_rows_batch_id', 'import_rows', ['batch_id'])
    op.create_index('ix_import_rows_confirm_status', 'import_rows', ['confirm_status'])
    op.create_unique_constraint('uix_import_row_batch', 'import_rows', ['batch_id', 'row_no'])

    # Category Rules
    op.create_table('category_rules',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('book_id', sa.String(36), sa.ForeignKey('books.id'), nullable=False),
        sa.Column('rule_name', sa.String(100)),
        sa.Column('match_field', sa.String(30), nullable=False),
        sa.Column('match_type', sa.String(20), default='contains'),
        sa.Column('match_value', sa.String(500), nullable=False),
        sa.Column('target_category_id', sa.String(36), sa.ForeignKey('categories.id')),
        sa.Column('target_account_id', sa.String(36), sa.ForeignKey('accounts.id')),
        sa.Column('priority', sa.Integer, default=0),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_rules_book_id', 'category_rules', ['book_id'])
    op.create_index('ix_rules_book_active', 'category_rules', ['book_id', 'is_active'])


def downgrade() -> None:
    op.drop_table('category_rules')
    op.drop_table('import_rows')
    op.drop_table('import_batches')
    op.drop_table('loan_schedules')
    op.drop_table('loan_plans')
    op.drop_table('installment_schedules')
    op.drop_table('installment_plans')
    op.drop_table('transactions')
    op.drop_table('categories')
    op.drop_table('accounts')
    op.drop_table('books')
    op.drop_table('users')
