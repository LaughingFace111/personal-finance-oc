from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.common.enums import ReimbursementStatus
from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book

from .schemas import (
    ReimbursementRequestCreate,
    ReimbursementRequestResponse,
    ReimbursementRequestUpdate,
)
from .service import (
    approve_reimbursement,
    create_reimbursement_request,
    get_reimbursement_request,
    get_reimbursement_requests,
    mark_reimbursed,
    reject_reimbursement,
    update_reimbursement_request,
)

router = APIRouter(prefix="/reimbursements", tags=["reimbursements"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
) -> str:
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        raise HTTPException(status_code=400, detail="未找到默认账本，请先初始化")
    return default_book.id


@router.post("", response_model=ReimbursementRequestResponse)
def create(
    data: ReimbursementRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return create_reimbursement_request(db, bid, data)


@router.get("", response_model=List[ReimbursementRequestResponse])
def list_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    status: Optional[ReimbursementStatus] = Query(None),
    source_transaction_id: Optional[str] = Query(None),
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_reimbursement_requests(db, bid, status, source_transaction_id)


@router.get("/{request_id}", response_model=ReimbursementRequestResponse)
def get(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return get_reimbursement_request(db, bid, request_id)


@router.patch("/{request_id}", response_model=ReimbursementRequestResponse)
def update(
    request_id: str,
    data: ReimbursementRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return update_reimbursement_request(db, bid, request_id, data)


@router.patch("/{request_id}/approve", response_model=ReimbursementRequestResponse)
def approve(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return approve_reimbursement(db, bid, request_id)


@router.patch("/{request_id}/reject", response_model=ReimbursementRequestResponse)
def reject(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return reject_reimbursement(db, bid, request_id)


@router.patch("/{request_id}/reimburse", response_model=ReimbursementRequestResponse)
def reimburse(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
):
    bid = get_current_book_id(current_user, db, book_id)
    return mark_reimbursed(db, bid, request_id)
