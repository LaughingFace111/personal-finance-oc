from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
import tempfile

import pytest
from sqlalchemy import text
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from src.common.enums import AccountType, SourceType, TransactionDirection, TransactionType
from src.core.database import Base
from src.modules.accounts.models import Account
from src.modules.accounts.rebuild import rebuild_account_balance
from src.modules.accounts.router import get as get_account_detail
from src.modules.accounts.router import get_balance_trend
from src.modules.books.models import Book
from src.modules.installments.schemas import CreateInstallmentRequest
from src.modules.installments.service import (
    create_installment_with_transaction,
    delete_installment_plan,
    execute_installment_period,
    revert_installment_period,
)
from src.modules.loans.models import LoanPlan
from src.modules.transactions.schemas import TransactionCreate, TransferCreate
from src.modules.transactions.service import adjust_account_balance, create_transaction, create_transfer


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


def test_asset_balance_trend_uses_2025_12_31_as_initial_baseline(db_session, test_book):
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

    assert [point["balance"] for point in trend] == [110.0, 110.0, 115.0]
    assert [point["date"] for point in trend] == ["2026-01-02", "2026-01-03", "2026-01-04"]


def test_asset_balance_trend_april_continues_from_backfilled_march_history(db_session, test_book):
    asset = Account(
        id="asset-april-001",
        book_id=test_book.id,
        name="备用金",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("100"),
        current_balance=Decimal("100"),
        created_at=datetime(2026, 4, 10, 8, 0, 0),
        is_active=True,
    )
    db_session.add(asset)
    db_session.commit()

    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=asset.id,
            occurred_at=datetime(2026, 3, 15, 9, 0, 0),
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
            occurred_at=datetime(2026, 4, 2, 9, 0, 0),
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=Decimal("10"),
            source_type=SourceType.MANUAL,
        ),
    )

    asset.current_balance = Decimal("999")
    db_session.commit()

    trend = get_balance_trend(
        asset.id,
        start_date="2026-04-01",
        end_date="2026-04-03",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert [point["balance"] for point in trend] == [120.0, 110.0, 110.0]
    assert [point["date"] for point in trend] == ["2026-04-01", "2026-04-02", "2026-04-03"]


def test_balance_trend_not_cut_off_by_account_created_at(db_session, test_book):
    asset = Account(
        id="asset-created-at-001",
        book_id=test_book.id,
        name="历史资产",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("100"),
        current_balance=Decimal("100"),
        created_at=datetime(2026, 4, 1, 8, 0, 0),
        is_active=True,
    )
    db_session.add(asset)
    db_session.commit()

    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=asset.id,
            occurred_at=datetime(2026, 3, 5, 9, 0, 0),
            transaction_type=TransactionType.INCOME,
            direction=TransactionDirection.IN,
            amount=Decimal("20"),
            source_type=SourceType.MANUAL,
        ),
    )

    trend = get_balance_trend(
        asset.id,
        start_date="2026-03-05",
        end_date="2026-03-06",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert [point["balance"] for point in trend] == [120.0, 120.0]
    assert [point["date"] for point in trend] == ["2026-03-05", "2026-03-06"]


def test_credit_account_initial_debt_uses_2025_12_31_baseline(db_session, test_book):
    credit = Account(
        id="credit-baseline-001",
        book_id=test_book.id,
        name="基线信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        opening_balance=Decimal("0"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("200"),
        frozen_amount=Decimal("0"),
        created_at=datetime(2026, 4, 1, 8, 0, 0),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    # 用 EXPENSE 而非 REPAYMENT_CREDIT_CARD，避免触发结清校验
    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=credit.id,
            occurred_at=datetime(2026, 2, 15, 9, 0, 0),
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=Decimal("50"),
            source_type=SourceType.MANUAL,
        ),
    )

    trend = get_balance_trend(
        credit.id,
        start_date="2026-02-01",
        end_date="2026-02-28",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    balances = {p["date"]: p for p in trend}
    assert balances["2026-02-01"]["balance"] == 800.0
    assert balances["2026-02-14"]["balance"] == 800.0
    assert balances["2026-02-15"]["balance"] == 750.0
    assert balances["2026-02-16"]["balance"] == 750.0


def test_get_credit_account_detail_no_transactions_does_not_500(db_session, test_book):
    credit = Account(
        id="credit-detail-no-txn-001",
        book_id=test_book.id,
        name="无流水信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=None,
        billing_day="5",
        repayment_day="20",
        opening_balance=None,
        current_balance=None,
        debt_amount=None,
        frozen_amount=None,
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    detail = get_account_detail(
        credit.id,
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert detail["id"] == credit.id
    assert detail["current_statement_balance"] == Decimal("0")
    assert detail["is_overdue"] is False
    assert detail["credit_limit"] == Decimal("0")
    assert detail["debt_amount"] == Decimal("0")
    assert detail["frozen_amount"] == Decimal("0")


def test_get_credit_account_balance_trend_no_transactions_does_not_500(db_session, test_book):
    credit = Account(
        id="credit-trend-no-txn-001",
        book_id=test_book.id,
        name="无流水信用账户",
        account_type=AccountType.CREDIT_LINE.value,
        credit_limit=None,
        billing_day="8",
        repayment_day="18",
        opening_balance=None,
        current_balance=None,
        debt_amount=None,
        frozen_amount=None,
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-10",
        end_date="2026-04-12",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend == [
        {
            "date": "2026-04-10",
            "balance": 0.0,
            "debt_amount": 0.0,
            "frozen_amount": 0.0,
            "credit_limit": 0.0,
        },
        {
            "date": "2026-04-11",
            "balance": 0.0,
            "debt_amount": 0.0,
            "frozen_amount": 0.0,
            "credit_limit": 0.0,
        },
        {
            "date": "2026-04-12",
            "balance": 0.0,
            "debt_amount": 0.0,
            "frozen_amount": 0.0,
            "credit_limit": 0.0,
        },
    ]


def test_get_credit_account_balance_trend_without_account_state_events_table_does_not_500(db_session, test_book):
    credit = Account(
        id="credit-trend-no-events-table-001",
        book_id=test_book.id,
        name="老库信用账户",
        account_type=AccountType.CREDIT_LINE.value,
        credit_limit=Decimal("2000"),
        billing_day="8",
        repayment_day="18",
        opening_balance=None,
        current_balance=Decimal("0"),
        debt_amount=Decimal("300"),
        frozen_amount=Decimal("50"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    db_session.execute(text("DROP TABLE account_state_events"))
    db_session.commit()

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-10",
        end_date="2026-04-12",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend == [
        {
            "date": "2026-04-10",
            "balance": 1650.0,
            "debt_amount": 300.0,
            "frozen_amount": 50.0,
            "credit_limit": 2000.0,
        },
        {
            "date": "2026-04-11",
            "balance": 1650.0,
            "debt_amount": 300.0,
            "frozen_amount": 50.0,
            "credit_limit": 2000.0,
        },
        {
            "date": "2026-04-12",
            "balance": 1650.0,
            "debt_amount": 300.0,
            "frozen_amount": 50.0,
            "credit_limit": 2000.0,
        },
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

    assert trend[0]["date"] == "2026-02-03"
    assert trend[0]["balance"] == 900.0


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

    assert [point["balance"] for point in trend] == [1000.0, 900.0, 900.0]
    assert [point["date"] for point in trend] == ["2026-03-02", "2026-03-03", "2026-03-04"]


def test_credit_balance_trend_freezes_from_application_day_and_execution_only_changes_fee(db_session, test_book):
    credit = Account(
        id="credit-002",
        book_id=test_book.id,
        name="招商信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    plan, _ = create_installment_with_transaction(
        db_session,
        test_book.id,
        CreateInstallmentRequest(
            occurred_at=datetime(2026, 4, 15, 10, 0, 0),
            account_id=credit.id,
            merchant="手机",
            total_amount=Decimal("100"),
            total_periods=1,
            principal_per_period=Decimal("100"),
            fee_per_period=Decimal("5"),
            installment_amount=Decimal("105"),
            start_date=datetime(2026, 4, 15).date(),
            first_execution_date=datetime(2026, 4, 20).date(),
            first_billing_date=datetime(2026, 4, 20).date(),
        ),
    )
    execute_installment_period(db_session, plan.id, test_book.id)
    assert plan.application_date == datetime(2026, 4, 15, 10, 0, 0)

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-14",
        end_date="2026-04-20",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    balances = {point["date"]: point["balance"] for point in trend}
    assert balances["2026-04-14"] == 1000.0
    assert balances["2026-04-15"] == 900.0
    assert balances["2026-04-19"] == 900.0
    assert balances["2026-04-20"] == 895.0


def test_balance_trend_includes_transactions_on_end_date(db_session, test_book):
    asset = Account(
        id="asset-002",
        book_id=test_book.id,
        name="储蓄卡",
        account_type=AccountType.DEBIT_CARD.value,
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
            occurred_at=datetime(2026, 5, 31, 23, 59, 59),
            transaction_type=TransactionType.INCOME,
            direction=TransactionDirection.IN,
            amount=Decimal("10"),
            source_type=SourceType.MANUAL,
        ),
    )

    trend = get_balance_trend(
        asset.id,
        start_date="2026-05-31",
        end_date="2026-05-31",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend[0]["balance"] == 110.0


def test_adjust_available_credit_generates_income_that_reduces_credit_debt(db_session, test_book):
    credit = Account(
        id="credit-003",
        book_id=test_book.id,
        name="广发信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("300"),
        frozen_amount=Decimal("100"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    adjust_account_balance(
        db_session,
        test_book.id,
        credit.id,
        target_value=Decimal("700"),
        adjust_mode="available_credit",
        note="修正可用额度",
    )
    db_session.refresh(credit)

    assert credit.debt_amount == Decimal("200")


def test_credit_fee_reduces_available_credit_and_rebuild_consistent(db_session, test_book):
    credit = Account(
        id="credit-fee-001",
        book_id=test_book.id,
        name="信用账户",
        account_type=AccountType.CREDIT_LINE.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=credit.id,
            occurred_at=datetime(2026, 4, 1, 9, 0, 0),
            transaction_type=TransactionType.FEE,
            direction=TransactionDirection.OUT,
            amount=Decimal("10"),
            source_type=SourceType.MANUAL,
        ),
    )
    db_session.refresh(credit)
    assert credit.debt_amount == Decimal("10")

    rebuild_account_balance(db_session, credit.id)
    db_session.refresh(credit)
    assert credit.debt_amount == Decimal("10")

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-01",
        end_date="2026-04-01",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert trend == [{
        "date": "2026-04-01",
        "balance": 990.0,
        "debt_amount": 10.0,
        "frozen_amount": 0.0,
        "credit_limit": 1000.0,
    }]


def test_installment_delete_releases_freeze_from_delete_effective_date_only(db_session, test_book, monkeypatch):
    credit = Account(
        id="credit-delete-001",
        book_id=test_book.id,
        name="删除分期信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    plan, _ = create_installment_with_transaction(
        db_session,
        test_book.id,
        CreateInstallmentRequest(
            occurred_at=datetime(2026, 4, 15, 10, 0, 0),
            account_id=credit.id,
            merchant="耳机",
            total_amount=Decimal("100"),
            total_periods=1,
            principal_per_period=Decimal("100"),
            fee_per_period=Decimal("0"),
            installment_amount=Decimal("100"),
            start_date=date(2026, 4, 15),
            first_execution_date=date(2026, 4, 20),
            first_billing_date=date(2026, 4, 20),
        ),
    )

    # Verify deleting an unexecuted installment only releases the freeze starting
    # from the delete effective date, without changing prior daily balances.
    monkeypatch.setattr(
        "src.modules.installments.service.get_local_business_date",
        lambda: date(2026, 4, 18),
    )
    delete_installment_plan(db_session, plan.id, test_book.id)

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-14",
        end_date="2026-04-19",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert [point["balance"] for point in trend] == [1000.0, 900.0, 900.0, 900.0, 1000.0, 1000.0]
    assert [point["frozen_amount"] for point in trend] == [0.0, 100.0, 100.0, 100.0, 0.0, 0.0]


def test_delete_installment_uses_business_date(db_session, test_book, monkeypatch):
    credit = Account(
        id="credit-delete-date-001",
        book_id=test_book.id,
        name="业务日删除信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    plan, _ = create_installment_with_transaction(
        db_session,
        test_book.id,
        CreateInstallmentRequest(
            occurred_at=datetime(2026, 4, 15, 10, 0, 0),
            account_id=credit.id,
            merchant="音箱",
            total_amount=Decimal("100"),
            total_periods=1,
            principal_per_period=Decimal("100"),
            fee_per_period=Decimal("0"),
            installment_amount=Decimal("100"),
            start_date=date(2026, 4, 15),
            first_execution_date=date(2026, 4, 20),
            first_billing_date=date(2026, 4, 20),
        ),
    )

    monkeypatch.setattr(
        "src.modules.installments.service.get_local_business_date",
        lambda: date(2026, 4, 18),
    )

    delete_installment_plan(db_session, plan.id, test_book.id)

    from src.modules.installments.models import InstallmentStateEvent

    delete_event = db_session.query(InstallmentStateEvent).filter(
        InstallmentStateEvent.source_plan_id == plan.id,
        InstallmentStateEvent.event_type == "installment_deleted",
    ).one()

    assert delete_event.event_date == date(2026, 4, 18)


def test_account_state_events_migration_created():
    pytest.importorskip("alembic")
    from alembic import command
    from alembic.config import Config

    project_root = Path(__file__).resolve().parents[1]
    alembic_ini = project_root / "alembic.ini"

    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "migration-test.db"
        config = Config(str(alembic_ini))
        config.set_main_option("script_location", str(project_root / "migrations"))
        config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

        command.upgrade(config, "head")

        engine = create_engine(f"sqlite:///{db_path}")
        try:
            inspector = inspect(engine)
            assert "account_state_events" in inspector.get_table_names()
        finally:
            engine.dispose()


def test_installment_execute_then_revert_trend_consistent(db_session, test_book):
    credit = Account(
        id="credit-revert-001",
        book_id=test_book.id,
        name="回退分期信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    plan, _ = create_installment_with_transaction(
        db_session,
        test_book.id,
        CreateInstallmentRequest(
            occurred_at=datetime(2026, 4, 15, 10, 0, 0),
            account_id=credit.id,
            merchant="电脑",
            total_amount=Decimal("100"),
            total_periods=1,
            principal_per_period=Decimal("100"),
            fee_per_period=Decimal("5"),
            installment_amount=Decimal("105"),
            start_date=date(2026, 4, 15),
            first_execution_date=date(2026, 4, 16),
            first_billing_date=date(2026, 4, 16),
        ),
    )
    result = execute_installment_period(db_session, plan.id, test_book.id)
    revert_installment_period(db_session, result["schedule"].id, test_book.id)
    db_session.refresh(credit)

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-15",
        end_date="2026-04-16",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert [point["balance"] for point in trend] == [900.0, 900.0]
    assert [point["debt_amount"] for point in trend] == [0.0, 0.0]
    assert [point["frozen_amount"] for point in trend] == [100.0, 100.0]
    assert credit.debt_amount == Decimal("0")
    assert credit.frozen_amount == Decimal("100")


def test_loan_trend_remaining_principal_full_flow(db_session, test_book):
    loan = Account(
        id="loan-full-001",
        book_id=test_book.id,
        name="经营贷",
        account_type=AccountType.LOAN.value,
        opening_balance=Decimal("0"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        is_active=True,
    )
    cash = Account(
        id="loan-full-cash-001",
        book_id=test_book.id,
        name="收款卡",
        account_type=AccountType.DEBIT_CARD.value,
        opening_balance=Decimal("5000"),
        current_balance=Decimal("5000"),
        is_active=True,
    )
    plan = LoanPlan(
        id="loan-full-plan-001",
        account_id=loan.id,
        loan_name="经营贷",
        principal_total=Decimal("1000"),
        principal_remaining=Decimal("750"),
        annual_interest_rate=Decimal("0.05"),
        repayment_method="equal_principal_interest",
        total_periods=12,
        current_period=1,
        monthly_payment_estimated=Decimal("100"),
        first_due_date=date(2026, 3, 15),
        repayment_day=15,
        status="active",
    )
    db_session.add_all([loan, cash, plan])
    db_session.commit()

    create_transfer(
        db_session,
        test_book.id,
        TransferCreate(
            from_account_id=loan.id,
            to_account_id=cash.id,
            amount=Decimal("1000"),
            occurred_at=datetime(2026, 3, 1, 9, 0, 0),
            currency="CNY",
        ),
    )
    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=cash.id,
            counterparty_account_id=loan.id,
            occurred_at=datetime(2026, 3, 5, 9, 0, 0),
            transaction_type=TransactionType.REPAYMENT_LOAN,
            direction=TransactionDirection.INTERNAL,
            amount=Decimal("250"),
            source_type=SourceType.MANUAL,
            include_in_expense=False,
            include_in_income=False,
            include_in_cashflow=False,
        ),
    )
    create_transaction(
        db_session,
        test_book.id,
        TransactionCreate(
            account_id=loan.id,
            occurred_at=datetime(2026, 3, 6, 9, 0, 0),
            transaction_type=TransactionType.FEE,
            direction=TransactionDirection.OUT,
            amount=Decimal("30"),
            source_type=SourceType.MANUAL,
        ),
    )

    rebuild_account_balance(db_session, loan.id)
    db_session.refresh(loan)

    trend = get_balance_trend(
        loan.id,
        start_date="2026-03-01",
        end_date="2026-03-06",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert [point["balance"] for point in trend] == [1000.0, 1000.0, 1000.0, 1000.0, 750.0, 750.0]
    assert loan.debt_amount == Decimal("750")


def test_month_selector_local_date_boundary():
    app_source = Path(__file__).resolve().parents[2] / "web" / "src" / "App.tsx"
    content = app_source.read_text(encoding="utf-8")
    month_range_start = content.index("const getMonthRange = (selectedMonth: string) => {")
    month_range_end = content.index("  const loadAccount = async () => {", month_range_start)
    month_range_block = content[month_range_start:month_range_end]

    assert "dateFrom: formatLocalDate(monthStart)" in month_range_block
    assert "dateTo: formatLocalDate(monthEnd)" in month_range_block
    assert "toISOString()" not in month_range_block


def test_account_detail_balance_trend_uses_account_endpoint_and_credit_copy():
    app_source = Path(__file__).resolve().parents[2] / "web" / "src" / "App.tsx"
    content = app_source.read_text(encoding="utf-8")
    detail_start = content.index("// 账户详情页")
    detail_end = content.index("      {/* 余额调整弹窗 */}", detail_start)
    detail_block = content[detail_start:detail_end]

    assert "apiGet(`/api/accounts/${accountId}/balance-trend?start_date=${range.startDate}&end_date=${range.endDate}`)" in detail_block
    assert "每日收盘可用额度趋势" in detail_block
    assert "每日收盘剩余本金趋势" in detail_block
    assert "每日收盘余额趋势" in detail_block
    assert "`可用额度: ¥${value.toFixed(2)}`" in detail_block
    assert "`已用额度: ¥${Number(point?.debt_amount || 0).toFixed(2)}`" in detail_block
    assert "`冻结额度: ¥${Number(point?.frozen_amount || 0).toFixed(2)}`" in detail_block
    assert "`总额度: ¥${Number(point?.credit_limit || 0).toFixed(2)}`" in detail_block
    assert '<Empty description="所选月份暂无趋势数据" />' in detail_block


def test_rebuild_after_installment_events(db_session, test_book):
    credit = Account(
        id="credit-rebuild-events-001",
        book_id=test_book.id,
        name="事件重建信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    plan, _ = create_installment_with_transaction(
        db_session,
        test_book.id,
        CreateInstallmentRequest(
            occurred_at=datetime(2026, 4, 15, 10, 0, 0),
            account_id=credit.id,
            merchant="平板",
            total_amount=Decimal("100"),
            total_periods=1,
            principal_per_period=Decimal("100"),
            fee_per_period=Decimal("5"),
            installment_amount=Decimal("105"),
            start_date=date(2026, 4, 15),
            first_execution_date=date(2026, 4, 16),
            first_billing_date=date(2026, 4, 16),
        ),
    )
    result = execute_installment_period(db_session, plan.id, test_book.id)
    revert_installment_period(db_session, result["schedule"].id, test_book.id)

    # rebuild: new_debt starts from stored debt_amount (0), net transaction delta is 0
    rebuild_account_balance(db_session, credit.id)
    db_session.refresh(credit)

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-15",
        end_date="2026-04-16",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    assert credit.debt_amount == Decimal("0")
    assert credit.frozen_amount == Decimal("100")
    assert [point["balance"] for point in trend] == [900.0, 900.0]


def test_rebuild_credit_account_preserves_initial_debt_without_transactions(db_session, test_book):
    """
    信用账户创建时设置初始欠款，rebuild 后应保留该初始欠款（不做重算丢失）。
    create_account 对信用账户：opening_balance = 初始欠款，debt_amount = 0。
    rebuild 对信用账户：new_debt = opening_balance（初始欠款），无交易时保持不变。
    """
    credit = Account(
        id="credit-init-debt-no-txn-001",
        book_id=test_book.id,
        name="初始欠款无交易信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        opening_balance=Decimal("200"),  # initial debt carried in opening_balance
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    # No transactions — rebuild must not lose the initial debt
    rebuild_account_balance(db_session, credit.id)
    db_session.refresh(credit)

    assert credit.debt_amount == Decimal("200")


def test_rebuild_credit_account_consistent_with_trend_endpoint(db_session, test_book):
    """
    信用账户 rebuild 后债务值与 get_balance_trend 趋势终点一致。
    initial debt=50, EXPENSE 200 (+debt), INCOME 100 (-debt) → net 150.
    rebuild 终点债务 = 150, trend endpoint 债务 = 150。
    """
    credit = Account(
        id="credit-init-debt-consistent-001",
        book_id=test_book.id,
        name="初始欠款一致性信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        opening_balance=Decimal("50"),  # initial debt
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    # EXPENSE: +200 debt
    create_transaction(
        db_session, test_book.id,
        TransactionCreate(
            account_id=credit.id,
            occurred_at=datetime(2026, 4, 15, 9, 0, 0),
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=Decimal("200"),
            source_type=SourceType.MANUAL,
        ),
    )
    # INCOME (repayment): -100 debt
    create_transaction(
        db_session, test_book.id,
        TransactionCreate(
            account_id=credit.id,
            occurred_at=datetime(2026, 4, 20, 9, 0, 0),
            transaction_type=TransactionType.INCOME,
            direction=TransactionDirection.IN,
            amount=Decimal("100"),
            source_type=SourceType.MANUAL,
        ),
    )

    rebuild_account_balance(db_session, credit.id)
    db_session.refresh(credit)

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-20",
        end_date="2026-04-20",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    # rebuild 后债务 = 初始 50 + EXPENSE 200 - INCOME 100 = 150
    assert credit.debt_amount == Decimal("150")
    # trend 终点债务 = 150，balance = 1000 - 150 = 850
    assert float(trend[0]["debt_amount"]) == 150.0
    assert float(trend[0]["balance"]) == 850.0


def test_rebuild_credit_account_with_initial_debt_and_transactions(db_session, test_book):
    """
    信用账户：初始欠款 + 多笔交易，rebuild 正确累加所有交易变动。
    initial debt=50, EXPENSE 200 → net debt=250, balance=750.
    rebuild 得出债务 250，trend 反映债务 250。
    """
    credit = Account(
        id="credit-init-debt-txns-001",
        book_id=test_book.id,
        name="初始欠款多交易信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("1000"),
        opening_balance=Decimal("50"),  # initial debt
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(credit)
    db_session.commit()

    create_transaction(
        db_session, test_book.id,
        TransactionCreate(
            account_id=credit.id,
            occurred_at=datetime(2026, 4, 15, 9, 0, 0),
            transaction_type=TransactionType.EXPENSE,
            direction=TransactionDirection.OUT,
            amount=Decimal("200"),
            source_type=SourceType.MANUAL,
        ),
    )

    rebuild_account_balance(db_session, credit.id)
    db_session.refresh(credit)

    trend = get_balance_trend(
        credit.id,
        start_date="2026-04-15",
        end_date="2026-04-15",
        current_user=None,
        db=db_session,
        book_id=test_book.id,
    )

    # net debt = initial 50 + EXPENSE 200 = 250; balance = 1000 - 250 = 750
    assert credit.debt_amount == Decimal("250")
    assert float(trend[0]["debt_amount"]) == 250.0
    assert float(trend[0]["balance"]) == 750.0
