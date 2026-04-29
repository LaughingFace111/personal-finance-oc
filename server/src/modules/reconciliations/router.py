from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_default_book

from .schemas import (
    ReconciliationCloseRequest,
    ReconciliationDefaultsResponse,
    ReconciliationSessionCreate,
    ReconciliationSessionDetailResponse,
    ReconciliationSessionSummaryResponse,
    ReconciliationSessionUpdate,
)
from .service import (
    BillParseError,
    close_reconciliation_session,
    create_reconciliation_session,
    get_reconciliation_defaults,
    get_reconciliation_session_detail,
    ingest_statement_evidence,
    list_account_reconciliation_sessions,
    update_reconciliation_session,
)

router = APIRouter(prefix="/reconciliations", tags=["reconciliations"])


def _get_current_book_id(db: Session, current_user: User) -> str:
    book = get_default_book(db, current_user.id)
    if not book:
        raise HTTPException(status_code=400, detail="未找到默认账本")
    return book.id


@router.get("/accounts/{account_id}/defaults", response_model=ReconciliationDefaultsResponse)
def get_defaults(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_reconciliation_defaults(
        db,
        book_id=_get_current_book_id(db, current_user),
        account_id=account_id,
    )


@router.get("/accounts/{account_id}/sessions", response_model=list[ReconciliationSessionSummaryResponse])
def list_account_sessions(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_account_reconciliation_sessions(
        db,
        book_id=_get_current_book_id(db, current_user),
        account_id=account_id,
    )


@router.post("/sessions", response_model=ReconciliationSessionDetailResponse)
def create_session(
    data: ReconciliationSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_reconciliation_session(
        db,
        book_id=_get_current_book_id(db, current_user),
        data=data,
    )


@router.get("/sessions/{session_id}", response_model=ReconciliationSessionDetailResponse)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_reconciliation_session_detail(
        db,
        book_id=_get_current_book_id(db, current_user),
        session_id=session_id,
    )


@router.patch("/sessions/{session_id}", response_model=ReconciliationSessionDetailResponse)
def update_session(
    session_id: str,
    data: ReconciliationSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_reconciliation_session(
        db,
        book_id=_get_current_book_id(db, current_user),
        session_id=session_id,
        data=data,
    )


@router.post("/sessions/{session_id}/evidence", response_model=ReconciliationSessionDetailResponse)
async def upload_evidence(
    session_id: str,
    file: UploadFile = File(...),
    bill_type: str = Form("alipay"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        content = await file.read()
        return ingest_statement_evidence(
            db,
            book_id=_get_current_book_id(db, current_user),
            user_id=current_user.id,
            session_id=session_id,
            bill_type=bill_type,
            filename=file.filename or f"{bill_type}.csv",
            content=content,
        )
    except (BillParseError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sessions/{session_id}/close", response_model=ReconciliationSessionDetailResponse)
def close_session(
    session_id: str,
    data: ReconciliationCloseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return close_reconciliation_session(
        db,
        book_id=_get_current_book_id(db, current_user),
        session_id=session_id,
        action=data.action,
        note=data.note,
        is_counted_in_reports=data.is_counted_in_reports,
    )
