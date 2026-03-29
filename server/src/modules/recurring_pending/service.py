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


def _validate_account_for_transaction(db: Session, account_id: str, transaction_type: str) -> dict:
    """
    验证账户可用于交易，返回账户类型信息
    抛出异常如果账户不存在或类型不匹配
    """
    from src.modules.accounts.models import Account
    
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise ValueError(f"账户不存在: {account_id}")
    if not account.is_active:
        raise ValueError(f"账户已禁用: {account.name}")
    
    # 检查信用账户边界
    is_credit = account.account_type in ["credit_card", "credit_line"]
    is_loan = account.account_type == "loan"
    
    return {
        "account_type": account.account_type,
        "is_credit": is_credit,
        "is_loan": is_loan,
        "name": account.name,
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
        # 🛡️ 审计：生成待处理项前验证账户类型
        try:
            account_info = _validate_account_for_transaction(db, rule.account_id, rule.transaction_type)
        except ValueError as e:
            # 账户无效，跳过该规则并禁用
            rule.is_active = False
            rule.note = (rule.note or "") + f" [系统跳过: {str(e)}]"
            continue

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
        # 🛡️ 审计：用户修改账户时再次验证
        try:
            _validate_account_for_transaction(db, data.account_id, payload["transaction_type"])
        except ValueError as e:
            raise ValueError(f"账户验证失败: {str(e)}")
        payload["account_id"] = data.account_id
    else:
        # 🛡️ 审计：确认时再次验证原始账户
        try:
            _validate_account_for_transaction(db, payload["account_id"], payload["transaction_type"])
        except ValueError as e:
            raise ValueError(f"原始账户验证失败: {str(e)}")
            
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
