from datetime import date
from typing import List

from sqlalchemy.orm import Session, joinedload

from src.core import NotFoundException, generate_uuid
from src.modules.accounts.models import Account

from .models import Subscription
from .schemas import SubscriptionCreate, SubscriptionUpdate


def _serialize_subscription(subscription: Subscription) -> dict:
    return {
        "id": subscription.id,
        "book_id": subscription.book_id,
        "name": subscription.name,
        "amount_type": subscription.amount_type,
        "amount": subscription.amount,
        "cycle_days": subscription.cycle_days,
        "next_due_date": subscription.next_due_date,
        "account_id": subscription.account_id,
        "account_name": subscription.account.name if subscription.account else None,
        "created_at": subscription.created_at,
        "updated_at": subscription.updated_at,
    }


def _get_account_or_404(db: Session, book_id: str, account_id: str) -> Account:
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.book_id == book_id,
        Account.is_deleted == False,
    ).first()
    if not account:
        raise NotFoundException("Account not found")
    return account


def create_subscription(db: Session, book_id: str, data: SubscriptionCreate) -> dict:
    _get_account_or_404(db, book_id, data.account_id)
    subscription = Subscription(
        id=generate_uuid(),
        book_id=book_id,
        name=data.name.strip(),
        amount_type=data.amount_type,
        amount=data.amount,
        cycle_days=data.cycle_days.strip(),
        next_due_date=data.next_due_date,
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
    ).order_by(Subscription.next_due_date.asc(), Subscription.created_at.asc()).all()
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

    for key, value in payload.items():
        if key in {"name", "cycle_days"} and isinstance(value, str):
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
        Subscription.next_due_date >= today,
        Subscription.next_due_date <= end_date,
    ).order_by(Subscription.next_due_date.asc(), Subscription.created_at.asc()).all()

    result = []
    for item in subscriptions:
        result.append({
            "id": item.id,
            "name": item.name,
            "amount_type": item.amount_type,
            "amount": item.amount,
            "cycle_days": item.cycle_days,
            "next_due_date": item.next_due_date,
            "account_id": item.account_id,
            "account_name": item.account.name if item.account else None,
            "days_until_due": (item.next_due_date - today).days,
        })
    return result
