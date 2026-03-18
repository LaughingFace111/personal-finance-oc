from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import (
    CreateInstallmentRequest, InstallmentPlanResponse, InstallmentPlanUpdate,
    InstallmentScheduleResponse
)
from .service import (
    create_installment_with_transaction, get_installment_plans, get_installment_plan,
    get_installment_schedules, get_upcoming_installments, update_installment_plan, settle_installment
)
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/installments", tags=["installments"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No default book found")
    return default_book.id


@router.post("", response_model=InstallmentPlanResponse)
def create(
    data: CreateInstallmentRequest, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Create installment with purchase transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    plan, _ = create_installment_with_transaction(db, bid, data)
    return plan


@router.get("", response_model=List[InstallmentPlanResponse])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    account_id: str = None,
    status: str = None
):
    """Get installment plans"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_installment_plans(db, bid, account_id, status)


@router.get("/upcoming", response_model=List[InstallmentScheduleResponse])
def list_upcoming(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    book_id: str = None, 
    days: int = 30
):
    """Get upcoming installment payments"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_upcoming_installments(db, bid, days)


@router.get("/{plan_id}", response_model=InstallmentPlanResponse)
def get_plan(
    plan_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get installment plan by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    plan = get_installment_plan(db, plan_id, bid)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Installment plan not found")
    return plan


@router.get("/{plan_id}/schedules", response_model=List[InstallmentScheduleResponse])
def list_schedules(plan_id: str, db: Session = Depends(get_db)):
    """Get installment schedules"""
    return get_installment_schedules(db, plan_id)


@router.patch("/{plan_id}", response_model=InstallmentPlanResponse)
def update_plan(
    plan_id: str, 
    data: InstallmentPlanUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Update installment plan"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_installment_plan(db, plan_id, bid, data)


@router.post("/{plan_id}/settle")
def settle(
    plan_id: str, 
    account_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Settle next installment payment"""
    bid = get_current_book_id(current_user, db, book_id)
    from datetime import datetime
    schedule, transaction = settle_installment(db, plan_id, bid, account_id, datetime.utcnow())
    return {"schedule": schedule, "transaction": transaction}
