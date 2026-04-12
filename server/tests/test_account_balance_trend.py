from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.common.enums import AccountType, SourceType, TransactionDirection, TransactionType
from src.core.database import Base
from src.modules.accounts.models import Account
from src.modules.accounts.router import get_balance_trend
from src.modules.books.models import Book
from src.modules.loans.models import LoanPlan
from src.modules.transactions.schemas import TransactionCreate, TransferCreate
from src.modules.transactions.service import create_transaction, create_transfer


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def test_book(db_session):
    book = Book(
        id="test-book-001",
        user_id="test-user-001",
        name="测试账本",
        currency="CNY",
        is_default=True,
    )
    db_session.add(book)
    db_session.commit()
    return book


def test_asset_balance_trend_uses_pre_window_anchor_and_fills_missing_days(db_session, test_book):
    asset = Account(
        id="asset-001",
        book_id=test_book.id,
        name="现金",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("100"),
        current_balance=Decimal("100"),
        is_active=True,
    )
    db_session.add(asset)
    db_session.commit()

    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=asset.id,
            occurred_at=datetime(2026, 1, 1, 9, 0, 0),
            transaction_type=TransactionType.INCOME,
            direction=TransactionDirection.IN,
            amount=Decimal("20"),
            source_type=SourceType.MANUAL,
        ),
    )
    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=asset.id,
            occurred_at=datetime(2026, 1, 2, 10, 0, 0),
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=Decimal("10"),
            source_type=SourceType.MANUAL,
        ),
    )
    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=asset.id,
            occurred_at=datetime(2026, 1, 4, 12, 0, 0),
            transaction_type=TransactionType.INCOME,
            direction=TransactionDirection.IN,
            amount=Decimal("5"),
            source_type=SourceType.MANUAL,
        ),
    )

    trend = get_balance_trend(
        asset.id,
        start_date="2026-01-02",
        end_date="2026-01-04",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend == [
        {"date": "2026-01-02", "balance": 110.0},
        {"date": "2026-01-03", "balance": 110.0},
        {"date": "2026-01-04", "balance": 115.0},
    ]


def test_credit_balance_trend_matches_split_transfer_polarity(db_session, test_book):
    credit = Account(
        id="credit-001",
        book_id=test_book.id,
        name="信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    cash = Account(
        id="cash-001",
        book_id=test_book.id,
        name="现金",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("500"),
        current_balance=Decimal("500"),
        is_active=True,
    )
    db_session.add_all([credit, cash])
    db_session.commit()

    create_transfer(
        db_session,
        test_book.id,
        TransferCreate(
            from_account_id=credit.id,
            to_account_id=cash.id,
            amount=Decimal("100"),
            occurred_at=datetime(2026, 2, 3, 15, 0, 0),
            currency="CNY",
        ),
    )

    trend = get_balance_trend(
        credit.id,
        start_date="2026-02-03",
        end_date="2026-02-03",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend == [{"date": "2026-02-03", "balance": 900.0}]


def test_loan_balance_trend_returns_remaining_principal(db_session, test_book):
    loan = Account(
        id="loan-001",
        book_id=test_book.id,
        name="房贷",
        account_type=AccountType.LOAN.value,
        opening_balance=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("900"),
        is_active=True,
    )
    cash = Account(
        id="cash-002",
        book_id=test_book.id,
        name="储蓄卡",
        account_type=AccountType.DEBIT_CARD.value,
        opening_balance=Decimal("5000"),
        current_balance=Decimal("5000"),
        is_active=True,
    )
    plan = LoanPlan(
        id="loan-plan-001",
        account_id=loan.id,
        loan_name="房贷",
        principal_total=Decimal("1000"),
        principal_remaining=Decimal("900"),
        annual_interest_rate=Decimal("0.05"),
        repayment_method="equal_principal_interest",
        total_periods=12,
        current_period=1,
        monthly_payment_estimated=Decimal("100"),
        first_due_date=datetime(2026, 1, 15).date(),
        repayment_day=15,
        status="active",
    )
    db_session.add_all([loan, cash, plan])
    db_session.commit()

    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=cash.id,
            counterparty_account_id=loan.id,
            occurred_at=datetime(2026, 3, 3, 9, 0, 0),
            transaction_type=TransactionType.REPAYMENT_LOAN,
            direction=TransactionDirection.INTERNAL,
            amount=Decimal("100"),
            source_type=SourceType.MANUAL,
            include_in_expense=False,
            include_in_income=False,
            include_in_cashflow=False,
        ),
    )

    trend = get_balance_trend(
        loan.id,
        start_date="2026-03-02",
        end_date="2026-03-04",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend == [
        {"date": "2026-03-02", "balance": 1000.0},
        {"date": "2026-03-03", "balance": 900.0},
        {"date": "2026-03-04", "balance": 900.0},
    ]
