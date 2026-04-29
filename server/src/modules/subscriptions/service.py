from datetime import date
from decimal import Decimal
from typing import List

from sqlalchemy.orm import Session, joinedload

from src.core import AppException, ErrorCode, NotFoundException, generate_uuid
from src.modules.accounts.models import Account

from .models import Subscription
from .schemas import SubscriptionCreate, SubscriptionUpdate


def _format_cadence_label(subscription: Subscription) -> str:
    interval = int(subscription.frequency_interval or 1)
    if subscription.frequency_unit == "weekly":
        return "每周" if interval == 1 else f"每 {interval} 周"
    if subscription.frequency_unit == "monthly":
        if subscription.day_of_month:
            return f"每 {interval} 个月，{int(subscription.day_of_month)} 日"
        return "每月" if interval == 1 else f"每 {interval} 个月"
    if subscription.frequency_unit == "yearly":
        return "每年" if interval == 1 else f"每 {interval} 年"
    return "每 {0} 天".format(interval)


def _format_due_detail(subscription: Subscription) -> str:
    if subscription.frequency_unit == "monthly" and subscription.day_of_month:
        return f"每月 {int(subscription.day_of_month)} 日扣款"
    if subscription.frequency_unit == "yearly":
        return f"年度锚点 {subscription.due_anchor_date.isoformat()}"
    if subscription.frequency_unit == "weekly":
        return f"周锚点 {subscription.due_anchor_date.isoformat()}"
    return f"间隔锚点 {subscription.due_anchor_date.isoformat()}"


def _validate_recurrence_fields(
    *,
    frequency_unit: str,
    frequency_interval: int,
    day_of_month: int | None,
) -> None:
    if frequency_interval < 1:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="frequency_interval must be positive")
    if frequency_unit == "monthly" and day_of_month is None:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="day_of_month is required for monthly bills")
    if frequency_unit != "monthly" and day_of_month is not None:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="day_of_month is only valid for monthly bills")


def _serialize_subscription(subscription: Subscription) -> dict:
    today = date.today()
    return {
        "id": subscription.id,
        "book_id": subscription.book_id,
        "name": subscription.name,
        "amount_type": subscription.amount_type,
        "amount": subscription.amount,
        "frequency_unit": subscription.frequency_unit,
        "frequency_interval": int(subscription.frequency_interval or 1),
        "day_of_month": int(subscription.day_of_month) if subscription.day_of_month is not None else None,
        "due_anchor_date": subscription.due_anchor_date,
        "next_payment_date": subscription.next_payment_date,
        "account_id": subscription.account_id,
        "account_name": subscription.account.name if subscription.account else None,
        "cadence_label": _format_cadence_label(subscription),
        "due_detail": _format_due_detail(subscription),
        "days_until_payment": (subscription.next_payment_date - today).days,
        "created_at": subscription.created_at,
        "updated_at": subscription.updated_at,
    }


def _get_account_or_404(db: Session, book_id: str, account_id: str) -> Account:
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.book_id == book_id,
        Account.is_active == True,
        Account.is_archived == False,
        Account.is_deleted == False,
    ).first()
    if not account:
        raise NotFoundException("Account not found")
    return account


def create_subscription(db: Session, book_id: str, data: SubscriptionCreate) -> dict:
    _get_account_or_404(db, book_id, data.account_id)
    _validate_recurrence_fields(
        frequency_unit=data.frequency_unit,
        frequency_interval=data.frequency_interval,
        day_of_month=data.day_of_month,
    )
    subscription = Subscription(
        id=generate_uuid(),
        book_id=book_id,
        name=data.name.strip(),
        amount_type=data.amount_type,
        amount=data.amount,
        frequency_unit=data.frequency_unit,
        frequency_interval=data.frequency_interval,
        day_of_month=data.day_of_month,
        due_anchor_date=data.due_anchor_date,
        next_payment_date=data.next_payment_date,
        account_id=data.account_id,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    subscription = db.query(Subscription).options(joinedload(Subscription.account)).filter(Subscription.id == subscription.id).first()
    return _serialize_subscription(subscription)


def list_subscriptions(db: Session, book_id: str) -> List[dict]:
    subscriptions = db.query(Subscription).options(joinedload(Subscription.account)).filter(
        Subscription.book_id == book_id
    ).order_by(Subscription.next_payment_date.asc(), Subscription.created_at.asc()).all()
    return [_serialize_subscription(item) for item in subscriptions]


def get_subscription(db: Session, subscription_id: str, book_id: str) -> Subscription | None:
    return db.query(Subscription).options(joinedload(Subscription.account)).filter(
        Subscription.id == subscription_id,
        Subscription.book_id == book_id,
    ).first()


def update_subscription(db: Session, subscription_id: str, book_id: str, data: SubscriptionUpdate) -> dict:
    subscription = get_subscription(db, subscription_id, book_id)
    if not subscription:
        raise NotFoundException("Subscription not found")

    payload = data.model_dump(exclude_unset=True)
    if "account_id" in payload and payload["account_id"]:
        _get_account_or_404(db, book_id, payload["account_id"])

    next_frequency_unit = payload.get("frequency_unit", subscription.frequency_unit)
    next_frequency_interval = payload.get("frequency_interval", int(subscription.frequency_interval or 1))
    next_day_of_month = payload.get("day_of_month", subscription.day_of_month)
    _validate_recurrence_fields(
        frequency_unit=next_frequency_unit,
        frequency_interval=int(next_frequency_interval),
        day_of_month=int(next_day_of_month) if next_day_of_month is not None else None,
    )

    for key, value in payload.items():
        if key == "day_of_month" and value is not None:
            value = int(value)
        if key == "frequency_interval" and value is not None:
            value = int(value)
        if key == "amount" and value is not None:
            value = Decimal(str(value))
        if key == "name" and isinstance(value, str):
            value = value.strip()
        setattr(subscription, key, value)

    db.commit()
    db.refresh(subscription)
    subscription = get_subscription(db, subscription_id, book_id)
    return _serialize_subscription(subscription)


def delete_subscription(db: Session, subscription_id: str, book_id: str) -> None:
    subscription = get_subscription(db, subscription_id, book_id)
    if not subscription:
        raise NotFoundException("Subscription not found")
    db.delete(subscription)
    db.commit()


def get_upcoming_bills(db: Session, book_id: str, days: int = 30) -> List[dict]:
    today = date.today()
    end_date = today.fromordinal(today.toordinal() + days)
    subscriptions = db.query(Subscription).options(joinedload(Subscription.account)).filter(
        Subscription.book_id == book_id,
        Subscription.next_payment_date >= today,
        Subscription.next_payment_date <= end_date,
    ).order_by(Subscription.next_payment_date.asc(), Subscription.created_at.asc()).all()
    return [_serialize_subscription(item) for item in subscriptions]
