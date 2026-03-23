from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field


class ParsedBillRecord(BaseModel):
    row_no: int
    occurred_at: datetime
    transaction_type: str
    direction: str
    amount: Decimal
    counterparty: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    in_out: str
    status: str
    transaction_order_no: str
    merchant_order_no: Optional[str] = None
    payment_method: Optional[str] = None
    note: Optional[str] = None


class BillImportResponse(BaseModel):
    bill_type: str
    total_rows: int
    parsed_rows: int
    imported_rows: int
    duplicate_rows: int
    skipped_rows: int
    error_rows: int
    message: str
    preview: List[ParsedBillRecord]
    warnings: List[str]


class ParsedBillItem(BaseModel):
    tempId: str
    billDate: datetime
    direction: str
    amount: Decimal
    rawAccountName: Optional[str] = None
    matchedAccountId: Optional[str] = None
    matchedAccountName: Optional[str] = None
    accountMatchStatus: str = "UNMATCHED"
    tradeCategory: Optional[str] = None
    categoryId: Optional[str] = None
    categoryName: Optional[str] = None
    categoryMatchStatus: str = "UNMATCHED"
    counterparty: Optional[str] = None
    counterpartyAccount: Optional[str] = None
    itemDesc: Optional[str] = None
    orderNo: Optional[str] = None
    merchantOrderNo: Optional[str] = None
    tradeStatus: Optional[str] = None
    rawDirection: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    ignoreReason: Optional[str] = None
    unresolvedReason: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class ParseBillResponse(BaseModel):
    parseId: str
    items: List[ParsedBillItem]


class MatchBillRequest(BaseModel):
    matchTarget: str


class ConfirmImportRequest(BaseModel):
    parseId: str
    confirmedItems: List[ParsedBillItem]


class ConfirmImportResponse(BaseModel):
    parseId: str
    totalItems: int
    importedRows: int
    duplicateRows: int
    skippedRows: int
    errorRows: int
    warnings: List[str]
