import json
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from src.common.enums import (
    ReimbursementStatus,
    SourceType,
    TransactionDirection,
    TransactionType,
)
from src.core import AppException, ErrorCode, NotFoundException, generate_uuid
from src.modules.transactions.schemas import TransactionCreate
from src.modules.transactions.service import create_transaction, get_transaction

from .models import ReimbursementRequest
from .schemas import ReimbursementRequestCreate, ReimbursementRequestUpdate


ALLOWED_SOURCE_TRANSACTION_TYPES = {
    TransactionType.DEBT_BORROW.value,
    TransactionType.DEBT_LEND.value,
}


def _get_request(db: Session, request_id: str, book_id: str) -> Optional[ReimbursementRequest]:
    return db.query(ReimbursementRequest).filter(
        ReimbursementRequest.id == request_id,
        ReimbursementRequest.book_id == book_id,
    ).first()


def _require_request(db: Session, request_id: str, book_id: str) -> ReimbursementRequest:
    request = _get_request(db, request_id, book_id)
    if not request:
        raise NotFoundException("Reimbursement request not found")
    return request


def _validate_source_transaction(db: Session, book_id: str, source_transaction_id: Optional[str]):
    if not source_transaction_id:
        return None

    source_transaction = get_transaction(db, source_transaction_id, book_id)
    if not source_transaction:
        raise NotFoundException("Source transaction not found")

    if source_transaction.transaction_type not in ALLOWED_SOURCE_TRANSACTION_TYPES:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="Source transaction must be a debt borrow or debt lend transaction",
        )

    return source_transaction


def create_reimbursement_request(
    db: Session,
    book_id: str,
    data: ReimbursementRequestCreate,
) -> ReimbursementRequest:
    _validate_source_transaction(db, book_id, data.source_transaction_id)

    request = ReimbursementRequest(
        id=generate_uuid(),
        book_id=book_id,
        source_transaction_id=data.source_transaction_id,
        status=ReimbursementStatus.PENDING.value,
        contact_name=data.contact_name.strip(),
        description=data.description.strip(),
        amount=data.amount,
        currency=data.currency,
        occurred_at=data.occurred_at,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def get_reimbursement_requests(
    db: Session,
    book_id: str,
    status_filter: Optional[ReimbursementStatus] = None,
    source_transaction_id: Optional[str] = None,
) -> List[ReimbursementRequest]:
    query = db.query(ReimbursementRequest).filter(ReimbursementRequest.book_id == book_id)

    if status_filter:
        query = query.filter(ReimbursementRequest.status == status_filter.value)
    if source_transaction_id:
        query = query.filter(ReimbursementRequest.source_transaction_id == source_transaction_id)

    return query.order_by(
        ReimbursementRequest.occurred_at.desc(),
        ReimbursementRequest.created_at.desc(),
        ReimbursementRequest.id.desc(),
    ).all()


def get_reimbursement_request(db: Session, book_id: str, request_id: str) -> ReimbursementRequest:
    return _require_request(db, request_id, book_id)


def update_reimbursement_request(
    db: Session,
    book_id: str,
    request_id: str,
    data: ReimbursementRequestUpdate,
) -> ReimbursementRequest:
    request = _require_request(db, request_id, book_id)
    if request.status == ReimbursementStatus.REIMBURSED.value:
        raise AppException(
            status_code=400,
            code=ErrorCode.CONFLICT,
            message="已报销的申请不能再编辑",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(request, key, value)

    db.commit()
    db.refresh(request)
    return request


def approve_reimbursement(db: Session, book_id: str, request_id: str) -> ReimbursementRequest:
    request = _require_request(db, request_id, book_id)
    if request.status != ReimbursementStatus.PENDING.value:
        raise AppException(
            status_code=400,
            code=ErrorCode.CONFLICT,
            message="只有待处理申请可以审批通过",
        )

    request.status = ReimbursementStatus.APPROVED.value
    request.resolved_at = None
    db.commit()
    db.refresh(request)
    return request


def reject_reimbursement(db: Session, book_id: str, request_id: str) -> ReimbursementRequest:
    request = _require_request(db, request_id, book_id)
    if request.status == ReimbursementStatus.REIMBURSED.value:
        raise AppException(
            status_code=400,
            code=ErrorCode.CONFLICT,
            message="已报销申请不能拒绝",
        )
    if request.status == ReimbursementStatus.REJECTED.value:
        return request

    request.status = ReimbursementStatus.REJECTED.value
    request.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(request)
    return request


def mark_reimbursed(db: Session, book_id: str, request_id: str) -> ReimbursementRequest:
    request = _require_request(db, request_id, book_id)
    if request.status == ReimbursementStatus.REIMBURSED.value:
        return request
    if not request.source_transaction_id:
        raise AppException(
            status_code=400,
            code=ErrorCode.CONFLICT,
            message="缺少源债务交易，无法生成回款/还款记录",
        )

    source_transaction = _validate_source_transaction(db, book_id, request.source_transaction_id)

    request.status = ReimbursementStatus.REIMBURSED.value
    request.resolved_at = datetime.now(timezone.utc)

    try:
        source_extra = json.loads(source_transaction.extra) if source_transaction.extra else {}
    except (TypeError, json.JSONDecodeError):
        source_extra = {}

    if not isinstance(source_extra, dict):
        source_extra = {}

    reimbursement_note_prefix = "报销垫付已回款" if source_transaction.transaction_type == TransactionType.DEBT_LEND.value else "报销垫付已偿还"
    reimbursement_transaction_type = (
        TransactionType.DEBT_RECEIVE_BACK
        if source_transaction.transaction_type == TransactionType.DEBT_LEND.value
        else TransactionType.DEBT_PAY_BACK
    )
    reimbursement_direction = (
        TransactionDirection.IN
        if reimbursement_transaction_type == TransactionType.DEBT_RECEIVE_BACK
        else TransactionDirection.OUT
    )

    extra_payload = {
        **source_extra,
        "reimbursement_request_id": request.id,
        "reimbursement_status": ReimbursementStatus.REIMBURSED.value,
    }

    create_transaction(
        db,
        book_id,
        TransactionCreate(
            occurred_at=request.resolved_at,
            transaction_type=reimbursement_transaction_type,
            direction=reimbursement_direction,
            amount=request.amount,
            currency=request.currency,
            account_id=source_transaction.account_id,
            merchant=request.contact_name,
            note=f"{reimbursement_note_prefix}: {request.description}",
            source_type=SourceType.MANUAL,
            related_transaction_id=source_transaction.id,
            extra=json.dumps(extra_payload, ensure_ascii=False),
        ),
    )
    db.refresh(request)
    return request
