from decimal import Decimal
from typing import List, Optional, Tuple
from datetime import datetime
import hashlib

from sqlalchemy import and_
from sqlalchemy.orm import Session, selectinload

from src.common.enums import (
    AccountType, TransactionType, TransactionDirection,
    TransactionStatus, SourceType
)
from src.core import (
    ErrorCode, AppException, generate_uuid, NotFoundException, IdempotencyException
)

from .models import Transaction
from .schemas import (
    TransactionCreate,
    TransactionUpdate,
    RefundCreate,
    TransferCreate,
    CreditCardRepaymentCreate,
)
from src.modules.accounts.service import (
    get_account,
    get_account_by_id,
    update_account_balance,
    update_account_debt,
    update_account_frozen,
)
from src.modules.accounts.models import Account
from src.modules.categories.models import Category
from src.modules.account_balance_snapshots import AccountBalanceSnapshot
from src.core.cache import clear_overview_cache  # 🛡️ L: 记账即刷新缓存


def _is_asset_account(account_type: str) -> bool:
    """Check if account type is asset (cash/debit_card/ewallet/virtual)"""
    return account_type in [AccountType.CASH, AccountType.DEBIT_CARD, AccountType.EWALLET, AccountType.VIRTUAL]


def _is_credit_account(account_type: str) -> bool:
    """Check if account type is credit (credit_card/credit_line)"""
    return account_type in [AccountType.CREDIT_CARD, AccountType.CREDIT_LINE]


def _is_loan_account(account_type: str) -> bool:
    """Check if account type is loan"""
    return account_type == AccountType.LOAN


def _calculate_include_flags(transaction_type: TransactionType, account_type: str) -> Tuple[bool, bool, bool]:
    """Calculate include_in_expense, include_in_income, include_in_cashflow"""
    include_expense = True
    include_income = True
    include_cashflow = True

    tx_type = transaction_type.value if hasattr(transaction_type, 'value') else transaction_type

    # Transfer - no expense/income, no cashflow (internal)
    if tx_type == TransactionType.TRANSFER:
        include_expense = False
        include_income = False
        include_cashflow = False

    # Repayment types - no expense/income
    elif tx_type in [TransactionType.REPAYMENT_CREDIT_CARD, TransactionType.REPAYMENT_LOAN,
                     TransactionType.INSTALLMENT_REPAYMENT]:
        include_expense = False
        include_income = False
        include_cashflow = False

    # Refund - handled separately based on refund account
    elif tx_type == TransactionType.REFUND:
        include_expense = False
        include_income = False
        # cashflow determined by refund account

    # Debt types - no expense/income
    elif tx_type in [TransactionType.DEBT_BORROW, TransactionType.DEBT_LEND,
                     TransactionType.DEBT_RECEIVE_BACK, TransactionType.DEBT_PAY_BACK]:
        include_expense = False
        include_income = False

    # Income - not expense
    elif tx_type == TransactionType.INCOME:
        include_expense = False

    # Expense - not income
    elif tx_type == TransactionType.EXPENSE:
        include_income = False

    # fee - not income
    elif tx_type == TransactionType.FEE:
        include_income = False

    return include_expense, include_income, include_cashflow


def _apply_transaction_effects(db: Session, txn: Transaction, is_new: bool = True):
    """Apply transaction effects to accounts"""
    account = get_account_by_id(db, txn.account_id)
    if not account:
        return

    account_type = account.account_type

    # Get counterparty account if exists
    counterparty = None
    if txn.counterparty_account_id:
        counterparty = get_account_by_id(db, txn.counterparty_account_id)

    tx_type = txn.transaction_type

    # Determine direction
    direction = txn.direction.value if hasattr(txn.direction, 'value') else txn.direction
    is_inflow = direction == TransactionDirection.IN.value
    is_outflow = direction == TransactionDirection.OUT.value

    # === EXPENSE ===
    if tx_type == TransactionType.EXPENSE.value:
        if _is_asset_account(account_type):
            # Asset account: balance decreases, cashflow
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)
        elif _is_credit_account(account_type):
            is_system_installment_execution = (
                txn.source_type == SourceType.SYSTEM.value
                and not txn.counterparty_account_id
                and bool(txn.business_key)
                and txn.business_key.startswith("installment:")
                and ":p" in txn.business_key
            )
            update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
            if is_system_installment_execution:
                update_account_frozen(db, txn.account_id, txn.amount, is_increase=False)
            txn.include_in_cashflow = False
        elif _is_loan_account(account_type):
            # Loan account: not typical for expense
            pass

    # === INCOME ===
    elif tx_type == TransactionType.INCOME.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=True)

    # === INSTALLMENT_PURCHASE ===
    elif tx_type == TransactionType.INSTALLMENT_PURCHASE.value:
        if _is_credit_account(account_type):
            # Credit account: debt increases, no cashflow
            update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
            txn.include_in_cashflow = False

    # === FEE ===
    elif tx_type == TransactionType.FEE.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)

    # === TRANSFER ===
    elif tx_type == TransactionType.TRANSFER.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)
        if counterparty and _is_asset_account(counterparty.account_type):
            update_account_balance(db, txn.counterparty_account_id, txn.amount, is_increase=True)

    # === REPAYMENT_CREDIT_CARD ===
    elif tx_type == TransactionType.REPAYMENT_CREDIT_CARD.value:
        # From account: balance decreases
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)
        # To account (credit): debt decreases
        if counterparty and _is_credit_account(counterparty.account_type):
            update_account_debt(db, txn.counterparty_account_id, txn.amount, is_increase=False)

    # === REPAYMENT_LOAN ===
    elif tx_type == TransactionType.REPAYMENT_LOAN.value:
        # From account: balance decreases
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)
        # To account (loan): debt decreases
        if counterparty and _is_loan_account(counterparty.account_type):
            update_account_debt(db, txn.counterparty_account_id, txn.amount, is_increase=False)

    # === INSTALLMENT_REPAYMENT ===
    elif tx_type == TransactionType.INSTALLMENT_REPAYMENT.value:
        if _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
            update_account_frozen(db, txn.account_id, txn.amount, is_increase=False)
            txn.include_in_cashflow = False

    # === DEBT_BORROW ===
    elif tx_type == TransactionType.DEBT_BORROW.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=True)

    # === DEBT_LEND ===
    elif tx_type == TransactionType.DEBT_LEND.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)

    # === DEBT_RECEIVE_BACK ===
    elif tx_type == TransactionType.DEBT_RECEIVE_BACK.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=True)

    # === DEBT_PAY_BACK ===
    elif tx_type == TransactionType.DEBT_PAY_BACK.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)

    # === REFUND ===
    elif tx_type == TransactionType.REFUND.value:
        # Refund only affects the refund account
        refund_account = get_account_by_id(db, txn.account_id)
        if refund_account:
            if _is_asset_account(refund_account.account_type):
                update_account_balance(db, txn.account_id, txn.amount, is_increase=True)
                txn.include_in_cashflow = True
            elif _is_credit_account(refund_account.account_type):
                update_account_debt(db, txn.account_id, txn.amount, is_increase=False)
                txn.include_in_cashflow = False


def create_transaction(
    db: Session,
    book_id: str,
    data: TransactionCreate,
    include_expense_override: bool = None,
    include_income_override: bool = None,
    include_cashflow_override: bool = None,
) -> Transaction:
    """Create new transaction

    Args:
        include_expense_override: If provided, override the auto-calculated include_in_expense
        include_income_override: If provided, override the auto-calculated include_in_income
        include_cashflow_override: If provided, override the auto-calculated include_in_cashflow
    """
    """Create new transaction with balance updates"""

    # Check account exists
    account = get_account(db, data.account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    # Check counterparty account if provided
    if data.counterparty_account_id:
        counterparty = get_account(db, data.counterparty_account_id, book_id)
        if not counterparty:
            raise NotFoundException("Counterparty account not found")

    # Idempotency check for non-manual transactions
    # 排除状态为 void 的交易,允许重新导入已删除的交易
    if data.business_key and data.source_type != SourceType.MANUAL:
        existing = db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.source_type == data.source_type.value,
            Transaction.business_key == data.business_key,
            Transaction.status != "void"
        ).first()
        if existing:
            raise IdempotencyException(f"Transaction already exists: {data.business_key}")

    # Calculate include flags (unless overridden)
    auto_expense, auto_income, auto_cashflow = _calculate_include_flags(
        data.transaction_type, account.account_type
    )

    # Use auto-calculated values unless explicitly overridden
    final_include_expense = include_expense_override if include_expense_override is not None else auto_expense
    final_include_income = include_income_override if include_income_override is not None else auto_income
    final_include_cashflow = include_cashflow_override if include_cashflow_override is not None else auto_cashflow

    # Create transaction
    txn = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=data.occurred_at,
        posted_at=data.posted_at,
        transaction_type=data.transaction_type.value,
        direction=data.direction.value,
        amount=data.amount,
        currency=data.currency,
        account_id=data.account_id,
        counterparty_account_id=data.counterparty_account_id,
        category_id=data.category_id,
        merchant=data.merchant,
        note=data.note,
        external_ref=data.external_ref,
        source_type=data.source_type.value,
        source_batch_id=data.source_batch_id,
        source_row_no=data.source_row_no,
        tags=data.tags,
        extra=data.extra,
        related_transaction_id=data.related_transaction_id,
        business_key=data.business_key,
        include_in_expense=final_include_expense,
        include_in_income=final_include_income,
        include_in_cashflow=final_include_cashflow,
        status=TransactionStatus.CONFIRMED.value,
        # 🛡️ L: 暗号触发 — 备注含"隐藏"则设为隐身账单
        is_hidden="隐藏" in (data.note or ""),
    )

    # Generate import hash if not provided
    if not txn.import_hash and data.source_type != SourceType.MANUAL:
        hash_content = f"{txn.occurred_at}|{txn.amount}|{txn.account_id}|{txn.merchant or ''}"
        txn.import_hash = hashlib.sha256(hash_content.encode()).hexdigest()

    db.add(txn)

    # Apply account effects
    _apply_transaction_effects(db, txn)

    db.commit()
    db.refresh(txn)
    return txn
    clear_overview_cache()  # 🛡️ L



def create_transfer(db: Session, book_id: str, data: TransferCreate) -> Transaction:
    """Create transfer transaction (single record with dual balance/debt update)"""

    # Validate accounts
    from_account = get_account(db, data.from_account_id, book_id)
    to_account = get_account(db, data.to_account_id, book_id)

    if not from_account or not to_account:
        raise NotFoundException("Account not found")

    if data.from_account_id == data.to_account_id:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Cannot transfer to same account")

    # Create single transfer transaction (record the outflow)
    txn = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=data.occurred_at,
        transaction_type=TransactionType.TRANSFER.value,
        direction=TransactionDirection.OUT.value,
        amount=data.amount,
        currency=data.currency,
        account_id=data.from_account_id,
        counterparty_account_id=data.to_account_id,
        note=data.note,
        tags=data.tags,
        source_type=SourceType.MANUAL.value,
        include_in_expense=False,
        include_in_income=False,
        include_in_cashflow=False,
        status=TransactionStatus.CONFIRMED.value,
    )

    # Apply updates to both accounts based on their types
    from_type = from_account.account_type
    to_type = to_account.account_type

    # From account: decreases balance or debt
    if _is_asset_account(from_type):
        update_account_balance(db, data.from_account_id, data.amount, is_increase=False)
    elif _is_credit_account(from_type):
        update_account_debt(db, data.from_account_id, data.amount, is_increase=False)
    elif _is_loan_account(from_type):
        update_account_debt(db, data.from_account_id, data.amount, is_increase=False)

    # To account: increases balance or debt
    if _is_asset_account(to_type):
        update_account_balance(db, data.to_account_id, data.amount, is_increase=True)
    elif _is_credit_account(to_type):
        update_account_debt(db, data.to_account_id, data.amount, is_increase=True)
    elif _is_loan_account(to_type):
        update_account_debt(db, data.to_account_id, data.amount, is_increase=True)

    db.add(txn)
    db.commit()
    db.refresh(txn)

    return txn
    clear_overview_cache()  # 🛡️ L: create_transfer


def create_credit_card_repayment(
    db: Session,
    book_id: str,
    data: CreditCardRepaymentCreate,
) -> Transaction:
    """Create a credit card repayment transaction."""

    from_account = get_account(db, data.from_account_id, book_id)
    credit_account = get_account(db, data.credit_card_account_id, book_id)

    if not from_account or not credit_account:
        raise NotFoundException("Account not found")

    if data.from_account_id == data.credit_card_account_id:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Cannot repay to same account")

    if not _is_asset_account(from_account.account_type):
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Repayment source must be an asset account")

    if not _is_credit_account(credit_account.account_type):
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Repayment target must be a credit account")

    current_debt = credit_account.debt_amount or Decimal("0")
    if current_debt <= 0:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Credit account has no outstanding debt")

    if data.amount > current_debt:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message=f"Repayment amount exceeds current debt: {current_debt}"
        )

    txn = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=data.occurred_at,
        transaction_type=TransactionType.REPAYMENT_CREDIT_CARD.value,
        direction=TransactionDirection.OUT.value,
        amount=data.amount,
        currency=data.currency,
        account_id=data.from_account_id,
        counterparty_account_id=data.credit_card_account_id,
        note=data.note,
        tags=data.tags,
        source_type=SourceType.MANUAL.value,
        include_in_expense=False,
        include_in_income=False,
        include_in_cashflow=False,
        status=TransactionStatus.CONFIRMED.value,
    )

    db.add(txn)
    _apply_transaction_effects(db, txn)

    db.commit()
    db.refresh(txn)
    return txn


def create_refund(db: Session, book_id: str, data: RefundCreate) -> Transaction:
    """Create refund transaction"""

    # Get original transaction
    original = db.query(Transaction).filter(
        Transaction.id == data.original_transaction_id,
        Transaction.book_id == book_id
    ).first()

    if not original:
        raise NotFoundException("Original transaction not found")

    # Check refund account
    refund_account = get_account(db, data.refund_account_id, book_id)
    if not refund_account:
        raise NotFoundException("Refund account not found")

    # Calculate refund amount limit (total refunds cannot exceed original)
    total_refunded = db.query(Transaction).filter(
        Transaction.related_transaction_id == data.original_transaction_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == TransactionStatus.CONFIRMED.value
    ).all()

    refunded_sum = sum(t.amount for t in total_refunded)
    if refunded_sum + data.amount > original.amount:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message=f"Refund amount exceeds remaining. Original: {original.amount}, Already refunded: {refunded_sum}"
        )

    # Determine cashflow based on refund account type
    if _is_asset_account(refund_account.account_type):
        include_cashflow = True
    else:
        include_cashflow = False

    # Create refund transaction
    refund_txn = Transaction(
        id=generate_uuid(),
        book_id=book_id,
        occurred_at=data.occurred_at,
        transaction_type=TransactionType.REFUND.value,
        direction=TransactionDirection.IN.value,
        amount=data.amount,
        currency=original.currency,
        account_id=data.refund_account_id,
        category_id=original.category_id,
        merchant=original.merchant,
        # 退款交易的备注由前端显示前缀,后端只保留用户输入的备注
        note=data.note if data.note else None,
        related_transaction_id=data.original_transaction_id,
        business_key=f"refund:{data.original_transaction_id}:{datetime.utcnow().timestamp()}",
        source_type=SourceType.MANUAL.value,
        include_in_expense=False,
        include_in_income=False,
        include_in_cashflow=include_cashflow,
        status=TransactionStatus.CONFIRMED.value,
    )

    _apply_transaction_effects(db, refund_txn)

    db.add(refund_txn)

    # Update original transaction note to indicate refund
    if original.note:
        if "<已退款>" not in original.note:
            original.note = original.note + " <已退款>"
    else:
        original.note = "<已退款>"

    # Set refund transaction note with "<退款>" prefix
    if refund_txn.note:
        refund_txn.note = "<退款> " + refund_txn.note
    else:
        refund_txn.note = "<退款>"

    db.commit()
    db.refresh(refund_txn)
    return refund_txn
    clear_overview_cache()  # 🛡️ L



def get_transactions(db: Session, book_id: str, filters: dict) -> Tuple[List[Transaction], int]:
    """Get transactions with filters - Optimized version"""
    # 🛡️ L: 预加载 category 和 account 关系，消除 N+1（避免遍历每条记录时单独查库）
    query = db.query(Transaction).options(
        selectinload(Transaction.category),
        selectinload(Transaction.account),
    ).filter(Transaction.book_id == book_id)

    # Apply filters
    if filters.get("date_from"):
        query = query.filter(Transaction.occurred_at >= filters["date_from"])
    if filters.get("date_to"):
        query = query.filter(Transaction.occurred_at <= filters["date_to"])
    if filters.get("account_id"):
        query = query.filter(Transaction.account_id == filters["account_id"])
    if filters.get("category_id"):
        query = query.filter(Transaction.category_id == filters["category_id"])
    if filters.get("transaction_type"):
        query = query.filter(Transaction.transaction_type == filters["transaction_type"])
    if filters.get("status"):
        query = query.filter(Transaction.status == filters["status"])
    else:
        # 默认不显示已作废交易,除非明确指定 status
        query = query.filter(Transaction.status != TransactionStatus.VOID.value)
    if filters.get("keyword"):
        query = query.filter(
            Transaction.merchant.ilike(f"%{filters['keyword']}%") |
            Transaction.note.ilike(f"%{filters['keyword']}%")
        )
    if filters.get("tag"):
        # Filter by tags JSON field containing the tag name
        query = query.filter(Transaction.tags.ilike(f"%{filters['tag']}%"))

    # 🛡️ L: 隐身账单过滤 — 默认不显示，除非明确要求
    if not filters.get("include_hidden"):
        query = query.filter(Transaction.is_hidden == False)

    # Get total count - 使用窗口函数优化
    total = query.count()

    # Pagination
    page = filters.get("page", 1)
    page_size = filters.get("page_size", 50)
    query = query.order_by(Transaction.occurred_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    transactions = query.all()

    # 🛡️ L: 优化 - 使用单次子查询获取所有已退款ID,避免 N+1
    if transactions:
        ids = [t.id for t in transactions]
        refunded_ids = set(
            row[0] for row in db.query(Transaction.related_transaction_id).filter(
                Transaction.related_transaction_id.in_(ids),
                Transaction.transaction_type == TransactionType.REFUND.value,
                Transaction.status == TransactionStatus.CONFIRMED.value
            ).all()
        )
        # 为每个交易添加 has_refund 标记
        for t in transactions:
            t.has_refund = t.id in refunded_ids
    else:
        for t in transactions:
            t.has_refund = False

    return transactions, total


def get_transaction(db: Session, transaction_id: str, book_id: str) -> Optional[Transaction]:
    """Get transaction by ID"""
    return db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.book_id == book_id
    ).first()


def _reverse_transaction_effects(db: Session, txn: Transaction):
    """Reverse transaction effects on accounts (for update/void)"""
    if txn.status != TransactionStatus.CONFIRMED.value:
        return

    account = get_account_by_id(db, txn.account_id)
    if not account:
        return

    account_type = account.account_type
    counterparty = None
    if txn.counterparty_account_id:
        counterparty = get_account_by_id(db, txn.counterparty_account_id)

    tx_type = txn.transaction_type
    amount = txn.amount
    direction = txn.direction

    # Reverse based on transaction type and direction
    if tx_type == TransactionType.EXPENSE.value:
        if _is_asset_account(account_type):
            # Reverse: balance increase
            update_account_balance(db, txn.account_id, amount, is_increase=True)
        elif _is_credit_account(account_type):
            is_system_installment_execution = (
                txn.source_type == SourceType.SYSTEM.value
                and not txn.counterparty_account_id
                and bool(txn.business_key)
                and txn.business_key.startswith("installment:")
                and ":p" in txn.business_key
            )
            # Reverse: debt decrease
            update_account_debt(db, txn.account_id, amount, is_increase=False)
            if is_system_installment_execution:
                update_account_frozen(db, txn.account_id, amount, is_increase=True)

    elif tx_type == TransactionType.INCOME.value:
        if _is_asset_account(account_type):
            # Reverse: balance decrease
            update_account_balance(db, txn.account_id, amount, is_increase=False)

    elif tx_type == TransactionType.FEE.value:
        if _is_asset_account(account_type):
            # Reverse: balance increase
            update_account_balance(db, txn.account_id, amount, is_increase=True)

    elif tx_type == TransactionType.TRANSFER.value:
        # Transfer reversal: reverse both accounts (opposite of apply)
        # From account: was decreased, now increase
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=True)
        elif _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=True)
        elif _is_loan_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=True)

        # To account: was increased, now decrease
        if txn.counterparty_account_id and counterparty:
            to_type = counterparty.account_type
            if _is_asset_account(to_type):
                update_account_balance(db, txn.counterparty_account_id, amount, is_increase=False)
            elif _is_credit_account(to_type):
                update_account_debt(db, txn.counterparty_account_id, amount, is_increase=False)
            elif _is_loan_account(to_type):
                update_account_debt(db, txn.counterparty_account_id, amount, is_increase=False)

    elif tx_type == TransactionType.REPAYMENT_CREDIT_CARD.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=True)
        if counterparty and _is_credit_account(counterparty.account_type):
            update_account_debt(db, txn.counterparty_account_id, amount, is_increase=True)

    elif tx_type == TransactionType.REPAYMENT_LOAN.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=True)
        if counterparty and _is_loan_account(counterparty.account_type):
            update_account_debt(db, txn.counterparty_account_id, amount, is_increase=True)

    elif tx_type == TransactionType.INSTALLMENT_REPAYMENT.value:
        if _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=False)
            update_account_frozen(db, txn.account_id, amount, is_increase=True)

    elif tx_type == TransactionType.INSTALLMENT_PURCHASE.value:
        if _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=False)

    elif tx_type == TransactionType.DEBT_BORROW.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=False)

    elif tx_type == TransactionType.DEBT_LEND.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=True)

    elif tx_type == TransactionType.DEBT_RECEIVE_BACK.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=False)

    elif tx_type == TransactionType.DEBT_PAY_BACK.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=True)

    elif tx_type == TransactionType.REFUND.value:
        # Reverse based on refund account type
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=False)
        elif _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=True)


def update_transaction(db: Session, transaction_id: str, book_id: str, data: TransactionUpdate) -> Transaction:
    """Update transaction"""
    txn = get_transaction(db, transaction_id, book_id)
    if not txn:
        raise NotFoundException("Transaction not found")

    # Store old values for recalculating include flags
    old_account_id = txn.account_id
    old_tx_type = txn.transaction_type

    # Reverse old transaction effects first
    _reverse_transaction_effects(db, txn)

    # Apply changes
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(txn, key, value)

    # 🛡️ L: 暗号触发 — 更新时若备注含"隐藏"则同步更新 is_hidden
    if "note" in update_data and "隐藏" in (update_data["note"] or ""):
        txn.is_hidden = True
    elif "note" in update_data:
        txn.is_hidden = False

    # Recalculate include flags if account or type changed
    new_account_id = txn.account_id
    new_tx_type = txn.transaction_type

    if new_account_id != old_account_id or new_tx_type != old_tx_type:
        account = get_account_by_id(db, new_account_id)
        if account:
            include_expense, include_income, include_cashflow = _calculate_include_flags(
                new_tx_type, account.account_type
            )
            txn.include_in_expense = include_expense
            txn.include_in_income = include_income
            txn.include_in_cashflow = include_cashflow

    # Apply new transaction effects
    _apply_transaction_effects(db, txn)

    db.commit()
    db.refresh(txn)
    return txn
    clear_overview_cache()  # 🛡️ L



def delete_transaction(db: Session, transaction_id: str, book_id: str) -> None:
    """Delete transaction permanently"""
    txn = get_transaction(db, transaction_id, book_id)
    if not txn:
        raise NotFoundException("Transaction not found")

    # Reverse transaction effects first (update account balance)
    _reverse_transaction_effects(db, txn)

    # Delete the transaction permanently
    db.delete(txn)
    db.commit()
    clear_overview_cache()  # 🛡️ L: delete_transaction


def _get_or_create_adjustment_category(db: Session, book_id: str) -> str:
    """
    获取或创建"余额调整"系统分类。
    如果不存在则创建,返回 category_id。
    """
    category_name = "余额调整"
    existing = db.query(Category).filter(
        Category.book_id == book_id,
        Category.name == category_name
    ).first()

    if existing:
        return existing.id

    # 创建新的调整分类
    new_category = Category(
        id=generate_uuid(),
        book_id=book_id,
        name=category_name,
        category_type="expense",  # 调整类可计入支出
        icon="🔧",
    )
    db.add(new_category)
    db.flush()  # 获取ID但不提交
    return new_category.id


def _write_balance_snapshot(db: Session, account: Account, adjust_mode: str, book_id: str) -> None:
    """🛡️ L: 写入账户余额快照(在同一事务中调用)"""
    from src.modules.account_balance_snapshots import AccountBalanceSnapshot
    from datetime import date as date_type

    # 获取 user_id(从 book 关系)
    from src.modules.books.models import Book
    book = db.query(Book).filter(Book.id == book_id).with_for_update().first()
    if not book:
        return

    snapshot_date = date_type.today()
    balance_value = account.current_balance if adjust_mode == "balance" else account.debt_amount

    existing = db.query(AccountBalanceSnapshot).filter(
        AccountBalanceSnapshot.account_id == account.id,
        AccountBalanceSnapshot.snapshot_date == snapshot_date
    ).with_for_update().first()

    if existing:
        existing.end_of_day_balance = balance_value
        existing.updated_at = datetime.utcnow()
    else:
        snap = AccountBalanceSnapshot(
            id=generate_uuid(),
            user_id=book.user_id,
            account_id=account.id,
            snapshot_date=snapshot_date,
            end_of_day_balance=balance_value,
        )
        db.add(snap)


def adjust_account_balance(
    db: Session,
    book_id: str,
    account_id: str,
    target_value: Decimal,
    adjust_mode: str = "balance",  # "balance" | "available_credit"
    note: str = "",
    is_counted_in_reports: bool = False
) -> Transaction:
    """
    合规平账操作:为账户生成调整交易流水,修正余额或可用额度。

    Args:
        db: 数据库会话
        book_id: 账本ID
        account_id: 账户ID
        target_value: 目标值(资产账户为目标余额,信用账户为目标可用额度)
        adjust_mode: 调整模式
            - "balance": 调整当前余额(资产类账户)
            - "available_credit": 调整可用额度(信用类账户)
        note: 调整原因(必填)
        is_counted_in_reports: 是否计入收支报表

    Returns:
        创建的调整交易记录

    Algorithm:
        资产账户: delta = target_balance - current_balance
                 delta > 0 → income, delta < 0 → expense

        信用账户: target_debt = credit_limit - target_available
                 delta_debt = target_debt - current_debt
                 delta_debt > 0 → expense (欠款增加), delta_debt < 0 → income (欠款减少)
    """
    if not note:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                          message="调整原因不能为空")

    # 获取账户信息(行级悲观锁,防止并发脏读)
    account = db.query(Account).filter(
        Account.id == account_id
    ).with_for_update().first()
    if not account:
        raise NotFoundException("Account not found")

    if account.book_id != book_id:
        raise NotFoundException("Account not found in this book")

    # 计算差额
    adjustment_amount: Decimal
    direction: TransactionDirection
    transaction_type: TransactionType

    if adjust_mode == "balance":
        # 资产账户:调整余额
        current_balance = account.current_balance or Decimal("0")
        delta = target_value - current_balance

        if delta > 0:
            # 盘盈:余额增加 → 收入
            adjustment_amount = abs(delta)
            direction = TransactionDirection.IN
            transaction_type = TransactionType.INCOME
        else:
            # 盘亏:余额减少 → 支出
            adjustment_amount = abs(delta)
            direction = TransactionDirection.OUT
            transaction_type = TransactionType.EXPENSE

    elif adjust_mode == "available_credit":
        # 信用账户:调整可用额度
        # 🛡️ L: 正确的财务公式
        # Available_Credit = Credit_Limit - Debt_Amount - Frozen_Amount
        # 所以: Debt_Target = Credit_Limit - Frozen_Amount - Available_Target
        credit_limit = account.credit_limit or Decimal("0")
        current_debt = account.debt_amount or Decimal("0")
        frozen_amount = account.frozen_amount or Decimal("0")

        # 🛡️ L: 必须减去冻结金额!
        target_debt = credit_limit - frozen_amount - target_value

        # 欠款差额:正数表示欠款增加(可用减少),负数表示欠款减少(可用增加)
        delta_debt = target_debt - current_debt

        if delta_debt >= 0:
            # 欠款增加 → 支出(遗漏消费/利息等)
            adjustment_amount = abs(delta_debt)
            direction = TransactionDirection.OUT
            transaction_type = TransactionType.EXPENSE
        else:
            # 欠款减少 → 收入(还款/退款等)
            adjustment_amount = abs(delta_debt)
            direction = TransactionDirection.IN
            transaction_type = TransactionType.INCOME
    else:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                          message=f"Unknown adjust_mode: {adjust_mode}")

    if adjustment_amount == 0:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT,
                          message="目标值与当前值相同,无需调整")

    # 获取调整分类
    category_id = _get_or_create_adjustment_category(db, book_id)

    # 创建调整交易
    tx_data = TransactionCreate(
        account_id=account_id,
        amount=adjustment_amount,
        direction=direction,
        transaction_type=transaction_type,
        occurred_at=datetime.utcnow(),
        category_id=category_id,
        note=note,
        source_type=SourceType.SYSTEM,
        business_key=f"adjust:{account_id}:{datetime.utcnow().isoformat()}",
    )

    # 🛡️ L: 收支统计开关 — 平账交易的收入/支出属性由 transaction_type 决定，不受 is_counted_in_reports 覆盖
    # is_counted_in_reports=False 时：收入/支出标志依然正确设置（因为平账是真实业务），仅现金流标志关闭
    count_in_expense = transaction_type == TransactionType.EXPENSE
    count_in_income = transaction_type == TransactionType.INCOME
    count_in_cashflow = is_counted_in_reports

    # 🛡️ L: 在同一事务中更新账户欠款 + 写快照，确保原子性
    if adjust_mode == "available_credit" and adjustment_amount > 0:
        from src.modules.accounts.service import update_account_debt
        is_debt_increase = delta_debt >= 0
        update_account_debt(db, account_id, adjustment_amount, is_increase=is_debt_increase)

    # 🛡️ L: 同步写入余额快照(与账户更新在同一事务内)
    _write_balance_snapshot(db, account, adjust_mode, book_id=book_id)

    return create_transaction(
        db, book_id, tx_data,
        include_expense_override=count_in_expense,
        include_income_override=count_in_income,
        include_cashflow_override=count_in_cashflow
    )
