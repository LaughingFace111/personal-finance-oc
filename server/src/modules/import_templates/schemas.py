from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ImportTemplateBase(BaseModel):
    template_name: str
    source_name: Optional[str] = None
    file_type: str = "csv"
    sheet_name: Optional[str] = None
    field_mapping: str
    default_values: Optional[str] = None
    notes: Optional[str] = None


class ImportTemplateCreate(ImportTemplateBase):
    pass


class ImportTemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    source_name: Optional[str] = None
    file_type: Optional[str] = None
    sheet_name: Optional[str] = None
    field_mapping: Optional[str] = None
    default_values: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ImportTemplateResponse(ImportTemplateBase):
    id: str
    book_id: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
