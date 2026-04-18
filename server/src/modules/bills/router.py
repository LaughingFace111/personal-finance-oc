from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.core.logger import log_audit, log_business
from src.modules.auth.models import User

from .schemas import BillImportResponse, ConfirmImportRequest, ConfirmImportResponse, MatchBillRequest, ParseBillResponse
from .service import BillParseError, apply_match_rules_to_parse, confirm_import, get_parse_result, import_bill_file, parse_bill_file

router = APIRouter(prefix="/bills", tags=["bills"])


@router.post("/import", response_model=BillImportResponse)
async def import_bills(
    file: UploadFile = File(...),
    bill_type: str = Form("alipay"),
    account_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    return import_bill_file(
        db=db,
        user_id=current_user.id,
        bill_type=bill_type,
        content=content,
        account_id=account_id,
    )


@router.post("/parse", response_model=ParseBillResponse)
async def parse_bills(
    file: UploadFile = File(...),
    bill_type: str = Form("alipay"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        content = await file.read()
        return parse_bill_file(
            db=db,
            user_id=current_user.id,
            bill_type=bill_type,
            filename=file.filename or f"{bill_type}.csv",
            content=content,
        )
    except (BillParseError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/parse/{parse_id}", response_model=ParseBillResponse)
def get_parsed_bills(
    parse_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_parse_result(db=db, user_id=current_user.id, parse_id=parse_id)


@router.post("/parse/{parse_id}/match", response_model=ParseBillResponse)
def match_parsed_bills(
    parse_id: str,
    data: MatchBillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return apply_match_rules_to_parse(
            db=db,
            user_id=current_user.id,
            parse_id=parse_id,
            match_target=data.matchTarget,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/confirm-import", response_model=ConfirmImportResponse)
def confirm_bills_import(
    data: ConfirmImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = confirm_import(
        db=db,
        user_id=current_user.id,
        parse_id=data.parseId,
        confirmed_items=data.confirmedItems,
        excluded_operator_names=data.excludedOperatorNames,
    )
    
    # 记录审计日志
    log_audit(
        action="bill_import",
        user_id=current_user.id,
        resource_type="bill_import",
        resource_id=data.parseId,
        details={
            "total_items": result.totalItems,
            "imported_rows": result.importedRows,
            "duplicate_rows": result.duplicateRows,
            "skipped_rows": result.skippedRows,
            "error_rows": result.errorRows,
        },
    )
    
    log_business(
        action="bill_import",
        message=f"导入账单: 导入 {result.importedRows} 条，跳过 {result.skippedRows} 条",
        user_id=current_user.id,
    )
    
    return result
