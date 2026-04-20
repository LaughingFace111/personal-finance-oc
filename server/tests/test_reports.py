from datetime import date, datetime
from decimal import Decimal
import json
import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("SECRET_KEY", "test-secret")

from src.common.enums import CategoryType, TransactionType
from src.core.database import Base
from src.modules.auth.models import User
from src.modules.books.models import Book
from src.modules.categories.models import Category
from src.modules.reports.service import get_expense_by_category
from src.modules.tags.models import Tag
from src.modules.transactions.models import Transaction
from src.modules.accounts.models import Account


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def report_book(db_session):
    user = User(
        id="user-report-001",
        email="report@example.com",
        password_hash="hashed",
    )
    book = Book(
        id="book-report-001",
        user_id=user.id,
        name="报表测试账本",
        currency="CNY",
        is_default=True,
    )
    account = Account(
        id="account-report-001",
        book_id=book.id,
        name="现金",
        account_type="cash",
        opening_balance=Decimal("0"),
        current_balance=Decimal("0"),
        is_active=True,
    )
    db_session.add_all([user, book, account])
    db_session.commit()
    return {"user": user, "book": book, "account": account}


def _add_category(db_session, book_id: str, category_id: str, name: str, parent_id: str | None = None):
    category = Category(
        id=category_id,
        book_id=book_id,
        parent_id=parent_id,
        name=name,
        category_type=CategoryType.EXPENSE.value,
        icon="x",
        color="#000",
        is_active=True,
        is_deleted=False,
    )
    db_session.add(category)
    return category


def _add_tag(db_session, book_id: str, tag_id: str, name: str):
    tag = Tag(
        id=tag_id,
        book_id=book_id,
        name=name,
        is_active=True,
    )
    db_session.add(tag)
    return tag


def _add_transaction(
    db_session,
    book_id: str,
    account_id: str,
    txn_id: str,
    category_id: str | None,
    amount: str,
    occurred_at: datetime,
    transaction_type: str = TransactionType.EXPENSE.value,
    related_transaction_id: str | None = None,
    tag_names: list[str] | None = None,
):
    txn = Transaction(
        id=txn_id,
        book_id=book_id,
        occurred_at=occurred_at,
        transaction_type=transaction_type,
        direction="out" if transaction_type != TransactionType.REFUND.value else "in",
        amount=Decimal(amount),
        currency="CNY",
        account_id=account_id,
        category_id=category_id,
        status="confirmed",
        tags=json.dumps(tag_names, ensure_ascii=False) if tag_names is not None else None,
        related_transaction_id=related_transaction_id,
        include_in_expense=True,
        include_in_income=False,
        include_in_cashflow=True,
    )
    db_session.add(txn)
    return txn


def test_expense_by_category_exclude_single_category(db_session, report_book):
    book_id = report_book["book"].id
    account_id = report_book["account"].id
    _add_category(db_session, book_id, "cat-food", "餐饮")
    _add_category(db_session, book_id, "cat-traffic", "交通")
    _add_transaction(db_session, book_id, account_id, "txn-food", "cat-food", "30", datetime(2026, 4, 3, 12, 0, 0))
    _add_transaction(db_session, book_id, account_id, "txn-traffic", "cat-traffic", "20", datetime(2026, 4, 4, 12, 0, 0))
    db_session.commit()

    result = get_expense_by_category(
        db_session,
        book_id,
        date(2026, 4, 1),
        date(2026, 4, 30),
        exclude_category_ids={"cat-food"},
    )

    assert [item["id"] for item in result] == ["cat-traffic"]
    assert result[0]["net_amount"] == Decimal("20")


def test_expense_by_category_exclude_multiple_categories(db_session, report_book):
    book_id = report_book["book"].id
    account_id = report_book["account"].id
    _add_category(db_session, book_id, "cat-food", "餐饮")
    _add_category(db_session, book_id, "cat-traffic", "交通")
    _add_category(db_session, book_id, "cat-home", "居家")
    _add_transaction(db_session, book_id, account_id, "txn-food", "cat-food", "30", datetime(2026, 4, 3, 12, 0, 0))
    _add_transaction(db_session, book_id, account_id, "txn-traffic", "cat-traffic", "20", datetime(2026, 4, 4, 12, 0, 0))
    _add_transaction(db_session, book_id, account_id, "txn-home", "cat-home", "50", datetime(2026, 4, 5, 12, 0, 0))
    db_session.commit()

    result = get_expense_by_category(
        db_session,
        book_id,
        date(2026, 4, 1),
        date(2026, 4, 30),
        exclude_category_ids={"cat-food", "cat-home"},
    )

    assert [item["id"] for item in result] == ["cat-traffic"]
    assert result[0]["net_amount"] == Decimal("20")


def test_expense_by_category_exclude_with_child_categories(db_session, report_book):
    book_id = report_book["book"].id
    account_id = report_book["account"].id
    _add_category(db_session, book_id, "cat-parent", "餐饮")
    _add_category(db_session, book_id, "cat-child-1", "早餐", parent_id="cat-parent")
    _add_category(db_session, book_id, "cat-child-2", "午餐", parent_id="cat-parent")
    _add_category(db_session, book_id, "cat-other", "交通")
    _add_transaction(db_session, book_id, account_id, "txn-breakfast", "cat-child-1", "18", datetime(2026, 4, 3, 8, 0, 0))
    _add_transaction(db_session, book_id, account_id, "txn-lunch", "cat-child-2", "32", datetime(2026, 4, 3, 12, 0, 0))
    _add_transaction(db_session, book_id, account_id, "txn-other", "cat-other", "15", datetime(2026, 4, 4, 9, 0, 0))
    db_session.commit()

    result = get_expense_by_category(
        db_session,
        book_id,
        date(2026, 4, 1),
        date(2026, 4, 30),
        exclude_category_ids={"cat-parent"},
    )

    assert [item["id"] for item in result] == ["cat-other"]
    assert result[0]["net_amount"] == Decimal("15")


def test_expense_by_category_exclude_tag(db_session, report_book):
    book_id = report_book["book"].id
    account_id = report_book["account"].id
    _add_category(db_session, book_id, "cat-food", "餐饮")
    _add_category(db_session, book_id, "cat-traffic", "交通")
    _add_tag(db_session, book_id, "tag-work", "工作")
    _add_tag(db_session, book_id, "tag-life", "生活")
    _add_transaction(
        db_session,
        book_id,
        account_id,
        "txn-food",
        "cat-food",
        "30",
        datetime(2026, 4, 3, 12, 0, 0),
        tag_names=["工作"],
    )
    _add_transaction(
        db_session,
        book_id,
        account_id,
        "txn-traffic",
        "cat-traffic",
        "20",
        datetime(2026, 4, 4, 12, 0, 0),
        tag_names=["生活"],
    )
    db_session.commit()

    result = get_expense_by_category(
        db_session,
        book_id,
        date(2026, 4, 1),
        date(2026, 4, 30),
        exclude_tag_ids={"tag-work"},
    )

    assert [item["id"] for item in result] == ["cat-traffic"]
    assert result[0]["net_amount"] == Decimal("20")
