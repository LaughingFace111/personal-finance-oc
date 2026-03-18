"""
Transfer 账务测试
测试 transfer 的创建、更新、作废是否正确影响账户余额
"""
import pytest
from datetime import datetime
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.modules.books.models import Book
from src.modules.accounts.models import Account
from src.modules.transactions.models import Transaction
from src.modules.transactions.service import create_transfer, update_transaction, delete_transaction
from src.modules.accounts.service import create_account
from src.common.enums import AccountType


# Test fixtures
@pytest.fixture
def db_session():
    """Create in-memory SQLite database for testing"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def test_book(db_session):
    """Create test book"""
    book = Book(
        id="test-book-001",
        user_id="test-user-001",
        name="测试账本",
        currency="CNY",
        is_default=True
    )
    db_session.add(book)
    db_session.commit()
    return book


@pytest.fixture
def test_accounts(db_session, test_book):
    """Create test accounts: A=1000, B=500, C=200"""
    accounts = []
    
    # Account A - cash, balance 1000
    acc_a = Account(
        id="acc-a",
        book_id=test_book.id,
        name="账户A",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("1000"),
        current_balance=Decimal("1000"),
        is_active=True
    )
    db_session.add(acc_a)
    accounts.append(acc_a)
    
    # Account B - cash, balance 500
    acc_b = Account(
        id="acc-b",
        book_id=test_book.id,
        name="账户B",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("500"),
        current_balance=Decimal("500"),
        is_active=True
    )
    db_session.add(acc_b)
    accounts.append(acc_b)
    
    # Account C - cash, balance 200
    acc_c = Account(
        id="acc-c",
        book_id=test_book.id,
        name="账户C",
        account_type=AccountType.CASH.value,
        opening_balance=Decimal("200"),
        current_balance=Decimal("200"),
        is_active=True
    )
    db_session.add(acc_c)
    accounts.append(acc_c)
    
    db_session.commit()
    return accounts


# ========== 测试用例 ==========

def test_create_transfer(db_session, test_book, test_accounts):
    """
    用例 A：创建 transfer
    前置：账户A=1000, 账户B=500
    操作：A -> B 转账 100
    断言：A=900, B=600
    """
    from src.modules.transactions.schemas import TransferCreate
    from src.common.enums import TransactionDirection
    
    acc_a, acc_b, acc_c = test_accounts
    
    # Create transfer A -> B, 100
    data = TransferCreate(
        from_account_id=acc_a.id,
        to_account_id=acc_b.id,
        amount=Decimal("100"),
        occurred_at=datetime.now(),
        currency="CNY"
    )
    
    txn = create_transfer(db_session, test_book.id, data)
    
    # Refresh accounts to get latest balance
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    
    assert acc_a.current_balance == Decimal("900"), f"A余额应为900，实际为{acc_a.current_balance}"
    assert acc_b.current_balance == Decimal("600"), f"B余额应为600，实际为{acc_b.current_balance}"
    assert txn.transaction_type == "transfer"
    assert txn.direction == TransactionDirection.OUT.value


def test_update_transfer_amount(db_session, test_book, test_accounts):
    """
    用例 B：更新 transfer 金额
    前置：已存在 A -> B 100 (A=900, B=600)
    操作：更新金额为 150
    断言：A=850, B=650
    """
    from src.modules.transactions.schemas import TransferCreate, TransactionUpdate
    from src.common.enums import TransactionDirection
    
    acc_a, acc_b, acc_c = test_accounts
    
    # Create initial transfer A -> B, 100
    data = TransferCreate(
        from_account_id=acc_a.id,
        to_account_id=acc_b.id,
        amount=Decimal("100"),
        occurred_at=datetime.now(),
        currency="CNY"
    )
    txn = create_transfer(db_session, test_book.id, data)
    
    # Verify initial state
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    assert acc_a.current_balance == Decimal("900")
    assert acc_b.current_balance == Decimal("600")
    
    # Update transfer amount to 150
    update_data = TransactionUpdate(amount=Decimal("150"))
    updated_txn = update_transaction(db_session, txn.id, test_book.id, update_data)
    
    # Refresh accounts
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    
    # The update should:
    # 1. Reverse old effect: A +100, B -100 (A=1000, B=500)
    # 2. Apply new effect: A -150, B +150 (A=850, B=650)
    assert acc_a.current_balance == Decimal("850"), f"A余额应为850，实际为{acc_a.current_balance}"
    assert acc_b.current_balance == Decimal("650"), f"B余额应为650，实际为{acc_b.current_balance}"


def test_update_transfer_to_account(db_session, test_book, test_accounts):
    """
    用例 C：更新 transfer 转入账户
    前置：A=1000, B=500, C=200, 已存在 A -> B 100
    操作：更新为 A -> C 100
    断言：A=900, B=500, C=300
    """
    from src.modules.transactions.schemas import TransferCreate, TransactionUpdate
    
    acc_a, acc_b, acc_c = test_accounts
    
    # Create initial transfer A -> B, 100
    data = TransferCreate(
        from_account_id=acc_a.id,
        to_account_id=acc_b.id,
        amount=Decimal("100"),
        occurred_at=datetime.now(),
        currency="CNY"
    )
    txn = create_transfer(db_session, test_book.id, data)
    
    # Verify initial state
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    db_session.refresh(acc_c)
    assert acc_a.current_balance == Decimal("900")
    assert acc_b.current_balance == Decimal("600")
    assert acc_c.current_balance == Decimal("200")
    
    # Update to_account to C
    update_data = TransactionUpdate(counterparty_account_id=acc_c.id)
    updated_txn = update_transaction(db_session, txn.id, test_book.id, update_data)
    
    # Refresh accounts
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    db_session.refresh(acc_c)
    
    # The update should:
    # 1. Reverse old effect: B +100 (B=500), A stays at 900
    # 2. Apply new effect: C +100 (C=300), A stays at 900
    assert acc_a.current_balance == Decimal("900"), f"A余额应为900，实际为{acc_a.current_balance}"
    assert acc_b.current_balance == Decimal("500"), f"B余额应为500，实际为{acc_b.current_balance}"
    assert acc_c.current_balance == Decimal("300"), f"C余额应为300，实际为{acc_c.current_balance}"


def test_void_transfer(db_session, test_book, test_accounts):
    """
    用例 D：作废 transfer
    前置：已存在 A -> B 100 (A=900, B=600)
    操作：作废该 transfer
    断言：A=1000, B=500
    """
    from src.modules.transactions.schemas import TransferCreate
    
    acc_a, acc_b, acc_c = test_accounts
    
    # Create initial transfer A -> B, 100
    data = TransferCreate(
        from_account_id=acc_a.id,
        to_account_id=acc_b.id,
        amount=Decimal("100"),
        occurred_at=datetime.now(),
        currency="CNY"
    )
    txn = create_transfer(db_session, test_book.id, data)
    
    # Verify initial state
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    assert acc_a.current_balance == Decimal("900")
    assert acc_b.current_balance == Decimal("600")
    
    # Void the transfer
    delete_transaction(db_session, txn.id, test_book.id)
    
    # Refresh accounts
    db_session.refresh(acc_a)
    db_session.refresh(acc_b)
    
    # Void should reverse the effect: A +100, B -100
    assert acc_a.current_balance == Decimal("1000"), f"A余额应为1000，实际为{acc_a.current_balance}"
    assert acc_b.current_balance == Decimal("500"), f"B余额应为500，实际为{acc_b.current_balance}"
