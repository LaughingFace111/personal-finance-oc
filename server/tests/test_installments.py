from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.common.enums import AccountType, PlanStatus
from src.core.database import Base
from src.modules.accounts.models import Account
from src.modules.books.models import Book
from src.modules.installments.schemas import CreateInstallmentRequest
from src.modules.installments.service import (
    create_installment_with_transaction,
    execute_installment_period,
    get_installment_plan,
    get_installment_schedules,
)


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
        id="test-book-custom-periods",
        user_id="test-user-001",
        name="测试账本",
        currency="CNY",
        is_default=True,
    )
    db_session.add(book)
    db_session.commit()
    return book


@pytest.fixture
def credit_account(db_session, test_book):
    account = Account(
        id="credit-custom-001",
        book_id=test_book.id,
        name="测试信用卡",
        account_type=AccountType.CREDIT_CARD.value,
        credit_limit=Decimal("50000"),
        current_balance=Decimal("0"),
        debt_amount=Decimal("0"),
        frozen_amount=Decimal("0"),
        is_active=True,
    )
    db_session.add(account)
    db_session.commit()
    return account


def _make_request(
    total_periods: int,
    total_amount: str = "3000",
    fee_per_period: str = "0",
    first_billing_date: date = None,
    first_execution_date: date = None,
    repayment_day: int = 15,
) -> CreateInstallmentRequest:
    if first_billing_date is None:
        first_billing_date = date(2026, 1, 15)
    if first_execution_date is None:
        first_execution_date = date(2026, 1, 20)
    return CreateInstallmentRequest(
        occurred_at=datetime(2026, 1, 1, 12, 0, 0),
        account_id="credit-custom-001",
        merchant="自定义期数测试",
        total_amount=Decimal(total_amount),
        total_periods=total_periods,
        fee_per_period=Decimal(fee_per_period),
        installment_amount=Decimal(total_amount) / Decimal(total_periods),
        start_date=date(2026, 1, 1),
        first_execution_date=first_execution_date,
        first_billing_date=first_billing_date,
        repayment_day=repayment_day,
        plan_name="自定义期数测试",
    )


class TestCreateCustomPeriodInstallment:
    def test_create_installment_with_custom_total_periods_2(self, db_session, test_book, credit_account):
        """创建 2 期分期，验证生成 2 条 schedule，初始状态正确"""
        req = _make_request(total_periods=2, total_amount="2000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        assert plan.total_periods == 2
        assert plan.executed_periods == 0
        assert plan.current_period == 0
        assert plan.status == PlanStatus.ACTIVE.value

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 2

        # 验证每期 schedule 的 period_no 连续
        period_nos = sorted([s.period_no for s in schedules])
        assert period_nos == [1, 2]

        # 验证所有 schedule 初始状态为 pending
        for s in schedules:
            assert s.status == "pending"

    def test_create_installment_with_custom_total_periods_7(self, db_session, test_book, credit_account):
        """创建 7 期分期，验证生成 7 条 schedule，每期金额正确"""
        req = _make_request(total_periods=7, total_amount="7000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        assert plan.total_periods == 7

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 7

        # 验证每期 principal 分配：前6期相等，最后一期为总金额减前6期之和（尾差兜底）
        sorted_schedules = sorted(schedules, key=lambda s: s.period_no)
        base_principal = Decimal("1000")  # 7000 / 7 = 1000
        for i, s in enumerate(sorted_schedules[:-1]):
            assert s.period_no == i + 1
            assert s.principal_amount == base_principal
            assert s.fee_amount == Decimal("0")
            assert s.total_due == base_principal

        # 最后一期
        last = sorted_schedules[-1]
        assert last.period_no == 7
        assert last.principal_amount == base_principal  # 正好整除
        assert last.total_due == base_principal

    def test_create_installment_with_custom_total_periods_7_with_fee(self, db_session, test_book, credit_account):
        """创建 7 期分期（每期手续费 10 元），验证手续费计入每期"""
        req = _make_request(total_periods=7, total_amount="7000", fee_per_period="10")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 7

        sorted_schedules = sorted(schedules, key=lambda s: s.period_no)
        for s in sorted_schedules[:-1]:
            assert s.principal_amount == Decimal("1000")
            assert s.fee_amount == Decimal("10")
            assert s.total_due == Decimal("1010")

        # 尾差验证
        last = sorted_schedules[-1]
        assert last.principal_amount == Decimal("1000")
        assert last.fee_amount == Decimal("10")
        assert last.total_due == Decimal("1010")


class TestExecuteCustomPeriodInstallment:
    def test_execute_custom_period_installment_updates_state_correctly(self, db_session, test_book, credit_account):
        """连续执行 2 期分期，验证每期执行后 executed_periods / current_period / frozen_amount / debt_amount 正确"""
        req = _make_request(total_periods=2, total_amount="2000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        # 初始状态
        assert plan.executed_periods == 0
        assert plan.current_period == 0

        db_session.refresh(credit_account)
        initial_frozen = credit_account.frozen_amount
        initial_debt = credit_account.debt_amount

        # 执行第 1 期
        result1 = execute_installment_period(db_session, plan.id, test_book.id)
        plan1 = result1["plan"]
        db_session.refresh(credit_account)

        assert plan1.executed_periods == 1
        assert plan1.current_period == 1
        assert plan1.status == PlanStatus.ACTIVE.value  # 未完成，还有第2期

        # 第1期冻结释放 + debt 增加
        assert credit_account.frozen_amount < initial_frozen + Decimal("2000")
        assert credit_account.debt_amount > initial_debt

        # 执行第 2 期
        result2 = execute_installment_period(db_session, plan.id, test_book.id)
        plan2 = result2["plan"]
        db_session.refresh(credit_account)

        assert plan2.executed_periods == 2
        assert plan2.current_period == 2
        assert plan2.status == PlanStatus.COMPLETED.value

    def test_execute_7_period_installment_all_schedules_correct(self, db_session, test_book, credit_account):
        """创建 7 期分期，连续执行 7 期，验证状态推进与最终完成"""
        req = _make_request(total_periods=7, total_amount="7000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 7

        for i in range(1, 8):
            result = execute_installment_period(db_session, plan.id, test_book.id)
            plan = result["plan"]
            assert plan.executed_periods == i
            assert plan.current_period == i

        assert plan.status == PlanStatus.COMPLETED.value
        assert plan.executed_periods == plan.total_periods

        # 所有 schedule 状态验证
        final_schedules = get_installment_schedules(db_session, plan.id)
        for s in final_schedules:
            assert s.status == "executed"


class TestCustomPeriodInstallmentCompletion:
    def test_custom_period_installment_completes_correctly(self, db_session, test_book, credit_account):
        """创建 2 期分期，执行 2 次，验证 plan.status → completed，所有 schedule 状态正确"""
        req = _make_request(total_periods=2, total_amount="2000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        execute_installment_period(db_session, plan.id, test_book.id)
        result = execute_installment_period(db_session, plan.id, test_book.id)
        plan = result["plan"]

        assert plan.status == PlanStatus.COMPLETED.value
        assert plan.executed_periods == 2
        assert plan.current_period == 2

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 2
        for s in schedules:
            assert s.status == "executed"

    def test_remaining_periods_7_historical_scenario(self, db_session, test_book, credit_account):
        """历史补录场景：模拟"剩余 7 期"的分期创建与执行"""
        # 场景：原来是 10 期，已经执行了 3 期，录成"剩余 7 期"的新分期
        req = _make_request(
            total_periods=7,
            total_amount="7000",
            first_billing_date=date(2025, 6, 15),
            first_execution_date=date(2025, 6, 20),
        )
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        assert plan.total_periods == 7
        assert plan.executed_periods == 0

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 7

        # 验证第一期日期锚定到用户指定的首次日期
        first_schedule = next(s for s in schedules if s.period_no == 1)
        assert first_schedule.due_date == date(2025, 6, 15)

        # 连续执行 7 期，全部正确完成
        for i in range(1, 8):
            result = execute_installment_period(db_session, plan.id, test_book.id)
            plan = result["plan"]

        assert plan.status == PlanStatus.COMPLETED.value
        assert plan.executed_periods == 7

    def test_remaining_2_periods_edge_case(self, db_session, test_book, credit_account):
        """边界：剩余 2 期（最短非1期），验证创建和执行无误"""
        req = _make_request(total_periods=2, total_amount="1000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)

        assert plan.total_periods == 2

        schedules = get_installment_schedules(db_session, plan.id)
        assert len(schedules) == 2

        execute_installment_period(db_session, plan.id, test_book.id)
        result = execute_installment_period(db_session, plan.id, test_book.id)
        plan = result["plan"]

        assert plan.status == PlanStatus.COMPLETED.value
        assert plan.executed_periods == 2


class TestSchemaValidation:
    def test_total_periods_accepts_240(self, db_session, test_book, credit_account):
        """验证 total_periods 上限 240 可通过 schema 校验"""
        req = _make_request(total_periods=240, total_amount="240000")
        plan, _ = create_installment_with_transaction(db_session, test_book.id, req)
        assert plan.total_periods == 240

    def test_total_periods_rejects_zero(self, db_session, test_book, credit_account):
        """验证 total_periods = 0 被 gt=0 拦截"""
        from pydantic import ValidationError
        try:
            CreateInstallmentRequest(
                occurred_at=datetime(2026, 1, 1, 12, 0, 0),
                account_id="credit-custom-001",
                merchant="自定义期数测试",
                total_amount=Decimal("3000"),
                total_periods=0,
                fee_per_period=Decimal("0"),
                installment_amount=Decimal("0"),
                start_date=date(2026, 1, 1),
                first_execution_date=date(2026, 1, 20),
                first_billing_date=date(2026, 1, 15),
                repayment_day=15,
                plan_name="自定义期数测试",
            )
            assert False, "Should have raised ValidationError"
        except ValidationError:
            pass  # expected: pydantic ValidationError

    def test_total_periods_rejects_negative(self, db_session, test_book, credit_account):
        """验证 total_periods 负数被 gt=0 拦截"""
        from pydantic import ValidationError
        try:
            CreateInstallmentRequest(
                occurred_at=datetime(2026, 1, 1, 12, 0, 0),
                account_id="credit-custom-001",
                merchant="自定义期数测试",
                total_amount=Decimal("3000"),
                total_periods=-1,
                fee_per_period=Decimal("0"),
                installment_amount=Decimal("-3000"),
                start_date=date(2026, 1, 1),
                first_execution_date=date(2026, 1, 20),
                first_billing_date=date(2026, 1, 15),
                repayment_day=15,
                plan_name="自定义期数测试",
            )
            assert False, "Should have raised ValidationError"
        except ValidationError:
            pass
