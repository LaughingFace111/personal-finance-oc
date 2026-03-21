from typing import List

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import (
    ImportBatchResponse, ImportRowResponse, UpdateImportRowRequest, ConfirmImportRequest
)
from .service import (
    create_import_batch, get_import_batches, get_import_batch,
    get_import_rows, update_import_row, confirm_import
)
from src.modules.books.service import resolve_book_id

router = APIRouter(prefix="/imports", tags=["imports"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    return resolve_book_id(db, current_user.id, book_id)


@router.post("/upload", response_model=ImportBatchResponse)
async def upload(
    file: UploadFile = File(...),
    source_name: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload CSV file for import"""
    book_id = get_current_book_id(current_user, db)
    content = await file.read()
    
    # Pass content as bytes and filename to determine file type
    batch = create_import_batch(db, book_id, file.filename, content, source_name)
    return batch


@router.get("", response_model=List[ImportBatchResponse])
def list_batches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get import batches"""
    current_book_id = get_current_book_id(current_user, db, book_id)
    return get_import_batches(db, current_book_id)


@router.get("/{batch_id}", response_model=ImportBatchResponse)
def get_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get import batch by ID"""
    current_book_id = get_current_book_id(current_user, db, book_id)
    batch = get_import_batch(db, batch_id, current_book_id)
    if not batch:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Import batch not found")
    return batch


@router.get("/{batch_id}/rows", response_model=List[ImportRowResponse])
def list_rows(
    batch_id: str,
    confirm_status: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get import rows"""
    current_book_id = get_current_book_id(current_user, db, book_id)
    return get_import_rows(db, batch_id, current_book_id, confirm_status)


@router.patch("/rows/{row_id}", response_model=ImportRowResponse)
def update_row(
    row_id: str,
    data: UpdateImportRowRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Update import row"""
    current_book_id = get_current_book_id(current_user, db, book_id)
    return update_import_row(db, row_id, current_book_id, data)


@router.post("/{batch_id}/confirm")
def confirm(
    batch_id: str,
    data: ConfirmImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Confirm import and create transactions"""
    current_book_id = get_current_book_id(current_user, db, book_id)
    return confirm_import(db, batch_id, current_book_id, data)
