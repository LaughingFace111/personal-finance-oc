from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.common.enums import CategoryType, TransactionType
from src.core.database import Base
from src.modules.accounts.models import Account
from src.modules.books.models import Book
from src.modules.budgets.schemas import BudgetCreateSchema
from src.modules.budgets.service import create_budget, get_budget_breakdown, get_budget_summary
from src.modules.categories.models import Category
from src.modules.tags.models import Tag
from src.modules.transactions.models import Transaction


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def budget_book(db_session):
    book = Book(
        id="book-budget-001",
        user_id="user-budget-001",
        name="预算测试账本",
        currency="CNY",
        is_default=True,
    )
    account = Account(
        id="account-budget-001",
        book_id=book.id,
        name="现金",
        account_type="cash",
        opening_balance=Decimal("0"),
        current_balance=Decimal("0"),
        is_active=True,
    )
    food = Category(
        id="cat-budget-food",
        book_id=book.id,
        name="餐饮",
        category_type=CategoryType.EXPENSE.value,
        icon="x",
        color="#000",
        is_active=True,
        is_deleted=False,
    )
    traffic = Category(
        id="cat-budget-traffic",
        book_id=book.id,
        name="交通",
        category_type=CategoryType.EXPENSE.value,
        icon="x",
        color="#000",
        is_active=True,
        is_deleted=False,
    )
    snacks = Category(
        id="cat-budget-snacks",
        book_id=book.id,
        parent_id=food.id,
        name="零食",
        category_type=CategoryType.EXPENSE.value,
        icon="x",
        color="#000",
        is_active=True,
        is_deleted=False,
    )
    db_session.add_all([book, account, food, traffic, snacks])
    dining_tag = Tag(
        id="tag-budget-dining",
        book_id=book.id,
        name="聚餐",
        color="#f00",
        is_active=True,
        is_system=False,
    )
    travel_tag = Tag(
        id="tag-budget-travel",
        book_id=book.id,
        name="出行",
        color="#0f0",
        is_active=True,
        is_system=False,
    )
    db_session.add_all([dining_tag, travel_tag])
    db_session.commit()
    return {
        "book": book,
        "account": account,
        "food": food,
        "traffic": traffic,
        "snacks": snacks,
        "dining_tag": dining_tag,
        "travel_tag": travel_tag,
    }


def _add_transaction(
    db_session,
    *,
    book_id: str,
    account_id: str,
    txn_id: str,
    amount: str,
    occurred_at: datetime,
    transaction_type: str = TransactionType.EXPENSE.value,
    status: str = "confirmed",
    include_in_expense: bool = True,
    category_id: str | None = None,
    related_transaction_id: str | None = None,
    tags: str | None = None,
):
    direction = "in" if transaction_type == TransactionType.REFUND.value else "out"
    txn = Transaction(
        id=txn_id,
        book_id=book_id,
        occurred_at=occurred_at,
        transaction_type=transaction_type,
        direction=direction,
        amount=Decimal(amount),
        currency="CNY",
        account_id=account_id,
        category_id=category_id,
        status=status,
        include_in_expense=include_in_expense,
        include_in_income=False,
        include_in_cashflow=True,
        related_transaction_id=related_transaction_id,
        tags=tags,
    )
    db_session.add(txn)
    return txn


def test_create_monthly_budget_rejects_duplicate_active_month(db_session, budget_book):
    book_id = budget_book["book"].id

    create_budget(db_session, book_id, BudgetCreateSchema(
        name="4 月预算",
        period_type="monthly",
        amount=Decimal("1000"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    with pytest.raises(ValueError, match="该自然月已存在激活中的预算"):
        create_budget(db_session, book_id, BudgetCreateSchema(
            name="重复预算",
            period_type="monthly",
            amount=Decimal("800"),
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            note=None,
        ))


def test_create_custom_range_budget_rejects_overlap(db_session, budget_book):
    book_id = budget_book["book"].id

    create_budget(db_session, book_id, BudgetCreateSchema(
        name="假期预算",
        period_type="custom_range",
        amount=Decimal("1200"),
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 20),
        note=None,
    ))

    with pytest.raises(ValueError, match="重叠"):
        create_budget(db_session, book_id, BudgetCreateSchema(
            name="重叠预算",
            period_type="custom_range",
            amount=Decimal("800"),
            start_date=date(2026, 4, 18),
            end_date=date(2026, 4, 25),
            note=None,
        ))


def test_budget_summary_uses_reports_expense_logic_and_refund_deduction(db_session, budget_book):
    book_id = budget_book["book"].id
    account_id = budget_book["account"].id
    food_id = budget_book["food"].id

    budget = create_budget(db_session, book_id, BudgetCreateSchema(
        name="4 月预算",
        period_type="monthly",
        amount=Decimal("1000"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-expense-1",
        amount="300",
        occurred_at=datetime(2026, 4, 5, 12, 0, 0),
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-fee-1",
        amount="20",
        occurred_at=datetime(2026, 4, 6, 12, 0, 0),
        transaction_type=TransactionType.FEE.value,
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-installment-pending",
        amount="200",
        occurred_at=datetime(2026, 4, 7, 12, 0, 0),
        transaction_type=TransactionType.INSTALLMENT_PURCHASE.value,
        status="draft",
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-expense-ignored",
        amount="100",
        occurred_at=datetime(2026, 4, 8, 12, 0, 0),
        include_in_expense=False,
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-refund-1",
        amount="50",
        occurred_at=datetime(2026, 4, 9, 12, 0, 0),
        transaction_type=TransactionType.REFUND.value,
        include_in_expense=False,
        related_transaction_id="txn-expense-1",
    )
    db_session.commit()

    summary = get_budget_summary(db_session, budget["id"], book_id)
    assert summary["spent_amount"] == Decimal("270")
    assert summary["remaining_amount"] == Decimal("730")
    assert summary["alert_status"] == "normal"


def test_budget_breakdown_returns_expenses_and_refunds_with_impact_amount(db_session, budget_book):
    book_id = budget_book["book"].id
    account_id = budget_book["account"].id
    food_id = budget_book["food"].id

    budget = create_budget(db_session, book_id, BudgetCreateSchema(
        name="4 月预算",
        period_type="monthly",
        amount=Decimal("300"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-expense-2",
        amount="200",
        occurred_at=datetime(2026, 4, 10, 12, 0, 0),
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-refund-2",
        amount="60",
        occurred_at=datetime(2026, 4, 11, 12, 0, 0),
        transaction_type=TransactionType.REFUND.value,
        include_in_expense=False,
        related_transaction_id="txn-expense-2",
    )
    db_session.commit()

    breakdown = get_budget_breakdown(db_session, budget["id"], book_id)
    assert breakdown["gross_expense"] == Decimal("200")
    assert breakdown["refund_deduction"] == Decimal("60")
    assert breakdown["net_expense"] == Decimal("140")
    assert len(breakdown["transactions"]) == 2
    expense_item = next(item for item in breakdown["transactions"] if item["transaction_type"] == "expense")
    refund_item = next(item for item in breakdown["transactions"] if item["transaction_type"] == "refund")
    assert expense_item["impact_amount"] == Decimal("200")
    assert refund_item["impact_amount"] == Decimal("-60")


def test_category_budget_summary_rolls_up_child_categories(db_session, budget_book):
    book_id = budget_book["book"].id
    account_id = budget_book["account"].id
    food_id = budget_book["food"].id
    snacks_id = budget_book["snacks"].id
    traffic_id = budget_book["traffic"].id

    budget = create_budget(db_session, book_id, BudgetCreateSchema(
        name="餐饮预算",
        period_type="monthly",
        dimension_type="category",
        category_id=food_id,
        rollup_children=True,
        amount=Decimal("500"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-food-parent",
        amount="100",
        occurred_at=datetime(2026, 4, 2, 12, 0, 0),
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-food-child",
        amount="80",
        occurred_at=datetime(2026, 4, 3, 12, 0, 0),
        category_id=snacks_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-traffic",
        amount="40",
        occurred_at=datetime(2026, 4, 4, 12, 0, 0),
        category_id=traffic_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-food-refund",
        amount="20",
        occurred_at=datetime(2026, 4, 5, 12, 0, 0),
        transaction_type=TransactionType.REFUND.value,
        include_in_expense=False,
        related_transaction_id="txn-food-child",
    )
    db_session.commit()

    summary = get_budget_summary(db_session, budget["id"], book_id)
    assert summary["dimension_type"] == "category"
    assert summary["category_id"] == food_id
    assert summary["category_name"] == "餐饮"
    assert summary["spent_amount"] == Decimal("160")


def test_category_budget_breakdown_can_disable_child_rollup(db_session, budget_book):
    book_id = budget_book["book"].id
    account_id = budget_book["account"].id
    food_id = budget_book["food"].id
    snacks_id = budget_book["snacks"].id

    budget = create_budget(db_session, book_id, BudgetCreateSchema(
        name="餐饮主分类预算",
        period_type="monthly",
        dimension_type="category",
        category_id=food_id,
        rollup_children=False,
        amount=Decimal("300"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-food-only-parent",
        amount="90",
        occurred_at=datetime(2026, 4, 10, 12, 0, 0),
        category_id=food_id,
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-food-only-child",
        amount="30",
        occurred_at=datetime(2026, 4, 11, 12, 0, 0),
        category_id=snacks_id,
    )
    db_session.commit()

    breakdown = get_budget_breakdown(db_session, budget["id"], book_id)
    assert breakdown["net_expense"] == Decimal("90")
    assert len(breakdown["transactions"]) == 1
    assert breakdown["category_breakdown"][0]["category_name"] == "餐饮"


def test_category_budget_requires_valid_category(db_session, budget_book):
    book_id = budget_book["book"].id

    with pytest.raises(ValueError, match="分类预算必须选择分类"):
        create_budget(db_session, book_id, BudgetCreateSchema(
            name="缺少分类",
            period_type="monthly",
            dimension_type="category",
            amount=Decimal("200"),
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            note=None,
        ))


def test_tag_budget_summary_matches_tag_name_and_refunds(db_session, budget_book):
    book_id = budget_book["book"].id
    account_id = budget_book["account"].id
    food_id = budget_book["food"].id
    traffic_id = budget_book["traffic"].id
    dining_tag_id = budget_book["dining_tag"].id

    budget = create_budget(db_session, book_id, BudgetCreateSchema(
        name="聚餐预算",
        period_type="monthly",
        dimension_type="tag",
        tag_id=dining_tag_id,
        amount=Decimal("400"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-tag-expense-1",
        amount="120",
        occurred_at=datetime(2026, 4, 12, 12, 0, 0),
        category_id=food_id,
        tags='["聚餐", "朋友"]',
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-tag-expense-2",
        amount="80",
        occurred_at=datetime(2026, 4, 13, 12, 0, 0),
        category_id=traffic_id,
        tags='["出行"]',
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-tag-refund-1",
        amount="20",
        occurred_at=datetime(2026, 4, 14, 12, 0, 0),
        transaction_type=TransactionType.REFUND.value,
        include_in_expense=False,
        related_transaction_id="txn-tag-expense-1",
    )
    db_session.commit()

    summary = get_budget_summary(db_session, budget["id"], book_id)
    assert summary["dimension_type"] == "tag"
    assert summary["tag_id"] == dining_tag_id
    assert summary["tag_name"] == "聚餐"
    assert summary["spent_amount"] == Decimal("100")


def test_tag_budget_breakdown_only_includes_matching_transactions(db_session, budget_book):
    book_id = budget_book["book"].id
    account_id = budget_book["account"].id
    food_id = budget_book["food"].id
    dining_tag_id = budget_book["dining_tag"].id

    budget = create_budget(db_session, book_id, BudgetCreateSchema(
        name="聚餐预算",
        period_type="monthly",
        dimension_type="tag",
        tag_id=dining_tag_id,
        amount=Decimal("200"),
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
        note=None,
    ))

    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-tag-breakdown-1",
        amount="90",
        occurred_at=datetime(2026, 4, 15, 12, 0, 0),
        category_id=food_id,
        tags='["聚餐"]',
    )
    _add_transaction(
        db_session,
        book_id=book_id,
        account_id=account_id,
        txn_id="txn-tag-breakdown-2",
        amount="50",
        occurred_at=datetime(2026, 4, 16, 12, 0, 0),
        category_id=food_id,
        tags='["出行"]',
    )
    db_session.commit()

    breakdown = get_budget_breakdown(db_session, budget["id"], book_id)
    assert breakdown["tag_name"] == "聚餐"
    assert breakdown["net_expense"] == Decimal("90")
    assert len(breakdown["transactions"]) == 1
    assert breakdown["transactions"][0]["id"] == "txn-tag-breakdown-1"


def test_tag_budget_requires_valid_tag(db_session, budget_book):
    book_id = budget_book["book"].id

    with pytest.raises(ValueError, match="标签预算必须选择标签"):
        create_budget(db_session, book_id, BudgetCreateSchema(
            name="缺少标签",
            period_type="monthly",
            dimension_type="tag",
            amount=Decimal("200"),
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            note=None,
        ))
