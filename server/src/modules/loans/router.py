from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import (
    CreateLoanRequest, LoanPlanResponse, LoanPlanUpdate, LoanScheduleResponse, RepayLoanRequest
)
from .service import (
    create_loan_with_account, get_loan_plans, get_loan_plan,
    get_loan_schedules, get_upcoming_loans, repay_loan
)
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/loans", tags=["loans"])


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


@router.post("", response_model=LoanPlanResponse)
def create(
    data: CreateLoanRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Create loan with account"""
    bid = get_current_book_id(current_user, db, book_id)
    loan_plan, _ = create_loan_with_account(db, bid, data)
    return loan_plan


@router.get("", response_model=List[LoanPlanResponse])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    account_id: str = None,
    status: str = None
):
    """Get loan plans"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_loan_plans(db, bid, account_id, status)


@router.get("/upcoming", response_model=List[LoanScheduleResponse])
def list_upcoming(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None, 
    days: int = 30
):
    """Get upcoming loan payments"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_upcoming_loans(db, bid, days)


@router.get("/{plan_id}", response_model=LoanPlanResponse)
def get_plan(
    plan_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get loan plan by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    plan = get_loan_plan(db, plan_id, bid)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Loan plan not found")
    return plan


@router.get("/{plan_id}/schedules", response_model=List[LoanScheduleResponse])
def list_schedules(plan_id: str, db: Session = Depends(get_db)):
    """Get loan schedules"""
    return get_loan_schedules(db, plan_id)


@router.post("/{plan_id}/repay")
def repay(
    plan_id: str, 
    data: RepayLoanRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Repay loan (principal + interest)"""
    bid = get_current_book_id(current_user, db, book_id)
    result = repay_loan(db, plan_id, bid, data)
    return {
        "schedule": result[0],
        "principal_transaction": result[1],
        "interest_transaction": result[2]
    }
