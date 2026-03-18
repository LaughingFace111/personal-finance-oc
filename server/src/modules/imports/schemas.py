from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field
from src.common.enums import ImportStatus, ConfirmStatus


# Import Batch schemas
class ImportBatchResponse(BaseModel):
    id: str
    book_id: str
    filename: str
    source_name: Optional[str] = None
    file_type: str
    total_rows: int = 0
    parsed_rows: int = 0
    confirmed_rows: int = 0
    skipped_rows: int = 0
    duplicate_rows: int = 0
    status: ImportStatus = ImportStatus.UPLOADED
    mapping_config: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Import Row schemas
class ImportRowResponse(BaseModel):
    id: str
    batch_id: str
    row_no: int
    raw_data: str  # JSON string
    normalized_data: Optional[str] = None  # JSON string
    guessed_account_id: Optional[str] = None
    guessed_category_id: Optional[str] = None
    guessed_transaction_type: Optional[str] = None
    guessed_confidence: Optional[Decimal] = None
    duplicate_candidate_id: Optional[str] = None
    user_modified: bool = False
    confirm_status: ConfirmStatus = ConfirmStatus.PENDING
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Update row request
class UpdateImportRowRequest(BaseModel):
    guessed_account_id: Optional[str] = None
    guessed_category_id: Optional[str] = None
    guessed_transaction_type: Optional[str] = None
    confirm_status: Optional[ConfirmStatus] = None


# Confirm import request
class ConfirmImportRequest(BaseModel):
    confirmed_row_ids: Optional[List[str]] = None  # If None, confirm all pending
    skipped_row_ids: Optional[List[str]] = None
