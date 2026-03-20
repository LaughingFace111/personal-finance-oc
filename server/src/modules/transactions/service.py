from decimal import Decimal
from typing import List, Optional, Tuple
from datetime import datetime
import hashlib

from sqlalchemy import and_
from sqlalchemy.orm import Session

from src.common.enums import (
    AccountType, TransactionType, TransactionDirection, 
    TransactionStatus, SourceType
)
from src.core import (
    ErrorCode, AppException, generate_uuid, NotFoundException, IdempotencyException
)

from .models import Transaction
from .schemas import TransactionCreate, TransactionUpdate, RefundCreate, TransferCreate
from src.modules.accounts.service import get_account, get_account_by_id, update_account_balance, update_account_debt
from src.modules.accounts.models import Account


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
            # Credit account: debt increases, no cashflow
            update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
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
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=False)
        if counterparty and _is_credit_account(counterparty.account_type):
            update_account_debt(db, txn.counterparty_account_id, txn.amount, is_increase=False)

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


def create_transaction(db: Session, book_id: str, data: TransactionCreate) -> Transaction:
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
    if data.business_key and data.source_type != SourceType.MANUAL:
        existing = db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.source_type == data.source_type.value,
            Transaction.business_key == data.business_key
        ).first()
        if existing:
            raise IdempotencyException(f"Transaction already exists: {data.business_key}")

    # Calculate include flags
    include_expense, include_income, include_cashflow = _calculate_include_flags(
        data.transaction_type, account.account_type
    )

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
        include_in_expense=include_expense,
        include_in_income=include_income,
        include_in_cashflow=include_cashflow,
        status=TransactionStatus.CONFIRMED.value,
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
        note=data.note,
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
    db.commit()
    db.refresh(refund_txn)
    return refund_txn


def get_transactions(db: Session, book_id: str, filters: dict) -> Tuple[List[Transaction], int]:
    """Get transactions with filters"""
    query = db.query(Transaction).filter(Transaction.book_id == book_id)

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
        # 默认不显示已作废交易，除非明确指定 status
        query = query.filter(Transaction.status != TransactionStatus.VOID.value)
    if filters.get("keyword"):
        query = query.filter(
            Transaction.merchant.ilike(f"%{filters['keyword']}%") |
            Transaction.note.ilike(f"%{filters['keyword']}%")
        )
    if filters.get("tag"):
        # Filter by tags JSON field containing the tag name
        query = query.filter(Transaction.tags.ilike(f"%{filters['tag']}%"))

    # Get total count
    total = query.count()

    # Pagination
    page = filters.get("page", 1)
    page_size = filters.get("page_size", 50)
    query = query.order_by(Transaction.occurred_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    return query.all(), total


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
            # Reverse: debt decrease
            update_account_debt(db, txn.account_id, amount, is_increase=False)

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
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, amount, is_increase=True)
        if counterparty and _is_credit_account(counterparty.account_type):
            update_account_debt(db, txn.counterparty_account_id, amount, is_increase=True)

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


def delete_transaction(db: Session, transaction_id: str, book_id: str) -> None:
    """Delete (void) transaction"""
    txn = get_transaction(db, transaction_id, book_id)
    if not txn:
        raise NotFoundException("Transaction not found")

    # Reverse transaction effects
    _reverse_transaction_effects(db, txn)

    # Mark as void
    txn.status = TransactionStatus.VOID.value
    db.commit()
