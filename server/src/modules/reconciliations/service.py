import json
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from src.common.enums import AccountType, SourceType, TransactionType
from src.core import AppException, ErrorCode, NotFoundException, ValidationException, generate_uuid
from src.modules.accounts.models import Account
from src.modules.accounts.service import calculate_credit_statement_info, get_account
from src.modules.bills.schemas import ParsedBillItem
from src.modules.bills.service import BillParseError, parse_bill_file
from src.modules.transactions.models import Transaction
from src.modules.transactions.service import adjust_account_balance

from .models import (
    ReconciliationMatchStatus,
    ReconciliationReviewState,
    ReconciliationSession,
    ReconciliationStatementRow,
    ReconciliationStatus,
)
from .schemas import (
    ReconciliationBucketSummary,
    ReconciliationComparisonResponse,
    ReconciliationDefaultsResponse,
    ReconciliationLedgerTransactionResponse,
    ReconciliationSessionCreate,
    ReconciliationSessionDetailResponse,
    ReconciliationSessionSummaryResponse,
    ReconciliationSessionUpdate,
    ReconciliationStatementRowResponse,
)


MATCH_DATE_WINDOW_DAYS = 3
ZERO_TOLERANCE = Decimal("0.005")


def _to_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _normalize_ref(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip().lower()
    return normalized or None


def _is_credit_account(account: Account) -> bool:
    return account.account_type in {AccountType.CREDIT_CARD.value, AccountType.CREDIT_LINE.value}


def _is_asset_account(account: Account) -> bool:
    return account.account_type in {
        AccountType.CASH.value,
        AccountType.DEBIT_CARD.value,
        AccountType.EWALLET.value,
        AccountType.VIRTUAL.value,
    }


def _resolve_credit_period(account: Account, anchor_date: Optional[date] = None) -> Tuple[date, date]:
    from src.modules.accounts.service import _get_adjacent_bill_dates, _safe_date

    if not account.billing_day:
        raise ValidationException("信用账户缺少账单日，无法推导默认对账周期")

    billing_day = int(account.billing_day)
    today = anchor_date or date.today()
    last_bill_date, _ = _get_adjacent_bill_dates(today, billing_day)
    if last_bill_date.month == 1:
        previous_bill_date = _safe_date(last_bill_date.year - 1, 12, billing_day)
    else:
        previous_bill_date = _safe_date(last_bill_date.year, last_bill_date.month - 1, billing_day)

    if (account.billing_day_rule or "current_cycle") == "next_cycle":
        period_start = previous_bill_date
        period_end = last_bill_date - timedelta(days=1)
    else:
        period_start = previous_bill_date
        period_end = last_bill_date

    return period_start, period_end


def _get_default_period(account: Account, statement_period_end: Optional[date] = None) -> Tuple[date, date]:
    if _is_credit_account(account):
        return _resolve_credit_period(account, statement_period_end)

    period_end = statement_period_end or date.today()
    period_start = period_end.replace(day=1)
    return period_start, period_end


def _account_position_now(account: Account) -> Decimal:
    if _is_credit_account(account):
        return _to_decimal(account.debt_amount)
    return _to_decimal(account.current_balance)


def _transaction_effect_for_account(account: Account, txn: Transaction) -> Decimal:
    amount = _to_decimal(txn.amount)
    if _is_credit_account(account):
        if txn.account_id == account.id:
            return amount if txn.direction == "out" else -amount
        if txn.counterparty_account_id == account.id and txn.transaction_type == TransactionType.REPAYMENT_CREDIT_CARD.value:
            return -amount
        return Decimal("0")

    if txn.account_id != account.id:
        return Decimal("0")
    return amount if txn.direction == "in" else -amount


def _load_relevant_transactions(
    db: Session,
    account: Account,
    period_start: date,
    period_end: Optional[date] = None,
    *,
    after_end: bool = False,
) -> List[Transaction]:
    start_dt = datetime.combine(period_start, time.min)
    end_dt = datetime.combine(period_end or period_start, time.max)

    query = db.query(Transaction).filter(
        Transaction.book_id == account.book_id,
        Transaction.status == "confirmed",
        Transaction.is_hidden == False,
    )
    if _is_credit_account(account):
        query = query.filter(
            (Transaction.account_id == account.id)
            | (Transaction.counterparty_account_id == account.id)
        )
    else:
        query = query.filter(Transaction.account_id == account.id)

    if after_end:
        query = query.filter(Transaction.occurred_at > end_dt)
    else:
        query = query.filter(Transaction.occurred_at >= start_dt, Transaction.occurred_at <= end_dt)

    return query.order_by(Transaction.occurred_at.asc(), Transaction.created_at.asc(), Transaction.id.asc()).all()


def _calculate_ledger_closing_balance(
    db: Session,
    account: Account,
    period_end: date,
) -> Decimal:
    current_position = _account_position_now(account)
    trailing_transactions = _load_relevant_transactions(db, account, period_end, after_end=True)
    for txn in trailing_transactions:
        current_position -= _transaction_effect_for_account(account, txn)
    return current_position.quantize(Decimal("0.01"))


def _sum_period_activity(account: Account, transactions: Sequence[Transaction]) -> Decimal:
    total = Decimal("0")
    for txn in transactions:
        total += _transaction_effect_for_account(account, txn)
    return total.quantize(Decimal("0.01"))


def get_reconciliation_defaults(
    db: Session,
    *,
    book_id: str,
    account_id: str,
    statement_period_end: Optional[date] = None,
) -> ReconciliationDefaultsResponse:
    account = get_account(db, account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    period_start, period_end = _get_default_period(account, statement_period_end)
    ledger_closing_balance = _calculate_ledger_closing_balance(db, account, period_end)
    if _is_credit_account(account):
        statement_balance = _to_decimal(calculate_credit_statement_info(db, account)["current_statement_balance"])
    else:
        statement_balance = ledger_closing_balance

    return ReconciliationDefaultsResponse(
        account_id=account.id,
        statement_period_start=period_start,
        statement_period_end=period_end,
        statement_opening_balance=None,
        suggested_statement_closing_balance=statement_balance,
        ledger_closing_balance=ledger_closing_balance,
        difference_amount=(statement_balance - ledger_closing_balance).quantize(Decimal("0.01")),
        is_credit_account=_is_credit_account(account),
    )


def _get_session(db: Session, session_id: str, book_id: str) -> ReconciliationSession:
    session = (
        db.query(ReconciliationSession)
        .filter(ReconciliationSession.id == session_id, ReconciliationSession.book_id == book_id)
        .first()
    )
    if not session:
        raise NotFoundException("Reconciliation session not found")
    return session


def _statement_row_to_response(row: ReconciliationStatementRow) -> ReconciliationStatementRowResponse:
    return ReconciliationStatementRowResponse(
        id=row.id,
        row_no=row.row_no,
        occurred_at=row.occurred_at,
        direction=row.direction,
        amount=_to_decimal(row.amount),
        currency=row.currency or "CNY",
        raw_account_name=row.raw_account_name,
        counterparty=row.counterparty,
        description=row.description,
        order_no=row.order_no,
        merchant_order_no=row.merchant_order_no,
        external_ref=row.external_ref,
        match_status=row.match_status,
        match_reason=row.match_reason,
        matched_transaction_id=row.matched_transaction_id,
        candidate_transaction_ids=json.loads(row.candidate_transaction_ids or "[]"),
        review_status=row.review_status or "pending",
        review_note=row.review_note,
    )


def _ledger_txn_to_response(txn: Transaction, *, match_reason: Optional[str] = None) -> ReconciliationLedgerTransactionResponse:
    return ReconciliationLedgerTransactionResponse(
        id=txn.id,
        occurred_at=txn.occurred_at,
        direction=txn.direction,
        amount=_to_decimal(txn.amount),
        merchant=txn.merchant,
        note=txn.note,
        external_ref=txn.external_ref,
        transaction_type=txn.transaction_type,
        match_reason=match_reason,
    )


def _find_transaction_by_id(transactions: Iterable[Transaction], txn_id: str) -> Optional[Transaction]:
    for txn in transactions:
        if txn.id == txn_id:
            return txn
    return None


def _apply_row_match(row: ReconciliationStatementRow, status: str, reason: str, txn: Optional[Transaction], candidate_ids: Optional[List[str]] = None) -> None:
    row.match_status = status
    row.match_reason = reason
    row.matched_transaction_id = txn.id if txn else None
    row.candidate_transaction_ids = json.dumps(candidate_ids or [], ensure_ascii=False)


def _get_row_candidate_ids(row: ReconciliationStatementRow) -> List[str]:
    try:
        return json.loads(row.candidate_transaction_ids or "[]")
    except json.JSONDecodeError:
        return []


def _build_ref_candidates(row: ReconciliationStatementRow) -> List[str]:
    refs = [
        _normalize_ref(row.external_ref),
        _normalize_ref(row.order_no),
        _normalize_ref(row.merchant_order_no),
    ]
    return [ref for ref in refs if ref]


def _ref_matches(row: ReconciliationStatementRow, txn: Transaction) -> bool:
    row_refs = _build_ref_candidates(row)
    if not row_refs:
        return False
    txn_refs = {
        _normalize_ref(txn.external_ref),
        _normalize_ref(txn.business_key),
        _normalize_ref(txn.note),
    }
    return any(ref and ref in txn_refs for ref in row_refs)


def _recompute_session(db: Session, session: ReconciliationSession) -> None:
    account = get_account(db, session.account_id, session.book_id)
    if not account:
        raise NotFoundException("Account not found")

    period_transactions = _load_relevant_transactions(
        db,
        account,
        session.statement_period_start,
        session.statement_period_end,
    )
    unmatched_transactions = {txn.id: txn for txn in period_transactions}

    for row in session.statement_rows:
        if row.matched_transaction_id and row.match_status == ReconciliationMatchStatus.MATCHED.value:
            matched = _find_transaction_by_id(period_transactions, row.matched_transaction_id)
            if matched:
                unmatched_transactions.pop(matched.id, None)
                _apply_row_match(row, ReconciliationMatchStatus.MATCHED.value, row.match_reason or "manual_match", matched, [matched.id])
                continue

        amount_matches = [
            txn for txn in period_transactions
            if _to_decimal(txn.amount) == _to_decimal(row.amount)
        ]
        exact_ref_matches = [txn for txn in amount_matches if txn.id in unmatched_transactions and _ref_matches(row, txn)]
        same_day_matches = [
            txn for txn in amount_matches
            if txn.id in unmatched_transactions and txn.occurred_at.date() == row.occurred_at.date()
        ]
        window_matches = [
            txn for txn in amount_matches
            if txn.id in unmatched_transactions
            and abs((txn.occurred_at.date() - row.occurred_at.date()).days) <= MATCH_DATE_WINDOW_DAYS
        ]

        if len(exact_ref_matches) == 1:
            matched = exact_ref_matches[0]
            unmatched_transactions.pop(matched.id, None)
            _apply_row_match(row, ReconciliationMatchStatus.MATCHED.value, "exact_external_ref", matched, [matched.id])
        elif len(exact_ref_matches) > 1:
            _apply_row_match(
                row,
                ReconciliationMatchStatus.DUPLICATE.value,
                "duplicate_external_ref_matches",
                None,
                [txn.id for txn in exact_ref_matches],
            )
        elif len(same_day_matches) == 1:
            matched = same_day_matches[0]
            unmatched_transactions.pop(matched.id, None)
            _apply_row_match(row, ReconciliationMatchStatus.MATCHED.value, "exact_amount_same_day", matched, [matched.id])
        elif len(same_day_matches) > 1:
            _apply_row_match(
                row,
                ReconciliationMatchStatus.DUPLICATE.value,
                "duplicate_same_day_amount_matches",
                None,
                [txn.id for txn in same_day_matches],
            )
        elif window_matches:
            _apply_row_match(
                row,
                ReconciliationMatchStatus.UNRESOLVED.value,
                "amount_within_date_window_review",
                None,
                [txn.id for txn in window_matches],
            )
        else:
            _apply_row_match(row, ReconciliationMatchStatus.MISSING.value, "no_ledger_candidate", None, [])

    statement_total_amount = sum((_to_decimal(row.amount) for row in session.statement_rows), Decimal("0"))
    ledger_total_amount = _sum_period_activity(account, period_transactions)
    ledger_closing_balance = _calculate_ledger_closing_balance(db, account, session.statement_period_end)
    difference_amount = (_to_decimal(session.statement_closing_balance) - ledger_closing_balance).quantize(Decimal("0.01"))

    referenced_transaction_ids = set()
    for row in session.statement_rows:
        if row.matched_transaction_id:
            referenced_transaction_ids.add(row.matched_transaction_id)
        referenced_transaction_ids.update(_get_row_candidate_ids(row))

    buckets = {
        "matched": 0,
        "missing": 0,
        "duplicate": 0,
        "unresolved": 0,
        "extra": len([txn_id for txn_id in unmatched_transactions if txn_id not in referenced_transaction_ids]),
    }
    for row in session.statement_rows:
        if row.match_status == ReconciliationMatchStatus.MATCHED.value:
            buckets["matched"] += 1
        elif row.match_status == ReconciliationMatchStatus.MISSING.value:
            buckets["missing"] += 1
        elif row.match_status == ReconciliationMatchStatus.DUPLICATE.value:
            buckets["duplicate"] += 1
        else:
            buckets["unresolved"] += 1

    session.statement_total_amount = statement_total_amount.quantize(Decimal("0.01"))
    session.ledger_total_amount = ledger_total_amount
    session.ledger_closing_balance = ledger_closing_balance
    session.difference_amount = difference_amount
    session.evidence_row_count = len(session.statement_rows)
    session.matching_summary = json.dumps(buckets, ensure_ascii=False)


def create_reconciliation_session(
    db: Session,
    *,
    book_id: str,
    data: ReconciliationSessionCreate,
) -> ReconciliationSessionDetailResponse:
    account = get_account(db, data.account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")

    if data.statement_period_start and data.statement_period_end and data.statement_period_start > data.statement_period_end:
        raise ValidationException("statement_period_start cannot be after statement_period_end")

    if data.statement_period_start and not data.statement_period_end:
        statement_period_start = data.statement_period_start
        statement_period_end = data.statement_period_start
    elif data.statement_period_end and not data.statement_period_start:
        statement_period_start, statement_period_end = _get_default_period(account, data.statement_period_end)
    elif data.statement_period_start and data.statement_period_end:
        statement_period_start = data.statement_period_start
        statement_period_end = data.statement_period_end
    else:
        statement_period_start, statement_period_end = _get_default_period(account, None)

    session = ReconciliationSession(
        id=generate_uuid(),
        book_id=book_id,
        account_id=account.id,
        statement_period_start=statement_period_start,
        statement_period_end=statement_period_end,
        statement_opening_balance=data.statement_opening_balance,
        statement_closing_balance=data.statement_closing_balance,
        status=ReconciliationStatus.IN_PROGRESS.value,
        review_state=ReconciliationReviewState.PENDING.value,
        notes=data.notes,
    )
    db.add(session)
    db.flush()
    _recompute_session(db, session)
    db.commit()
    db.refresh(session)
    return get_reconciliation_session_detail(db, book_id=book_id, session_id=session.id)


def ingest_statement_evidence(
    db: Session,
    *,
    book_id: str,
    user_id: str,
    session_id: str,
    bill_type: str,
    filename: str,
    content: bytes,
) -> ReconciliationSessionDetailResponse:
    session = _get_session(db, session_id, book_id)
    parse_result = parse_bill_file(
        db=db,
        user_id=user_id,
        bill_type=bill_type,
        filename=filename,
        content=content,
    )

    session.statement_rows.clear()
    for index, item in enumerate(parse_result.items, start=1):
        parsed_item = item if isinstance(item, ParsedBillItem) else ParsedBillItem(**item)
        session.statement_rows.append(
            ReconciliationStatementRow(
                id=generate_uuid(),
                row_no=index,
                occurred_at=parsed_item.billDate,
                direction=parsed_item.direction,
                amount=parsed_item.amount,
                currency="CNY",
                raw_account_name=parsed_item.rawAccountName,
                counterparty=parsed_item.counterparty,
                description=parsed_item.itemDesc,
                order_no=parsed_item.orderNo,
                merchant_order_no=parsed_item.merchantOrderNo,
                external_ref=parsed_item.merchantOrderNo or parsed_item.orderNo,
                raw_data=json.dumps(parsed_item.model_dump(mode="json"), ensure_ascii=False),
                normalized_data=json.dumps(parsed_item.model_dump(mode="json"), ensure_ascii=False),
            )
        )

    session.evidence_source_type = bill_type
    session.evidence_filename = filename
    session.evidence_import_batch_id = parse_result.parseId
    db.flush()
    _recompute_session(db, session)
    db.commit()
    db.refresh(session)
    return get_reconciliation_session_detail(db, book_id=book_id, session_id=session.id)


def list_account_reconciliation_sessions(
    db: Session,
    *,
    book_id: str,
    account_id: str,
) -> List[ReconciliationSessionSummaryResponse]:
    sessions = (
        db.query(ReconciliationSession)
        .filter(
            ReconciliationSession.book_id == book_id,
            ReconciliationSession.account_id == account_id,
        )
        .order_by(ReconciliationSession.statement_period_end.desc(), ReconciliationSession.created_at.desc())
        .all()
    )
    return [ReconciliationSessionSummaryResponse.model_validate(session) for session in sessions]


def _build_comparison(db: Session, session: ReconciliationSession) -> ReconciliationComparisonResponse:
    account = get_account(db, session.account_id, session.book_id)
    if not account:
        raise NotFoundException("Account not found")
    period_transactions = _load_relevant_transactions(
        db,
        account,
        session.statement_period_start,
        session.statement_period_end,
    )
    referenced_ids = set()
    for row in session.statement_rows:
        if row.matched_transaction_id:
            referenced_ids.add(row.matched_transaction_id)
        referenced_ids.update(_get_row_candidate_ids(row))
    extra_transactions = [txn for txn in period_transactions if txn.id not in referenced_ids]
    rows_by_status = {
        ReconciliationMatchStatus.MATCHED.value: [],
        ReconciliationMatchStatus.MISSING.value: [],
        ReconciliationMatchStatus.DUPLICATE.value: [],
        ReconciliationMatchStatus.UNRESOLVED.value: [],
    }
    for row in session.statement_rows:
        rows_by_status.setdefault(row.match_status, []).append(_statement_row_to_response(row))

    raw_buckets = json.loads(session.matching_summary or "{}")
    buckets = ReconciliationBucketSummary(
        matched=int(raw_buckets.get("matched", len(rows_by_status[ReconciliationMatchStatus.MATCHED.value]))),
        missing=int(raw_buckets.get("missing", len(rows_by_status[ReconciliationMatchStatus.MISSING.value]))),
        duplicate=int(raw_buckets.get("duplicate", len(rows_by_status[ReconciliationMatchStatus.DUPLICATE.value]))),
        unresolved=int(raw_buckets.get("unresolved", len(rows_by_status[ReconciliationMatchStatus.UNRESOLVED.value]))),
        extra=int(raw_buckets.get("extra", len(extra_transactions))),
    )
    return ReconciliationComparisonResponse(
        statement_total_amount=_to_decimal(session.statement_total_amount),
        ledger_total_amount=_to_decimal(session.ledger_total_amount),
        statement_closing_balance=_to_decimal(session.statement_closing_balance),
        ledger_closing_balance=_to_decimal(session.ledger_closing_balance),
        difference_amount=_to_decimal(session.difference_amount),
        buckets=buckets,
        matched_rows=rows_by_status[ReconciliationMatchStatus.MATCHED.value],
        missing_rows=rows_by_status[ReconciliationMatchStatus.MISSING.value],
        duplicate_rows=rows_by_status[ReconciliationMatchStatus.DUPLICATE.value],
        unresolved_rows=rows_by_status[ReconciliationMatchStatus.UNRESOLVED.value],
        extra_transactions=[_ledger_txn_to_response(txn, match_reason="ledger_only") for txn in extra_transactions],
    )


def get_reconciliation_session_detail(
    db: Session,
    *,
    book_id: str,
    session_id: str,
) -> ReconciliationSessionDetailResponse:
    session = _get_session(db, session_id, book_id)
    _recompute_session(db, session)
    db.flush()
    return ReconciliationSessionDetailResponse(
        id=session.id,
        account_id=session.account_id,
        statement_period_start=session.statement_period_start,
        statement_period_end=session.statement_period_end,
        statement_opening_balance=session.statement_opening_balance,
        statement_closing_balance=_to_decimal(session.statement_closing_balance),
        statement_total_amount=_to_decimal(session.statement_total_amount),
        ledger_total_amount=_to_decimal(session.ledger_total_amount),
        ledger_closing_balance=_to_decimal(session.ledger_closing_balance),
        difference_amount=_to_decimal(session.difference_amount),
        status=session.status,
        review_state=session.review_state,
        evidence_source_type=session.evidence_source_type,
        evidence_filename=session.evidence_filename,
        evidence_import_batch_id=session.evidence_import_batch_id,
        evidence_row_count=session.evidence_row_count or 0,
        notes=session.notes,
        close_note=session.close_note,
        close_transaction_id=session.close_transaction_id,
        closed_at=session.closed_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
        comparison=_build_comparison(db, session),
    )


def update_reconciliation_session(
    db: Session,
    *,
    book_id: str,
    session_id: str,
    data: ReconciliationSessionUpdate,
) -> ReconciliationSessionDetailResponse:
    session = _get_session(db, session_id, book_id)
    if data.review_state:
        session.review_state = data.review_state
    if data.notes is not None:
        session.notes = data.notes

    account = get_account(db, session.account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")
    period_transactions = _load_relevant_transactions(
        db,
        account,
        session.statement_period_start,
        session.statement_period_end,
    )
    row_map = {row.id: row for row in session.statement_rows}
    for row_update in data.rows:
        row = row_map.get(row_update.row_id)
        if not row:
            raise NotFoundException("Reconciliation row not found")
        if row_update.review_status is not None:
            row.review_status = row_update.review_status
        if row_update.review_note is not None:
            row.review_note = row_update.review_note
        if row_update.matched_transaction_id:
            matched = _find_transaction_by_id(period_transactions, row_update.matched_transaction_id)
            if not matched:
                raise ValidationException("matched_transaction_id is not in the session period")
            _apply_row_match(row, ReconciliationMatchStatus.MATCHED.value, "manual_match", matched, [matched.id])

    _recompute_session(db, session)
    db.commit()
    db.refresh(session)
    return get_reconciliation_session_detail(db, book_id=book_id, session_id=session.id)


def close_reconciliation_session(
    db: Session,
    *,
    book_id: str,
    session_id: str,
    action: str,
    note: Optional[str],
    is_counted_in_reports: bool,
) -> ReconciliationSessionDetailResponse:
    session = _get_session(db, session_id, book_id)
    account = get_account(db, session.account_id, book_id)
    if not account:
        raise NotFoundException("Account not found")
    _recompute_session(db, session)
    difference = _to_decimal(session.difference_amount)

    normalized_action = (action or "").strip().lower()
    if normalized_action == ReconciliationStatus.BALANCED.value:
        if abs(difference) > ZERO_TOLERANCE:
            raise ValidationException("Difference must be zero before closing as balanced")
        session.status = ReconciliationStatus.BALANCED.value
    elif normalized_action == ReconciliationStatus.DISCREPANT.value:
        session.status = ReconciliationStatus.DISCREPANT.value
    elif normalized_action == ReconciliationStatus.ADJUSTED.value:
        if abs(difference) <= ZERO_TOLERANCE:
            raise ValidationException("Difference is already zero; use balanced close instead")
        if _is_credit_account(account):
            current_available = (
                _to_decimal(account.credit_limit)
                - _to_decimal(account.debt_amount)
                - _to_decimal(account.frozen_amount)
            )
            target_available = (current_available - difference).quantize(Decimal("0.01"))
            adjustment_txn = adjust_account_balance(
                db=db,
                book_id=book_id,
                account_id=account.id,
                target_value=target_available,
                adjust_mode="available_credit",
                note=(note or "").strip() or f"reconciliation:{session.id}",
                is_counted_in_reports=is_counted_in_reports,
            )
        else:
            target_balance = (_to_decimal(account.current_balance) + difference).quantize(Decimal("0.01"))
            adjustment_txn = adjust_account_balance(
                db=db,
                book_id=book_id,
                account_id=account.id,
                target_value=target_balance,
                adjust_mode="balance",
                note=(note or "").strip() or f"reconciliation:{session.id}",
                is_counted_in_reports=is_counted_in_reports,
            )
        db.refresh(account)
        session.close_transaction_id = adjustment_txn.id
        session.status = ReconciliationStatus.ADJUSTED.value
        _recompute_session(db, session)
    else:
        raise ValidationException("action must be balanced, adjusted, or discrepant")

    session.review_state = ReconciliationReviewState.REVIEWED.value
    session.close_note = note
    session.closed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(session)
    return get_reconciliation_session_detail(db, book_id=book_id, session_id=session.id)
