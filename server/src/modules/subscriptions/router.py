from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.core import NotFoundException, get_db
from src.core.auth import get_current_user
from src.modules.accounts.router import get_current_book_id
from src.modules.auth.models import User

from .schemas import (
    SubscriptionCreate,
    SubscriptionResponse,
    SubscriptionUpdate,
    UpcomingBillResponse,
)
from .service import (
    create_subscription,
    delete_subscription,
    get_subscription,
    get_upcoming_bills,
    list_subscriptions,
    update_subscription,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("", response_model=list[SubscriptionResponse])
def list_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return list_subscriptions(db, bid)


@router.post("", response_model=SubscriptionResponse)
def create(
    data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return create_subscription(db, bid, data)


@router.get("/upcoming", response_model=list[UpcomingBillResponse])
def upcoming(
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_upcoming_bills(db, bid, days)


@router.get("/{subscription_id}", response_model=SubscriptionResponse)
def get(
    subscription_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    subscription = get_subscription(db, subscription_id, bid)
    if not subscription:
        raise NotFoundException("Subscription not found")
    return subscription


@router.patch("/{subscription_id}", response_model=SubscriptionResponse)
def update(
    subscription_id: str,
    data: SubscriptionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return update_subscription(db, subscription_id, bid, data)


@router.delete("/{subscription_id}")
def delete(
    subscription_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    delete_subscription(db, subscription_id, bid)
    return {"message": "Subscription deleted"}
