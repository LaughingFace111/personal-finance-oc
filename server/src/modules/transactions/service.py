from decimal import Decimal, InvalidOperation
from typing import List, Optional, Tuple
from datetime import datetime, timezone
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import and_, or_
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
    TransactionResponse,
    TransactionUpdate,
    RefundCreate,
    TransferCreate,
    CreditCardRepaymentCreate,
    TransferEditResponse,
    LinkedRefundTransaction,
    SplitItemCreate,
    SplitItemResponse,
    TransactionSplitResponse,
    SplitReplaceRequest,
    SplitItem,
    SplitCreate,
    SplitDetailResponse,
)
from src.modules.accounts.service import (
    calculate_credit_statement_info,
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


def _build_transfer_merchant(from_account: Account, to_account: Account) -> str:
    """Build a stable display name for transfer-like transactions."""
    return f"转账: {from_account.name} -> {to_account.name}"


def _build_credit_repayment_merchant(from_account: Account, credit_account: Account) -> str:
    """Build a stable display name for credit repayment transactions."""
    return f"信用卡还款: {from_account.name} -> {credit_account.name}"


def _validate_credit_repayment_amount(
    db: Session,
    credit_account: Account,
    repayment_amount: Decimal,
) -> Decimal:
    """Block repayments that exceed the currently billed statement balance."""
    statement_info = calculate_credit_statement_info(db, credit_account)
    current_statement_balance = statement_info.get("current_statement_balance")

    if current_statement_balance is None or current_statement_balance <= 0:
        raise HTTPException(
            status_code=400,
            detail="上期账单已结清，本期账单尚未出账，当前无须还款",
        )

    if repayment_amount > current_statement_balance:
        raise HTTPException(
            status_code=400,
            detail="还款金额不能超过本期已出账欠款。系统不支持未出账单提前还款",
        )

    return current_statement_balance


def _get_installment_frozen_release_amount(txn: Transaction) -> Decimal:
    """Return the frozen amount to release for a system-generated installment execution."""
    if not (
        txn.source_type == SourceType.SYSTEM.value
        and not txn.counterparty_account_id
        and bool(txn.business_key)
        and txn.business_key.startswith("installment:")
        and ":p" in txn.business_key
    ):
        return Decimal("0")

    if txn.extra:
        try:
            extra = json.loads(txn.extra)
        except (TypeError, json.JSONDecodeError):
            extra = None
        if isinstance(extra, dict):
            release_amount = extra.get("frozen_release_amount", extra.get("principal_amount"))
            if release_amount is not None:
                try:
                    return Decimal(str(release_amount))
                except (InvalidOperation, ValueError):
                    pass

    return txn.amount


def _build_transfer_group_key(
    transaction_id: str,
    related_transaction_id: Optional[str],
    business_key: Optional[str],
) -> str:
    """Build a stable key for transfer pair collapsing."""
    if related_transaction_id:
        left, right = sorted((transaction_id, related_transaction_id))
        return f"pair:{left}:{right}"
    return f"single:{transaction_id}"


def _prefer_transfer_display_record(current, candidate) -> bool:
    """Prefer OUT transfer rows for list display; keep IN as a fallback."""
    current_direction = current.direction.value if hasattr(current.direction, "value") else current.direction
    candidate_direction = candidate.direction.value if hasattr(candidate.direction, "value") else candidate.direction
    return (
        candidate_direction == TransactionDirection.OUT.value
        and current_direction != TransactionDirection.OUT.value
    )


def _collapse_transfer_rows(rows) -> List[str]:
    """Collapse split transfer rows into one visible transaction id per batch."""
    visible_entries = []
    transfer_map = {}

    for row in rows:
        if row.transaction_type != TransactionType.TRANSFER.value:
            visible_entries.append(("transaction", row.id))
            continue

        transfer_key = _build_transfer_group_key(
            transaction_id=row.id,
            related_transaction_id=row.related_transaction_id,
            business_key=row.business_key,
        )
        if transfer_key not in transfer_map:
            transfer_map[transfer_key] = row
            visible_entries.append(("transfer", transfer_key))
            continue

        if _prefer_transfer_display_record(transfer_map[transfer_key], row):
            transfer_map[transfer_key] = row

    visible_ids: List[str] = []
    for entry_type, entry_value in visible_entries:
        if entry_type == "transaction":
            visible_ids.append(entry_value)
        else:
            visible_ids.append(transfer_map[entry_value].id)

    return visible_ids


def _build_transactions_query(db: Session, book_id: str, filters: dict):
    """Build the base filtered transaction query shared by list and export flows."""
    query = db.query(Transaction).filter(Transaction.book_id == book_id)

    if filters.get("date_from"):
        query = query.filter(Transaction.occurred_at >= filters["date_from"])
    if filters.get("date_to"):
        query = query.filter(Transaction.occurred_at <= filters["date_to"])
    if filters.get("account_id"):
        account_id = filters["account_id"]
        account = get_account(db, account_id, book_id)
        if account and _is_credit_account(account.account_type):
            query = query.filter(
                or_(
                    Transaction.account_id == account_id,
                    Transaction.counterparty_account_id == account_id,
                )
            )
        else:
            query = query.filter(Transaction.account_id == account_id)
    if filters.get("category_id"):
        query = query.filter(Transaction.category_id == filters["category_id"])
    if filters.get("transaction_type"):
        query = query.filter(Transaction.transaction_type == filters["transaction_type"])
    if filters.get("status"):
        query = query.filter(Transaction.status == filters["status"])
    else:
        query = query.filter(Transaction.status != TransactionStatus.VOID.value)
    if filters.get("keyword"):
        query = query.filter(
            Transaction.merchant.ilike(f"%{filters['keyword']}%") |
            Transaction.note.ilike(f"%{filters['keyword']}%")
        )
    if filters.get("tag"):
        query = query.filter(Transaction.tags.ilike(f"%{filters['tag']}%"))

    if not filters.get("include_hidden"):
        query = query.filter(Transaction.is_hidden == False)

    return query


def _get_visible_transaction_ids(query) -> List[str]:
    """Return visible transaction ids after applying transfer collapsing rules.

    Split-group parent transactions (split_group_id == id with children) are excluded
    from the visible list; their child splits appear individually with their own categories.
    """
    ordering = [
        Transaction.occurred_at.desc(),
        Transaction.created_at.desc(),
        Transaction.id.desc(),
    ]
    return _collapse_transfer_rows(
        query.with_entities(
            Transaction.id,
            Transaction.transaction_type,
            Transaction.direction,
            Transaction.related_transaction_id,
            Transaction.business_key,
            Transaction.split_group_id,
        ).order_by(*ordering).all()
    )


def _apply_split_transfer_account_effect(
    db: Session,
    account_id: str,
    account_type: str,
    amount: Decimal,
    direction: str,
    reverse: bool = False,
) -> None:
    """
    Apply split-transfer balance/debt effects for a single account.

    资产账户:
    - OUT: current_balance 减少
    - IN:  current_balance 增加

    信用/贷款账户:
    - OUT: debt_amount 增加
    - IN:  debt_amount 减少（还款）
    """
    if _is_asset_account(account_type):
        is_increase = direction == TransactionDirection.IN.value
        if reverse:
            is_increase = not is_increase
        update_account_balance(db, account_id, amount, is_increase=is_increase)
        return

    if _is_credit_account(account_type) or _is_loan_account(account_type):
        is_increase = direction == TransactionDirection.OUT.value
        if reverse:
            is_increase = not is_increase
        update_account_debt(db, account_id, amount, is_increase=is_increase)


def _load_transactions_for_response(db: Session, transaction_ids: List[str]) -> List[Transaction]:
    """Reload transactions with common relations populated for response serialization."""
    if not transaction_ids:
        return []

    items = db.query(Transaction).options(
        selectinload(Transaction.account),
        selectinload(Transaction.counterparty_account),
        selectinload(Transaction.category),
    ).filter(Transaction.id.in_(transaction_ids)).all()

    order = {transaction_id: index for index, transaction_id in enumerate(transaction_ids)}
    items.sort(key=lambda item: order.get(item.id, len(order)))
    return items


def _annotate_refund_status(
    db: Session,
    book_id: str,
    transactions: List[Transaction],
) -> List[Transaction]:
    """Attach refund summary metadata used by list and detail UIs."""
    if not transactions:
        return transactions

    original_ids = [
        txn.id
        for txn in transactions
        if txn.transaction_type == TransactionType.EXPENSE.value
    ]

    refund_rows = []
    if original_ids:
        refund_rows = db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.related_transaction_id.in_(original_ids),
            Transaction.transaction_type == TransactionType.REFUND.value,
            Transaction.status == TransactionStatus.CONFIRMED.value,
        ).order_by(
            Transaction.occurred_at.asc(),
            Transaction.created_at.asc(),
            Transaction.id.asc(),
        ).all()

    refunds_by_original: dict[str, List[Transaction]] = {}
    for refund_txn in refund_rows:
        refunds_by_original.setdefault(refund_txn.related_transaction_id, []).append(refund_txn)

    for txn in transactions:
        linked_refunds = refunds_by_original.get(txn.id, [])
        refunded_amount = sum((refund.amount for refund in linked_refunds), Decimal("0"))

        txn.has_refund = refunded_amount > 0
        txn.refunded_amount = refunded_amount
        txn.linked_refunds = [
            LinkedRefundTransaction(
                id=refund.id,
                occurred_at=refund.occurred_at,
                amount=refund.amount,
                currency=refund.currency,
                account_id=refund.account_id,
                note=refund.note,
                status=refund.status,
            )
            for refund in linked_refunds
        ]

        if txn.transaction_type == TransactionType.EXPENSE.value:
            txn.original_amount = txn.amount
            txn.remaining_refundable_amount = max(txn.amount - refunded_amount, Decimal("0"))
            txn.is_fully_refunded = refunded_amount >= txn.amount and refunded_amount > 0
            txn.is_partially_refunded = refunded_amount > 0 and refunded_amount < txn.amount
        else:
            txn.original_amount = None
            txn.remaining_refundable_amount = Decimal("0")
            txn.is_fully_refunded = False
            txn.is_partially_refunded = False

    return transactions


def _calculate_include_flags(transaction_type: TransactionType, account_type: str) -> Tuple[bool, bool, bool]:
    """Calculate include_in_expense, include_in_income, include_in_cashflow"""
    include_expense = True
    include_income = True
    include_cashflow = True

    tx_type = transaction_type.value if hasattr(transaction_type, 'value') else transaction_type

    # Transfer - no expense/income, no cashflow (internal)
    if tx_type == TransactionType.TRANSFER.value:
        include_expense = False
        include_income = False
        include_cashflow = False

    # Repayment types - no expense/income
    elif tx_type in [TransactionType.REPAYMENT_CREDIT_CARD.value, TransactionType.REPAYMENT_LOAN.value]:
        include_expense = False
        include_income = False
        include_cashflow = False

    # Refund - handled separately based on refund account
    elif tx_type == TransactionType.REFUND.value:
        include_expense = False
        include_income = False
        # cashflow determined by refund account

    # Debt types - no expense/income
    elif tx_type in [TransactionType.DEBT_BORROW.value, TransactionType.DEBT_LEND.value,
                     TransactionType.DEBT_RECEIVE_BACK.value, TransactionType.DEBT_PAY_BACK.value]:
        include_expense = False
        include_income = False

    # Income - not expense
    elif tx_type == TransactionType.INCOME.value:
        include_expense = False

    # Expense - not income
    elif tx_type == TransactionType.EXPENSE.value:
        include_income = False

    # fee - not income
    elif tx_type == TransactionType.FEE.value:
        include_income = False

    elif tx_type == TransactionType.INSTALLMENT_PURCHASE.value:
        # Installment purchase increases debt, but does not create cash movement.
        include_expense = True
        include_income = False
        include_cashflow = False

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
            update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
            frozen_release_amount = _get_installment_frozen_release_amount(txn)
            if frozen_release_amount > 0:
                update_account_frozen(db, txn.account_id, frozen_release_amount, is_increase=False)
            txn.include_in_cashflow = False
        elif _is_loan_account(account_type):
            # Loan account: not typical for expense
            pass

    # === INCOME ===
    elif tx_type == TransactionType.INCOME.value:
        if _is_asset_account(account_type):
            update_account_balance(db, txn.account_id, txn.amount, is_increase=True)
        elif _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, txn.amount, is_increase=False)

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
        elif _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, txn.amount, is_increase=True)

    # === TRANSFER ===
    elif tx_type == TransactionType.TRANSFER.value:
        is_split_transfer = bool(txn.related_transaction_id)

        if is_split_transfer:
            _apply_split_transfer_account_effect(
                db=db,
                account_id=txn.account_id,
                account_type=account_type,
                amount=txn.amount,
                direction=direction,
            )
        else:
            if _is_asset_account(account_type):
                update_account_balance(db, txn.account_id, txn.amount, is_increase=False)
            elif _is_credit_account(account_type):
                update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
            elif _is_loan_account(account_type):
                update_account_debt(db, txn.account_id, txn.amount, is_increase=True)
            if counterparty and _is_asset_account(counterparty.account_type):
                update_account_balance(db, txn.counterparty_account_id, txn.amount, is_increase=True)
            elif counterparty and _is_credit_account(counterparty.account_type):
                update_account_debt(db, txn.counterparty_account_id, txn.amount, is_increase=False)
            elif counterparty and _is_loan_account(counterparty.account_type):
                update_account_debt(db, txn.counterparty_account_id, txn.amount, is_increase=False)

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
    counterparty = None
    if data.counterparty_account_id:
        counterparty = get_account(db, data.counterparty_account_id, book_id)
        if not counterparty:
            raise NotFoundException("Counterparty account not found")

    if data.transaction_type == TransactionType.REPAYMENT_CREDIT_CARD:
        if not counterparty:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Counterparty account not found")
        if not _is_asset_account(account.account_type):
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Repayment source must be an asset account")
        if not _is_credit_account(counterparty.account_type):
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Repayment target must be a credit account")
        _validate_credit_repayment_amount(db, counterparty, data.amount)

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
    clear_overview_cache()  # 🛡️ L
    return txn



def _collect_transfer_related_transactions(db: Session, txn: Transaction, book_id: str) -> List[Transaction]:
    to_delete = {txn.id: txn}

    related_transactions = []
    if txn.related_transaction_id:
        related_transactions.extend(
            db.query(Transaction).filter(
                Transaction.book_id == book_id,
                Transaction.id == txn.related_transaction_id,
            ).all()
        )

    related_transactions.extend(
        db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.related_transaction_id == txn.id,
        ).all()
    )

    if txn.business_key:
        related_transactions.extend(
            db.query(Transaction).filter(
                Transaction.book_id == book_id,
                Transaction.transaction_type == TransactionType.TRANSFER.value,
                Transaction.business_key == txn.business_key,
            ).all()
        )

    for related_txn in related_transactions:
        to_delete[related_txn.id] = related_txn

    occurred_at_values = {item.occurred_at for item in to_delete.values()}
    fee_candidates = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.FEE.value,
        Transaction.occurred_at.in_(occurred_at_values),
    ).all()

    for fee_txn in fee_candidates:
        merchant = fee_txn.merchant or ""
        note = fee_txn.note or ""
        if "转账手续费" in merchant or "转账手续费" in note or "手续费" in note:
            to_delete[fee_txn.id] = fee_txn

    return list(to_delete.values())


def get_transfer_edit_context(db: Session, transaction_id: str, book_id: str) -> TransferEditResponse:
    txn = get_transaction(db, transaction_id, book_id)
    if not txn:
        raise NotFoundException("Transaction not found")
    if txn.transaction_type != TransactionType.TRANSFER.value:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Transaction is not a transfer")

    related = _collect_transfer_related_transactions(db, txn, book_id)
    transfer_rows = [item for item in related if item.transaction_type == TransactionType.TRANSFER.value]
    fee_row = next((item for item in related if item.transaction_type == TransactionType.FEE.value), None)
    primary_row = next(
        (item for item in transfer_rows if item.direction == TransactionDirection.OUT.value),
        transfer_rows[0] if transfer_rows else txn,
    )

    return TransferEditResponse(
        transaction_id=primary_row.id,
        occurred_at=primary_row.occurred_at,
        from_account_id=primary_row.account_id,
        to_account_id=primary_row.counterparty_account_id,
        amount=primary_row.amount,
        note=primary_row.note,
        tags=primary_row.tags,
        fee_amount=fee_row.amount if fee_row else Decimal("0"),
        fee_account_id=fee_row.account_id if fee_row else None,
    )


def create_transfer(db: Session, book_id: str, data: TransferCreate, commit: bool = True) -> List[Transaction]:
    """Create transfer transaction and optional fee transaction."""

    # Validate accounts
    from_account = get_account(db, data.from_account_id, book_id)
    to_account = get_account(db, data.to_account_id, book_id)

    if not from_account or not to_account:
        raise NotFoundException("Account not found")

    if data.from_account_id == data.to_account_id:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Cannot transfer to same account")

    if _is_credit_account(to_account.account_type):
        _validate_credit_repayment_amount(db, to_account, data.amount)

    occurred_at = data.occurred_at or datetime.now(timezone.utc)
    created_transaction_ids: List[str] = []

    fee_amount = data.fee_amount or Decimal("0")
    fee_account = None
    if fee_amount > 0:
        if not data.fee_account_id:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Fee account is required when fee amount is greater than 0")

        fee_account = get_account(db, data.fee_account_id, book_id)
        if not fee_account:
            raise NotFoundException("Fee account not found")
        if not _is_asset_account(fee_account.account_type):
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Fee account must be an asset account")

    transfer_merchant = _build_transfer_merchant(from_account, to_account)
    transfer_out_id = generate_uuid()
    transfer_in_id = generate_uuid()
    # 为 OUT 和 IN 分别生成唯一的 business_key（使用各自的 transaction_id 作为后缀）
    business_key_out = (
        f"transfer:{data.from_account_id}:{data.to_account_id}:{data.amount}:"
        f"{occurred_at.isoformat()}:{transfer_out_id}"
    )
    business_key_in = (
        f"transfer:{data.from_account_id}:{data.to_account_id}:{data.amount}:"
        f"{occurred_at.isoformat()}:{transfer_in_id}"
    )

    transfer_out_txn = Transaction(
        id=transfer_out_id,
        book_id=book_id,
        occurred_at=occurred_at,
        transaction_type=TransactionType.TRANSFER.value,
        direction=TransactionDirection.OUT.value,
        amount=data.amount,
        currency=data.currency,
        account_id=data.from_account_id,
        counterparty_account_id=data.to_account_id,
        related_transaction_id=transfer_in_id,
        merchant=transfer_merchant,
        note=data.note,
        tags=data.tags,
        source_type=SourceType.MANUAL.value,
        business_key=business_key_out,
        include_in_expense=False,
        include_in_income=False,
        include_in_cashflow=False,
        status=TransactionStatus.CONFIRMED.value,
    )

    transfer_in_txn = Transaction(
        id=transfer_in_id,
        book_id=book_id,
        occurred_at=occurred_at,
        transaction_type=TransactionType.TRANSFER.value,
        direction=TransactionDirection.IN.value,
        amount=data.amount,
        currency=data.currency,
        account_id=data.to_account_id,
        counterparty_account_id=data.from_account_id,
        related_transaction_id=transfer_out_id,
        merchant=transfer_merchant,
        note=data.note,
        tags=data.tags,
        source_type=SourceType.MANUAL.value,
        business_key=business_key_in,
        include_in_expense=False,
        include_in_income=False,
        include_in_cashflow=False,
        status=TransactionStatus.CONFIRMED.value,
    )

    # Apply updates to both accounts based on unified split-transfer polarity rules
    _apply_split_transfer_account_effect(
        db=db,
        account_id=data.from_account_id,
        account_type=from_account.account_type,
        amount=data.amount,
        direction=TransactionDirection.OUT.value,
    )
    _apply_split_transfer_account_effect(
        db=db,
        account_id=data.to_account_id,
        account_type=to_account.account_type,
        amount=data.amount,
        direction=TransactionDirection.IN.value,
    )

    db.add(transfer_out_txn)
    db.add(transfer_in_txn)
    created_transaction_ids.extend([transfer_out_txn.id, transfer_in_txn.id])

    if fee_amount > 0 and fee_account is not None:
        # 查找"手续费/利息"分类
        fee_category = db.query(Category).filter(
            Category.book_id == book_id,
            Category.name == "手续费/利息",
            Category.is_active == True
        ).first()

        fee_txn = Transaction(
            id=generate_uuid(),
            book_id=book_id,
            occurred_at=occurred_at,
            transaction_type=TransactionType.FEE.value,
            direction=TransactionDirection.OUT.value,
            amount=fee_amount,
            currency=data.currency,
            account_id=fee_account.id,
            category_id=fee_category.id if fee_category else None,
            merchant=f"{from_account.name}到{to_account.name}的转账手续费",
            note=fee_category.name if fee_category else "转账手续费",
            tags=data.tags,
            source_type=SourceType.MANUAL.value,
            include_in_expense=True,
            include_in_income=False,
            include_in_cashflow=True,
            status=TransactionStatus.CONFIRMED.value,
        )
        db.add(fee_txn)
        update_account_balance(db, fee_account.id, fee_amount, is_increase=False)
        created_transaction_ids.append(fee_txn.id)

    if commit:
        db.commit()
        clear_overview_cache()  # 🛡️ L: create_transfer
    else:
        db.flush()
    return _load_transactions_for_response(db, created_transaction_ids)


def update_transfer(db: Session, transaction_id: str, book_id: str, data: TransferCreate) -> List[Transaction]:
    txn = get_transaction(db, transaction_id, book_id)
    if not txn:
        raise NotFoundException("Transaction not found")
    if txn.transaction_type != TransactionType.TRANSFER.value:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="Transaction is not a transfer")

    related_transactions = _collect_transfer_related_transactions(db, txn, book_id)

    for item in related_transactions:
        _reverse_transaction_effects(db, item)

    for item in related_transactions:
        db.delete(item)

    db.flush()
    created = create_transfer(db, book_id, data, commit=False)
    db.commit()
    clear_overview_cache()
    return created


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

    _validate_credit_repayment_amount(db, credit_account, data.amount)

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
        merchant=_build_credit_repayment_merchant(from_account, credit_account),
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
    clear_overview_cache()
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

    if original.transaction_type != TransactionType.EXPENSE.value or original.direction != TransactionDirection.OUT.value:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Only expense transactions can be refunded",
        )

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
    remaining_refundable_amount = max(original.amount - refunded_sum, Decimal("0"))
    if data.amount > remaining_refundable_amount:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message=f"退款金额不能超过剩余可退款金额（剩余 ¥{remaining_refundable_amount}）"
        )

    # Determine cashflow based on refund account type
    if _is_asset_account(refund_account.account_type):
        include_cashflow = True
    else:
        include_cashflow = False

    refund_note = data.note if data.note is not None else data.reason

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
        note=refund_note if refund_note else None,
        related_transaction_id=data.original_transaction_id,
        business_key=f"refund:{data.original_transaction_id}:{datetime.now(timezone.utc).timestamp()}",
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
    clear_overview_cache()  # 🛡️ L
    return _annotate_refund_status(db, book_id, [refund_txn])[0]



def get_transactions(db: Session, book_id: str, filters: dict) -> Tuple[List[Transaction], int]:
    """Get transactions with filters - Optimized version"""
    query = _build_transactions_query(db, book_id, filters)
    visible_transaction_ids = _get_visible_transaction_ids(query)
    total = len(visible_transaction_ids)

    # Pagination
    page = filters.get("page", 1)
    page_size = filters.get("page_size", 50)
    start = (page - 1) * page_size
    end = start + page_size
    page_transaction_ids = visible_transaction_ids[start:end]

    transactions = _load_transactions_for_response(db, page_transaction_ids)
    return _annotate_refund_status(db, book_id, transactions), total


def get_transactions_for_export(db: Session, book_id: str, filters: dict) -> List[Transaction]:
    """Get the full visible transaction set for export without pagination."""
    query = _build_transactions_query(db, book_id, filters)
    transaction_ids = _get_visible_transaction_ids(query)
    transactions = _load_transactions_for_response(db, transaction_ids)
    return _annotate_refund_status(db, book_id, transactions)


def get_transaction(db: Session, transaction_id: str, book_id: str) -> Optional[Transaction]:
    """Get transaction by ID"""
    txn = db.query(Transaction).options(
        selectinload(Transaction.account),
        selectinload(Transaction.counterparty_account),
        selectinload(Transaction.category),
    ).filter(
        Transaction.id == transaction_id,
        Transaction.book_id == book_id
    ).first()
    if not txn:
        return None
    return _annotate_refund_status(db, book_id, [txn])[0]


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
            frozen_release_amount = _get_installment_frozen_release_amount(txn)
            if frozen_release_amount > 0:
                update_account_frozen(db, txn.account_id, frozen_release_amount, is_increase=True)

    elif tx_type == TransactionType.INCOME.value:
        if _is_asset_account(account_type):
            # Reverse: balance decrease
            update_account_balance(db, txn.account_id, amount, is_increase=False)
        elif _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=True)

    elif tx_type == TransactionType.FEE.value:
        if _is_asset_account(account_type):
            # Reverse: balance increase
            update_account_balance(db, txn.account_id, amount, is_increase=True)
        elif _is_credit_account(account_type):
            update_account_debt(db, txn.account_id, amount, is_increase=False)

    elif tx_type == TransactionType.TRANSFER.value:
        is_split_transfer = bool(txn.related_transaction_id)

        if is_split_transfer:
            _apply_split_transfer_account_effect(
                db=db,
                account_id=txn.account_id,
                account_type=account_type,
                amount=amount,
                direction=direction,
                reverse=True,
            )
        else:
            # Legacy single-entry transfer reversal: reverse both accounts
            if _is_asset_account(account_type):
                update_account_balance(db, txn.account_id, amount, is_increase=True)
            elif _is_credit_account(account_type):
                update_account_debt(db, txn.account_id, amount, is_increase=False)
            elif _is_loan_account(account_type):
                update_account_debt(db, txn.account_id, amount, is_increase=False)

            if txn.counterparty_account_id and counterparty:
                to_type = counterparty.account_type
                if _is_asset_account(to_type):
                    update_account_balance(db, txn.counterparty_account_id, amount, is_increase=False)
                elif _is_credit_account(to_type):
                    update_account_debt(db, txn.counterparty_account_id, amount, is_increase=True)
                elif _is_loan_account(to_type):
                    update_account_debt(db, txn.counterparty_account_id, amount, is_increase=True)

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
    clear_overview_cache()  # 🛡️ L
    return txn



def delete_transaction(
    db: Session,
    transaction_id: str,
    book_id: str,
    auto_commit: bool = True,
) -> None:
    """
    Delete a transaction permanently.

    转账删除需要级联回滚整个批次:
    - 删除目标交易
    - 删除转账另一侧
    - 删除关联手续费
    - 在一次提交中回滚所有账户影响

    When `auto_commit` is False, the caller owns the transaction boundary.
    """
    txn = get_transaction(db, transaction_id, book_id)
    if not txn:
        raise NotFoundException("Transaction not found")

    to_delete = {}
    to_delete[txn.id] = txn

    if txn.transaction_type == TransactionType.TRANSFER.value:
        related_transactions = []
        if txn.related_transaction_id:
            related_transactions.extend(
                db.query(Transaction).filter(
                    Transaction.book_id == book_id,
                    Transaction.id == txn.related_transaction_id,
                ).all()
            )

        related_transactions.extend(
            db.query(Transaction).filter(
                Transaction.book_id == book_id,
                Transaction.related_transaction_id == txn.id,
            ).all()
        )

        if txn.business_key:
            related_transactions.extend(
                db.query(Transaction).filter(
                    Transaction.book_id == book_id,
                    Transaction.transaction_type == TransactionType.TRANSFER.value,
                    Transaction.business_key == txn.business_key,
                ).all()
            )

        for related_txn in related_transactions:
            to_delete[related_txn.id] = related_txn

        occurred_at_values = {item.occurred_at for item in to_delete.values()}
        fee_candidates = db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.transaction_type == TransactionType.FEE.value,
            Transaction.occurred_at.in_(occurred_at_values),
        ).all()

        for fee_txn in fee_candidates:
            merchant = fee_txn.merchant or ""
            note = fee_txn.note or ""
            if "转账手续费" in merchant or "转账手续费" in note or "手续费" in note:
                to_delete[fee_txn.id] = fee_txn

    for item in list(to_delete.values()):
        _reverse_transaction_effects(db, item)

    for item in list(to_delete.values()):
        db.delete(item)

    if auto_commit:
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
        existing.updated_at = datetime.now(timezone.utc)
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
        occurred_at=datetime.now(timezone.utc),
        category_id=category_id,
        note=note,
        source_type=SourceType.SYSTEM,
        business_key=f"adjust:{account_id}:{datetime.now(timezone.utc).isoformat()}",
    )

    # 🛡️ L: 收支统计开关 — is_counted_in_reports=False 时强制关闭收入/支出标志
    # 用户没勾选"计入收支报表"时，这两个字段必须强制设为 False
    count_in_expense = is_counted_in_reports and transaction_type == TransactionType.EXPENSE
    count_in_income = is_counted_in_reports and transaction_type == TransactionType.INCOME
    count_in_cashflow = is_counted_in_reports

    txn = create_transaction(
        db, book_id, tx_data,
        include_expense_override=count_in_expense,
        include_income_override=count_in_income,
        include_cashflow_override=count_in_cashflow
    )

    # create_transaction already applies account effects; write the snapshot after that
    # so the stored balance/debt reflects the final post-adjustment value.
    refreshed_account = db.query(Account).filter(Account.id == account_id).first()
    if refreshed_account:
        _write_balance_snapshot(db, refreshed_account, adjust_mode, book_id=book_id)
        db.commit()

    return txn


# ─── Transaction Split ────────────────────────────────────────────────────────


def _is_split_parent(txn: Transaction) -> bool:
    """Check if transaction is a split group parent."""
    return txn.is_split_parent


def _is_split_child(txn: Transaction) -> bool:
    """Check if transaction is a split child."""
    return txn.is_split_child


def create_transaction_split(
    db: Session,
    book_id: str,
    parent_txn_id: str,
    splits: List[SplitItemCreate],
) -> TransactionSplitResponse:
    """Create a split group from a parent transaction.

    The parent becomes the group header (hidden from normal lists) and child
    split transactions are created, each with its own category and amount.

    The sum of split amounts must equal the parent's original amount (tolerance 0.01).

    Balance effect: parent is reversed (now hidden), children apply normally.
    Net balance change = 0 (same as original single transaction).
    """
    parent = get_transaction(db, parent_txn_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")

    # Guards
    if parent.status == TransactionStatus.VOID.value:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="Cannot split a voided transaction")
    if _is_split_child(parent):
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="Cannot split a transaction that is already a split child")
    if _is_split_parent(parent):
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="Transaction is already split")
    if parent.transaction_type == TransactionType.TRANSFER.value:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="Transfer transactions cannot be split")

    # SPLT-09: Block split if original has existing refunds
    if parent.transaction_type == TransactionType.EXPENSE.value:
        existing_refunds = db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.related_transaction_id == parent.id,
            Transaction.transaction_type == TransactionType.REFUND.value,
            Transaction.status == TransactionStatus.CONFIRMED.value,
        ).count()
        if existing_refunds > 0:
            raise AppException(
                status_code=400, code=ErrorCode.INVALID_PARAMS,
                message="Cannot split a transaction that already has refunds"
            )

    if len(splits) < 2:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="At least 2 split items are required")

    # Validate sum of split amounts
    total_split = sum(s.amount for s in splits)
    tolerance = Decimal("0.01")
    if abs(total_split - parent.amount) > tolerance:
        raise AppException(
            status_code=400, code=ErrorCode.INVALID_PARAMS,
            message=f"Split amounts must sum to {parent.amount}, got {total_split}"
        )

    # Save original include flags before mutating parent
    original_include_expense = parent.include_in_expense
    original_include_income = parent.include_in_income
    original_include_cashflow = parent.include_in_cashflow

    # Store original category_id in parent's extra field before clearing it
    original_category_id = parent.category_id
    extra_data = {
        "original_category_id": original_category_id,
        "original_include_expense": original_include_expense,
        "original_include_income": original_include_income,
        "original_include_cashflow": original_include_cashflow,
    }
    if parent.extra:
        try:
            existing_extra = json.loads(parent.extra)
            if isinstance(existing_extra, dict):
                existing_extra.update(extra_data)
                extra_data = existing_extra
        except (TypeError, json.JSONDecodeError):
            pass
    parent.extra = json.dumps(extra_data)

    # Reverse parent balance effect (parent is becoming hidden)
    _reverse_transaction_effects(db, parent)

    # Convert parent into group header
    parent.split_group_id = parent.id
    parent.is_split_parent = True
    parent.category_id = None
    parent.is_hidden = True
    parent.include_in_expense = False
    parent.include_in_income = False
    parent.include_in_cashflow = False

    # Create child split transactions
    child_txns: List[Transaction] = []
    for split_item in splits:
        child = Transaction(
            id=generate_uuid(),
            book_id=book_id,
            occurred_at=parent.occurred_at,
            posted_at=parent.posted_at,
            transaction_type=parent.transaction_type,
            direction=parent.direction,
            amount=split_item.amount,
            currency=parent.currency,
            account_id=parent.account_id,
            counterparty_account_id=None,  # splits don't support counterparty
            category_id=split_item.category_id,
            merchant=parent.merchant,
            note=split_item.note,
            source_type=SourceType.MANUAL,
            status=TransactionStatus.CONFIRMED.value,
            tags=parent.tags,
            split_group_id=parent.id,  # reference to parent
            is_split_child=True,
            split_parent_id=parent.id,
            # 🛡️ L: Children inherit original include flags (not parent's post-split False)
            include_in_expense=original_include_expense,
            include_in_income=original_include_income,
            include_in_cashflow=original_include_cashflow,
        )
        db.add(child)
        child_txns.append(child)

    db.commit()

    # Apply balance effects for each child split (same direction/type as parent)
    for child in child_txns:
        _apply_transaction_effects(db, child)

    db.commit()
    clear_overview_cache()

    # Reload parent with relations for response
    db.refresh(parent)
    parent_txn = get_transaction(db, parent.id, book_id)

    return TransactionSplitResponse(
        parent=_transaction_to_response(parent_txn),
        splits=[
            SplitItemResponse(
                id=c.id,
                occurred_at=c.occurred_at,
                amount=c.amount,
                currency=c.currency,
                category_id=c.category_id,
                category_name=c.category.name if c.category else None,
                merchant=c.merchant,
                note=c.note,
                status=c.status,
            )
            for c in child_txns
        ],
        original_category_id=original_category_id,
    )


def get_transaction_splits(
    db: Session,
    book_id: str,
    parent_txn_id: str,
) -> TransactionSplitResponse:
    """Get split group details: parent transaction and all child splits."""
    parent = get_transaction(db, parent_txn_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")

    # Load children
    children = db.query(Transaction).options(
        selectinload(Transaction.category),
    ).filter(
        Transaction.book_id == book_id,
        Transaction.split_group_id == parent.id,
        Transaction.id != parent.id,
    ).order_by(Transaction.created_at.asc()).all()

    # Extract original_category_id from parent's extra
    original_category_id = None
    if parent.extra:
        try:
            extra = json.loads(parent.extra)
            if isinstance(extra, dict):
                original_category_id = extra.get("original_category_id")
        except (TypeError, json.JSONDecodeError):
            pass

    return TransactionSplitResponse(
        parent=_transaction_to_response(parent),
        splits=[
            SplitItemResponse(
                id=c.id,
                occurred_at=c.occurred_at,
                amount=c.amount,
                currency=c.currency,
                category_id=c.category_id,
                category_name=c.category.name if c.category else None,
                merchant=c.merchant,
                note=c.note,
                status=c.status,
            )
            for c in children
        ],
        original_category_id=original_category_id,
    )


def replace_transaction_splits(
    db: Session,
    book_id: str,
    parent_txn_id: str,
    splits: List[SplitItemCreate],
) -> TransactionSplitResponse:
    """Replace all child splits of a split group.

    Balance effects of old children are reversed, then new children are created.
    """
    parent = get_transaction(db, parent_txn_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")
    if not _is_split_parent(parent):
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="Transaction is not a split group")

    if len(splits) < 2:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="At least 2 split items are required")

    # Validate sum
    total_split = sum(s.amount for s in splits)
    tolerance = Decimal("0.01")
    if abs(total_split - parent.amount) > tolerance:
        raise AppException(
            status_code=400, code=ErrorCode.INVALID_PARAMS,
            message=f"Split amounts must sum to {parent.amount}, got {total_split}"
        )

    # SPLT-06: Children inherit original report flags from extra metadata
    orig_expense = False
    orig_income = False
    orig_cashflow = False
    if parent.extra:
        try:
            extra = json.loads(parent.extra)
            if isinstance(extra, dict):
                orig_expense = extra.get("original_include_expense", False)
                orig_income = extra.get("original_include_income", False)
                orig_cashflow = extra.get("original_include_cashflow", False)
        except (TypeError, json.JSONDecodeError):
            pass

    # Load and delete old children (reverse balance effects first)
    old_children = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.split_group_id == parent.id,
        Transaction.id != parent.id,
    ).all()

    for old_child in old_children:
        _reverse_transaction_effects(db, old_child)
        db.delete(old_child)

    # Create new children
    new_children: List[Transaction] = []
    for split_item in splits:
        child = Transaction(
            id=generate_uuid(),
            book_id=book_id,
            occurred_at=parent.occurred_at,
            posted_at=parent.posted_at,
            transaction_type=parent.transaction_type,
            direction=parent.direction,
            amount=split_item.amount,
            currency=parent.currency,
            account_id=parent.account_id,
            counterparty_account_id=None,
            category_id=split_item.category_id,
            merchant=parent.merchant,
            note=split_item.note,
            source_type=SourceType.MANUAL,
            status=TransactionStatus.CONFIRMED.value,
            tags=parent.tags,
            split_group_id=parent.id,
            is_split_child=True,
            split_parent_id=parent.id,
            include_in_expense=orig_expense,
            include_in_income=orig_income,
            include_in_cashflow=orig_cashflow,
        )
        db.add(child)
        new_children.append(child)

    db.commit()

    # Apply new children balance effects
    for child in new_children:
        _apply_transaction_effects(db, child)

    db.commit()
    clear_overview_cache()

    # Reload parent
    db.refresh(parent)
    parent_txn = get_transaction(db, parent.id, book_id)

    # Restore original_category_id from parent's extra
    original_category_id = None
    if parent.extra:
        try:
            extra = json.loads(parent.extra)
            if isinstance(extra, dict):
                original_category_id = extra.get("original_category_id")
        except (TypeError, json.JSONDecodeError):
            pass

    return TransactionSplitResponse(
        parent=_transaction_to_response(parent_txn),
        splits=[
            SplitItemResponse(
                id=c.id,
                occurred_at=c.occurred_at,
                amount=c.amount,
                currency=c.currency,
                category_id=c.category_id,
                category_name=c.category.name if c.category else None,
                merchant=c.merchant,
                note=c.note,
                status=c.status,
            )
            for c in new_children
        ],
        original_category_id=original_category_id,
    )


def delete_transaction_splits(
    db: Session,
    book_id: str,
    parent_txn_id: str,
) -> Transaction:
    """Delete all splits and restore the parent to a normal visible transaction."""
    parent = get_transaction(db, parent_txn_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")
    if not _is_split_parent(parent):
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                           message="Transaction is not a split group")

    # Load and delete old children (reverse balance effects first)
    old_children = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.split_group_id == parent.id,
        Transaction.id != parent.id,
    ).all()

    for old_child in old_children:
        _reverse_transaction_effects(db, old_child)
        db.delete(old_child)

    # Restore original category from extra
    original_category_id = None
    if parent.extra:
        try:
            extra = json.loads(parent.extra)
            if isinstance(extra, dict):
                original_category_id = extra.get("original_category_id")
                # Clean up extra field (remove split metadata)
                cleaned_extra = {k: v for k, v in extra.items()
                                 if k not in ("original_category_id", "split_created_at")}
                parent.extra = json.dumps(cleaned_extra) if cleaned_extra else None
        except (TypeError, json.JSONDecodeError):
            pass

    # Restore parent to normal transaction
    parent.split_group_id = None
    parent.is_split_parent = False
    parent.is_split_child = False
    parent.split_parent_id = None
    parent.category_id = original_category_id
    parent.is_hidden = False
    # Recalculate include flags based on transaction type and account
    account = get_account_by_id(db, parent.account_id)
    if account:
        incl_exp, incl_inc, incl_cf = _calculate_include_flags(
            parent.transaction_type, account.account_type
        )
        parent.include_in_expense = incl_exp
        parent.include_in_income = incl_inc
        parent.include_in_cashflow = incl_cf

    # Re-apply parent balance effect (it was reversed when split was created)
    _apply_transaction_effects(db, parent)

    db.commit()
    clear_overview_cache()

    return get_transaction(db, parent.id, book_id)


def _transaction_to_response(txn: Transaction) -> TransactionResponse:
    """Convert a Transaction model to TransactionResponse.

    This is a lightweight serializer used by split endpoints.
    For full annotation (refund status, etc.), use get_transaction instead.
    """
    return TransactionResponse(
        id=txn.id,
        book_id=txn.book_id,
        occurred_at=txn.occurred_at,
        posted_at=txn.posted_at,
        transaction_type=txn.transaction_type,
        direction=txn.direction,
        amount=txn.amount,
        currency=txn.currency,
        account_id=txn.account_id,
        counterparty_account_id=txn.counterparty_account_id,
        category_id=txn.category_id,
        merchant=txn.merchant,
        note=txn.note,
        status=txn.status,
        tags=txn.tags,
        extra=txn.extra,
        related_transaction_id=txn.related_transaction_id,
        business_key=txn.business_key,
        include_in_expense=txn.include_in_expense,
        include_in_income=txn.include_in_income,
        include_in_cashflow=txn.include_in_cashflow,
        is_hidden=txn.is_hidden,
        created_at=txn.created_at,
        updated_at=txn.updated_at,
        split_group_id=txn.split_group_id,
        is_split_parent=txn.is_split_parent,
        is_split_child=txn.is_split_child,
        split_parent_id=txn.split_parent_id,
        split_children_count=0,  # Caller can override
    )


# ─── Phase 10: Transaction Split (Simplified Contract) ────────────────────────


def split_transaction(
    db: Session,
    book_id: str,
    transaction_id: str,
    splits: List[SplitItem],
) -> SplitDetailResponse:
    """Split an income/expense transaction into multiple category-allocation children.

    Phase 10 contract:
    - Validates type is income or expense (not transfer/refund/debt)
    - Validates no existing refunds on original
    - Validates sum of split amounts equals original amount exactly
    - Sets original: is_split_parent=True, is_hidden=True, exclude from reports
    - Creates children with: split_group_id=parent.id, is_split_child=True,
      split_parent_id=parent.id, each carrying their own amount+category
    - Children inherit original's include_expense/income/cashflow flags
    """
    parent = get_transaction(db, transaction_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")

    # ── Type guard: only income or expense ─────────────────────────────────
    if parent.transaction_type not in (
        TransactionType.INCOME.value,
        TransactionType.EXPENSE.value,
    ):
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Only income or expense transactions can be split",
        )

    # ── Already split guard ───────────────────────────────────────────────
    if parent.is_split_child:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Cannot split a transaction that is already a split child",
        )
    if parent.is_split_parent:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Transaction is already split",
        )

    # ── Refund guard: block if original has linked refunds ────────────────
    has_refunds = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.related_transaction_id == parent.id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status != TransactionStatus.VOID.value,
    ).count()
    if has_refunds > 0:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Cannot split a transaction that already has refunds",
        )

    # ── Minimum 2 splits ─────────────────────────────────────────────────
    if len(splits) < 2:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="At least 2 split items are required",
        )

    # ── Sum validation (exact, no tolerance) ─────────────────────────────
    total_split = sum(Decimal(str(s.amount)) for s in splits)
    original_amount = Decimal(str(parent.amount))
    if total_split != original_amount:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message=f"Split amounts must sum to {original_amount}, got {total_split}",
        )

    # ── Store original values in parent's extra for restore ──────────────
    original_category_id = parent.category_id
    extra_data = {"original_category_id": original_category_id}
    if parent.extra:
        try:
            existing_extra = json.loads(parent.extra)
            if isinstance(existing_extra, dict):
                existing_extra.update(extra_data)
                extra_data = existing_extra
        except (TypeError, json.JSONDecodeError):
            pass
    parent.extra = json.dumps(extra_data)

    # ── Capture original include flags before mutating parent ────────────
    original_include_expense = parent.include_in_expense
    original_include_income = parent.include_in_income
    original_include_cashflow = parent.include_in_cashflow

    # ── Reverse parent balance effect (parent becomes hidden) ─────────────
    _reverse_transaction_effects(db, parent)

    # ── Convert parent to split group header ─────────────────────────────
    parent.split_group_id = parent.id
    parent.is_split_parent = True
    parent.category_id = None
    parent.is_hidden = True
    parent.include_in_expense = False
    parent.include_in_income = False
    parent.include_in_cashflow = False

    # ── Create child transactions ─────────────────────────────────────────
    child_txns: List[Transaction] = []
    for split_item in splits:
        child = Transaction(
            id=generate_uuid(),
            book_id=book_id,
            occurred_at=parent.occurred_at,
            posted_at=parent.posted_at,
            transaction_type=parent.transaction_type,
            direction=parent.direction,
            amount=Decimal(str(split_item.amount)),
            currency=parent.currency,
            account_id=parent.account_id,
            counterparty_account_id=None,
            category_id=split_item.category_id,
            merchant=parent.merchant,
            note=split_item.note,
            source_type=SourceType.MANUAL,
            status=TransactionStatus.CONFIRMED.value,
            tags=parent.tags,
            split_group_id=parent.id,
            is_split_child=True,
            split_parent_id=parent.id,
            # Children inherit original include flags (not parent's False)
            include_in_expense=original_include_expense,
            include_in_income=original_include_income,
            include_in_cashflow=original_include_cashflow,
        )
        db.add(child)
        child_txns.append(child)

    db.commit()

    # ── Apply balance effects for each child ─────────────────────────────
    for child in child_txns:
        _apply_transaction_effects(db, child)

    db.commit()
    clear_overview_cache()

    # ── Reload parent and build response ─────────────────────────────────
    db.refresh(parent)
    parent_txn = get_transaction(db, parent.id, book_id)

    # Build full TransactionResponse for each child
    child_responses = []
    for c in child_txns:
        db.refresh(c)
        child_responses.append(
            TransactionResponse(
                id=c.id,
                book_id=c.book_id,
                occurred_at=c.occurred_at,
                posted_at=c.posted_at,
                transaction_type=c.transaction_type,
                direction=c.direction,
                amount=c.amount,
                currency=c.currency,
                account_id=c.account_id,
                counterparty_account_id=c.counterparty_account_id,
                category_id=c.category_id,
                merchant=c.merchant,
                note=c.note,
                status=c.status,
                tags=c.tags,
                extra=c.extra,
                related_transaction_id=c.related_transaction_id,
                business_key=c.business_key,
                include_in_expense=c.include_in_expense,
                include_in_income=c.include_in_income,
                include_in_cashflow=c.include_in_cashflow,
                is_hidden=c.is_hidden,
                created_at=c.created_at,
                updated_at=c.updated_at,
                split_group_id=c.split_group_id,
                is_split_parent=c.is_split_parent,
                is_split_child=c.is_split_child,
                split_parent_id=c.split_parent_id,
                split_children_count=0,
            )
        )

    return SplitDetailResponse(
        original_transaction=_transaction_to_response(parent_txn),
        children=child_responses,
    )


def get_split_detail(
    db: Session,
    book_id: str,
    transaction_id: str,
) -> SplitDetailResponse:
    """Get split group detail: original transaction and all children."""
    parent = get_transaction(db, transaction_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")
    if not parent.is_split_parent:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Transaction is not a split parent",
        )

    # Load children
    children = (
        db.query(Transaction)
        .options(selectinload(Transaction.category))
        .filter(
            Transaction.book_id == book_id,
            Transaction.split_group_id == parent.id,
            Transaction.id != parent.id,
        )
        .order_by(Transaction.created_at.asc())
        .all()
    )

    child_responses = []
    for c in children:
        child_responses.append(
            TransactionResponse(
                id=c.id,
                book_id=c.book_id,
                occurred_at=c.occurred_at,
                posted_at=c.posted_at,
                transaction_type=c.transaction_type,
                direction=c.direction,
                amount=c.amount,
                currency=c.currency,
                account_id=c.account_id,
                counterparty_account_id=c.counterparty_account_id,
                category_id=c.category_id,
                merchant=c.merchant,
                note=c.note,
                status=c.status,
                tags=c.tags,
                extra=c.extra,
                related_transaction_id=c.related_transaction_id,
                business_key=c.business_key,
                include_in_expense=c.include_in_expense,
                include_in_income=c.include_in_income,
                include_in_cashflow=c.include_in_cashflow,
                is_hidden=c.is_hidden,
                created_at=c.created_at,
                updated_at=c.updated_at,
                split_group_id=c.split_group_id,
                is_split_parent=c.is_split_parent,
                is_split_child=c.is_split_child,
                split_parent_id=c.split_parent_id,
                split_children_count=0,
            )
        )

    return SplitDetailResponse(
        original_transaction=_transaction_to_response(parent),
        children=child_responses,
    )


def delete_split(
    db: Session,
    book_id: str,
    transaction_id: str,
) -> Transaction:
    """Delete all split children and restore the parent to a normal transaction."""
    parent = get_transaction(db, transaction_id, book_id)
    if not parent:
        raise NotFoundException("Transaction not found")
    if not parent.is_split_parent:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Transaction is not a split parent",
        )

    # ── Load and delete children (reverse balance effects first) ─────────
    children = (
        db.query(Transaction)
        .filter(
            Transaction.book_id == book_id,
            Transaction.split_group_id == parent.id,
            Transaction.id != parent.id,
        )
        .all()
    )
    for child in children:
        _reverse_transaction_effects(db, child)
        db.delete(child)

    # ── Restore parent to normal transaction ─────────────────────────────
    original_category_id = None
    if parent.extra:
        try:
            extra = json.loads(parent.extra)
            if isinstance(extra, dict):
                original_category_id = extra.get("original_category_id")
                # Clean up split metadata from extra
                cleaned_extra = {
                    k: v
                    for k, v in extra.items()
                    if k not in ("original_category_id", "split_created_at")
                }
                parent.extra = json.dumps(cleaned_extra) if cleaned_extra else None
        except (TypeError, json.JSONDecodeError):
            pass

    parent.split_group_id = None
    parent.is_split_parent = False
    parent.is_split_child = False
    parent.split_parent_id = None
    parent.category_id = original_category_id
    parent.is_hidden = False

    # Recalculate include flags based on transaction type and account
    account = get_account_by_id(db, parent.account_id)
    if account:
        incl_exp, incl_inc, incl_cf = _calculate_include_flags(
            parent.transaction_type, account.account_type
        )
        parent.include_in_expense = incl_exp
        parent.include_in_income = incl_inc
        parent.include_in_cashflow = incl_cf

    # Re-apply parent balance effect (it was reversed when split was created)
    _apply_transaction_effects(db, parent)

    db.commit()
    clear_overview_cache()

    return get_transaction(db, parent.id, book_id)
