from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core import AppException
from src.core.database import Base
from src.modules.accounts.models import Account
from src.modules.books.models import Book
from src.modules.categories.models import Category
from src.modules.transactions.models import Transaction
from src.modules.transactions.schemas import RefundCreate
from src.modules.transactions.service import create_refund, get_transaction


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def refund_fixture(db_session):
    book = Book(
        id="book-refund-001",
        user_id="user-refund-001",
        name="退款测试账本",
        currency="CNY",
        is_default=True,
    )
    expense_account = Account(
        id="account-expense-001",
        book_id=book.id,
        name="招商信用卡",
        account_type="credit_card",
        credit_limit=Decimal("5000"),
        debt_amount=Decimal("1200"),
        current_balance=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    refund_account = Account(
        id="account-refund-001",
        book_id=book.id,
        name="现金",
        account_type="cash",
        opening_balance=Decimal("100"),
        current_balance=Decimal("100"),
        is_active=True,
    )
    category = Category(
        id="category-refund-001",
        book_id=book.id,
        name="数码",
        category_type="expense",
        icon="x",
        color="#000",
        is_active=True,
        is_deleted=False,
    )
    original = Transaction(
        id="txn-original-001",
        book_id=book.id,
        occurred_at=datetime(2026, 4, 20, 12, 0, 0),
        transaction_type="expense",
        direction="out",
        amount=Decimal("100"),
        currency="CNY",
        account_id=expense_account.id,
        category_id=category.id,
        merchant="Apple Store",
        note="原始消费",
        status="confirmed",
        include_in_expense=True,
        include_in_income=False,
        include_in_cashflow=False,
    )
    db_session.add_all([book, expense_account, refund_account, category, original])
    db_session.commit()
    return {
        "book_id": book.id,
        "refund_account_id": refund_account.id,
        "original_transaction_id": original.id,
    }


def test_partial_refunds_accumulate_and_mark_full_refund(db_session, refund_fixture):
    payload = RefundCreate(
        occurred_at=datetime(2026, 4, 21, 10, 0, 0),
        original_transaction_id=refund_fixture["original_transaction_id"],
        refund_account_id=refund_fixture["refund_account_id"],
        amount=Decimal("30"),
        reason="退差价",
    )
    refund = create_refund(db_session, refund_fixture["book_id"], payload)

    assert refund.note == "退差价"
    original_after_first = get_transaction(
        db_session,
        refund_fixture["original_transaction_id"],
        refund_fixture["book_id"],
    )
    assert original_after_first.refunded_amount == Decimal("30")
    assert original_after_first.remaining_refundable_amount == Decimal("70")
    assert original_after_first.is_partially_refunded is True
    assert original_after_first.is_fully_refunded is False
    assert len(original_after_first.linked_refunds) == 1

    create_refund(
        db_session,
        refund_fixture["book_id"],
        RefundCreate(
            occurred_at=datetime(2026, 4, 22, 9, 0, 0),
            original_transaction_id=refund_fixture["original_transaction_id"],
            refund_account_id=refund_fixture["refund_account_id"],
            amount=Decimal("70"),
            note="补全退款",
        ),
    )

    original_after_second = get_transaction(
        db_session,
        refund_fixture["original_transaction_id"],
        refund_fixture["book_id"],
    )
    assert original_after_second.refunded_amount == Decimal("100")
    assert original_after_second.remaining_refundable_amount == Decimal("0")
    assert original_after_second.is_partially_refunded is False
    assert original_after_second.is_fully_refunded is True
    assert len(original_after_second.linked_refunds) == 2


def test_partial_refund_rejects_amount_above_remaining(db_session, refund_fixture):
    create_refund(
        db_session,
        refund_fixture["book_id"],
        RefundCreate(
            occurred_at=datetime(2026, 4, 21, 10, 0, 0),
            original_transaction_id=refund_fixture["original_transaction_id"],
            refund_account_id=refund_fixture["refund_account_id"],
            amount=Decimal("80"),
            note="第一笔退款",
        ),
    )

    with pytest.raises(AppException, match="剩余可退款金额"):
        create_refund(
            db_session,
            refund_fixture["book_id"],
            RefundCreate(
                occurred_at=datetime(2026, 4, 21, 18, 0, 0),
                original_transaction_id=refund_fixture["original_transaction_id"],
                refund_account_id=refund_fixture["refund_account_id"],
                amount=Decimal("25"),
                note="超额退款",
            ),
        )
