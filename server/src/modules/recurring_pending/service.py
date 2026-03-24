import json
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from src.common.enums import SourceType, TransactionDirection, TransactionType
from src.core import NotFoundException, generate_uuid
from src.modules.transactions.schemas import TransactionCreate
from src.modules.transactions.service import create_transaction

from src.modules.recurring_rules.models import RecurringRule
from src.modules.recurring_rules.service import calculate_next_occurs_on

from .models import PendingItem
from .schemas import PendingConfirmRequest


def _build_payload(rule: RecurringRule, expected_date: date) -> dict:
    return {
        "occurred_at": datetime.combine(expected_date, datetime.min.time()).isoformat(),
        "transaction_type": rule.transaction_type,
        "direction": rule.direction,
        "amount": str(rule.amount),
        "currency": rule.currency,
        "account_id": rule.account_id,
        "counterparty_account_id": rule.counterparty_account_id,
        "category_id": rule.category_id,
        "merchant": rule.merchant,
        "note": rule.note,
        "tags": rule.tags,
        "extra": rule.extra,
        "source_type": SourceType.SYSTEM.value,
        "business_key": f"recurring:{rule.id}:{expected_date.isoformat()}",
    }


def sync_pending_items(db: Session, book_id: str, until_date: Optional[date] = None) -> List[PendingItem]:
    cutoff = until_date or date.today()
    rules = db.query(RecurringRule).filter(
        RecurringRule.book_id == book_id,
        RecurringRule.is_active == True,
        RecurringRule.next_occurs_on <= cutoff,
    ).all()

    created_items: List[PendingItem] = []
    for rule in rules:
        if rule.end_date and rule.next_occurs_on > rule.end_date:
            rule.is_active = False
            continue

        expected_date = rule.next_occurs_on
        existing = db.query(PendingItem).filter(
            PendingItem.recurring_rule_id == rule.id,
            PendingItem.expected_date == expected_date,
        ).first()
        if not existing:
            pending = PendingItem(
                id=generate_uuid(),
                recurring_rule_id=rule.id,
                book_id=book_id,
                expected_date=expected_date,
                status="pending",
                transaction_payload=json.dumps(_build_payload(rule, expected_date), ensure_ascii=False),
            )
            db.add(pending)
            created_items.append(pending)
            existing = pending

        rule.last_generated_on = expected_date
        next_occurs_on = calculate_next_occurs_on(
            start_date=rule.start_date,
            schedule_type=rule.schedule_type,
            interval_value=rule.interval_value,
            day_of_month=rule.day_of_month,
            weekday=rule.weekday,
            after_date=expected_date,
        )
        if next_occurs_on == expected_date:
            next_occurs_on = calculate_next_occurs_on(
                start_date=rule.start_date,
                schedule_type=rule.schedule_type,
                interval_value=rule.interval_value,
                day_of_month=rule.day_of_month,
                weekday=rule.weekday,
                after_date=expected_date.fromordinal(expected_date.toordinal() + 1),
            )
        rule.next_occurs_on = next_occurs_on
        if rule.end_date and rule.next_occurs_on > rule.end_date:
            rule.is_active = False

        if rule.auto_confirm and existing.status == "pending":
            confirm_pending_item(db, existing.id, book_id, PendingConfirmRequest())

    db.commit()
    for item in created_items:
        db.refresh(item)
    return created_items


def get_pending_items(db: Session, book_id: str, status: str = None) -> List[PendingItem]:
    query = db.query(PendingItem).filter(PendingItem.book_id == book_id)
    if status:
        query = query.filter(PendingItem.status == status)
    return query.order_by(PendingItem.expected_date.desc(), PendingItem.created_at.desc()).all()


def get_pending_item(db: Session, pending_id: str, book_id: str) -> Optional[PendingItem]:
    return db.query(PendingItem).filter(
        PendingItem.id == pending_id,
        PendingItem.book_id == book_id,
    ).first()


def confirm_pending_item(
    db: Session, pending_id: str, book_id: str, data: PendingConfirmRequest
) -> PendingItem:
    pending = get_pending_item(db, pending_id, book_id)
    if not pending:
        raise NotFoundException("Pending item not found")
    if pending.status == "confirmed":
        return pending

    payload = json.loads(pending.transaction_payload)
    if data.account_id:
        payload["account_id"] = data.account_id
    if data.occurred_at:
        payload["occurred_at"] = data.occurred_at.isoformat()

    transaction = create_transaction(
        db,
        book_id,
        TransactionCreate(
            occurred_at=datetime.fromisoformat(payload["occurred_at"]),
            transaction_type=TransactionType(payload["transaction_type"]),
            direction=TransactionDirection(payload["direction"]),
            amount=payload["amount"],
            currency=payload.get("currency") or "CNY",
            account_id=payload["account_id"],
            counterparty_account_id=payload.get("counterparty_account_id"),
            category_id=payload.get("category_id"),
            merchant=payload.get("merchant"),
            note=payload.get("note"),
            tags=payload.get("tags"),
            extra=payload.get("extra"),
            source_type=SourceType.SYSTEM,
            business_key=payload.get("business_key"),
        ),
    )

    pending.transaction_id = transaction.id
    pending.status = "confirmed"
    pending.transaction_payload = json.dumps(payload, ensure_ascii=False)
    db.commit()
    db.refresh(pending)
    return pending


def skip_pending_item(db: Session, pending_id: str, book_id: str, reason: Optional[str] = None) -> PendingItem:
    pending = get_pending_item(db, pending_id, book_id)
    if not pending:
        raise NotFoundException("Pending item not found")

    payload = json.loads(pending.transaction_payload)
    if reason:
        payload["skip_reason"] = reason
    pending.transaction_payload = json.dumps(payload, ensure_ascii=False)
    pending.status = "skipped"
    db.commit()
    db.refresh(pending)
    return pending
