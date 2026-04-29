from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ReconciliationDefaultsResponse(BaseModel):
    account_id: str
    statement_period_start: date
    statement_period_end: date
    statement_opening_balance: Optional[Decimal] = None
    suggested_statement_closing_balance: Decimal
    ledger_closing_balance: Decimal
    difference_amount: Decimal
    is_credit_account: bool


class ReconciliationSessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_id: str
    statement_period_start: Optional[date] = None
    statement_period_end: Optional[date] = None
    statement_opening_balance: Optional[Decimal] = None
    statement_closing_balance: Decimal
    notes: Optional[str] = None


class ReconciliationStatementRowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row_id: str
    matched_transaction_id: Optional[str] = None
    review_status: Optional[str] = None
    review_note: Optional[str] = None


class ReconciliationSessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    review_state: Optional[str] = None
    notes: Optional[str] = None
    rows: List[ReconciliationStatementRowUpdate] = Field(default_factory=list)


class ReconciliationCloseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str
    note: Optional[str] = None
    is_counted_in_reports: bool = False


class ReconciliationStatementRowResponse(BaseModel):
    id: str
    row_no: int
    occurred_at: datetime
    direction: str
    amount: Decimal
    currency: str
    raw_account_name: Optional[str] = None
    counterparty: Optional[str] = None
    description: Optional[str] = None
    order_no: Optional[str] = None
    merchant_order_no: Optional[str] = None
    external_ref: Optional[str] = None
    match_status: str
    match_reason: Optional[str] = None
    matched_transaction_id: Optional[str] = None
    candidate_transaction_ids: List[str] = Field(default_factory=list)
    review_status: str
    review_note: Optional[str] = None


class ReconciliationLedgerTransactionResponse(BaseModel):
    id: str
    occurred_at: datetime
    direction: str
    amount: Decimal
    merchant: Optional[str] = None
    note: Optional[str] = None
    external_ref: Optional[str] = None
    transaction_type: str
    match_reason: Optional[str] = None


class ReconciliationBucketSummary(BaseModel):
    matched: int = 0
    missing: int = 0
    duplicate: int = 0
    unresolved: int = 0
    extra: int = 0


class ReconciliationComparisonResponse(BaseModel):
    statement_total_amount: Decimal
    ledger_total_amount: Decimal
    statement_closing_balance: Decimal
    ledger_closing_balance: Decimal
    difference_amount: Decimal
    buckets: ReconciliationBucketSummary
    matched_rows: List[ReconciliationStatementRowResponse] = Field(default_factory=list)
    missing_rows: List[ReconciliationStatementRowResponse] = Field(default_factory=list)
    duplicate_rows: List[ReconciliationStatementRowResponse] = Field(default_factory=list)
    unresolved_rows: List[ReconciliationStatementRowResponse] = Field(default_factory=list)
    extra_transactions: List[ReconciliationLedgerTransactionResponse] = Field(default_factory=list)


class ReconciliationSessionSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    account_id: str
    statement_period_start: date
    statement_period_end: date
    statement_closing_balance: Decimal
    ledger_closing_balance: Decimal
    difference_amount: Decimal
    status: str
    review_state: str
    evidence_filename: Optional[str] = None
    evidence_row_count: int
    close_note: Optional[str] = None
    close_transaction_id: Optional[str] = None
    closed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ReconciliationSessionDetailResponse(ReconciliationSessionSummaryResponse):
    statement_opening_balance: Optional[Decimal] = None
    statement_total_amount: Decimal
    ledger_total_amount: Decimal
    evidence_source_type: Optional[str] = None
    evidence_import_batch_id: Optional[str] = None
    notes: Optional[str] = None
    comparison: ReconciliationComparisonResponse
