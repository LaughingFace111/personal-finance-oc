import json
from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from src.common.enums import ImportStatus, SourceType
from src.core import IdempotencyException, NotFoundException, generate_uuid
from src.modules.books.service import get_default_book
from src.modules.imports.models import ImportBatch, ImportRow
from src.modules.accounts.service import get_accounts
from src.modules.categories.service import get_categories
from src.modules.transactions.schemas import TransactionCreate
from src.modules.transactions.service import create_transaction

from .matchers import AccountMatcher, CategoryMatcher
from .parsers import AlipayBillParser, BillParser, JdBillParser, StubBillParser, WechatBillParser
from .schemas import (
    BillImportResponse,
    ConfirmImportResponse,
    ParseBillResponse,
    ParsedBillItem,
)
from src.modules.rules.service import apply_rules


def get_bill_parser(bill_type: str) -> BillParser:
    normalized = (bill_type or "alipay").strip().lower()
    if normalized == "alipay":
        return AlipayBillParser()
    if normalized == "wechat":
        return WechatBillParser()
    if normalized == "jd":
        return JdBillParser()
    if normalized == "custom":
        return StubBillParser("自定义")
    raise ValueError(f"不支持的账单类型: {bill_type}")


def _detect_file_type(filename: Optional[str]) -> str:
    lowered = (filename or "").lower()
    if lowered.endswith(".xlsx"):
        return "xlsx"
    return "csv"


def _serialize_jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, dict):
        return {k: _serialize_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_jsonable(v) for v in value]
    return value


def _build_parsed_item(record, account_matcher: AccountMatcher, category_matcher: CategoryMatcher) -> ParsedBillItem:
    direction = record.direction.value if hasattr(record.direction, "value") else str(record.direction)
    raw_account_name = record.payment_method or ""

    account_match = account_matcher.match(raw_account_name)
    category_match = category_matcher.match(record.category, record.description, direction)

    warnings: List[str] = []
    unresolved_reasons: List[str] = []
    if account_match.warning:
        warnings.append(account_match.warning)
    if category_match.warning:
        warnings.append(category_match.warning)
    if account_match.status == "UNMATCHED":
        unresolved_reasons.append("账户未匹配")
    if category_match.status == "UNMATCHED":
        unresolved_reasons.append("分类未匹配")

    return ParsedBillItem(
        tempId=f"row-{record.row_no}",
        billDate=record.occurred_at,
        direction=direction,
        amount=record.amount,
        rawAccountName=raw_account_name or None,
        matchedAccountId=account_match.account_id,
        matchedAccountName=account_match.account_name,
        accountMatchStatus=account_match.status,
        tradeCategory=record.category,
        categoryId=category_match.category_id,
        categoryName=category_match.category_name,
        categoryMatchStatus=category_match.status,
        counterparty=record.counterparty,
        counterpartyAccount=record.counterparty_account,
        itemDesc=record.description,
        orderNo=record.transaction_order_no,
        merchantOrderNo=record.merchant_order_no,
        tradeStatus=record.status,
        rawDirection=record.in_out,
        tags=[],
        unresolvedReason="；".join(unresolved_reasons) if unresolved_reasons else None,
        warnings=warnings,
    )


def _rebuild_unresolved_reason(item: ParsedBillItem) -> Optional[str]:
    reasons: List[str] = []
    if not item.matchedAccountId:
        reasons.append("账户未匹配")
    if not item.categoryId:
        reasons.append("分类未匹配")
    return "；".join(reasons) if reasons else None


def parse_bill_file(
    db: Session,
    user_id: str,
    bill_type: str,
    filename: str,
    content: bytes,
) -> ParseBillResponse:
    book = get_default_book(db, user_id)
    if not book:
        raise NotFoundException("未找到默认账本")

    parser = get_bill_parser(bill_type)
    parsed_records = parser.parse(content)
    account_matcher = AccountMatcher(db, book.id)
    category_matcher = CategoryMatcher(db, book.id)

    batch = ImportBatch(
        id=generate_uuid(),
        book_id=book.id,
        filename=filename or f"{bill_type}-import.csv",
        source_name=bill_type,
        file_type=_detect_file_type(filename),
        total_rows=len(parsed_records),
        parsed_rows=len(parsed_records),
        status=ImportStatus.PARSED.value,
        parser_version="bills-v2",
    )
    db.add(batch)

    items: List[ParsedBillItem] = []
    rows: List[ImportRow] = []
    for record in parsed_records:
        item = _build_parsed_item(record, account_matcher, category_matcher)
        items.append(item)

        raw_data = _serialize_jsonable(asdict(record))
        normalized_data = item.model_dump(mode="json")
        rows.append(
            ImportRow(
                id=generate_uuid(),
                batch_id=batch.id,
                row_no=record.row_no,
                raw_data=json.dumps(raw_data, ensure_ascii=False),
                normalized_data=json.dumps(normalized_data, ensure_ascii=False),
                guessed_account_id=item.matchedAccountId,
                guessed_category_id=item.categoryId,
                guessed_confidence=Decimal("90")
                if item.accountMatchStatus == "MATCHED" and item.categoryMatchStatus == "MATCHED"
                else Decimal("60"),
                confirm_status="pending",
                error_message=item.unresolvedReason,
            )
        )

    db.add_all(rows)
    db.commit()
    return ParseBillResponse(parseId=batch.id, items=items)


def get_parse_result(db: Session, user_id: str, parse_id: str) -> ParseBillResponse:
    book = get_default_book(db, user_id)
    if not book:
        raise NotFoundException("未找到默认账本")

    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == parse_id, ImportBatch.book_id == book.id)
        .first()
    )
    if not batch:
        raise NotFoundException("parseId 不存在")

    rows = (
        db.query(ImportRow)
        .filter(ImportRow.batch_id == parse_id)
        .order_by(ImportRow.row_no.asc())
        .all()
    )
    items = [ParsedBillItem(**json.loads(row.normalized_data or "{}")) for row in rows]
    return ParseBillResponse(parseId=parse_id, items=items)


def apply_match_rules_to_parse(
    db: Session,
    user_id: str,
    parse_id: str,
    match_target: str,
) -> ParseBillResponse:
    book = get_default_book(db, user_id)
    if not book:
        raise NotFoundException("未找到默认账本")

    if match_target not in {"account", "category", "tag"}:
        raise ValueError("不支持的匹配目标")

    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == parse_id, ImportBatch.book_id == book.id)
        .first()
    )
    if not batch:
        raise NotFoundException("parseId 不存在")

    rows = (
        db.query(ImportRow)
        .filter(ImportRow.batch_id == parse_id)
        .order_by(ImportRow.row_no.asc())
        .all()
    )
    accounts = {account.id: account.name for account in get_accounts(db, book.id)}
    categories = {category.id: category.name for category in get_categories(db, book.id)}

    items: List[ParsedBillItem] = []
    for row in rows:
        item = ParsedBillItem(**json.loads(row.normalized_data or "{}"))
        matched = apply_rules(
            db=db,
            book_id=book.id,
            merchant=item.counterparty or "",
            description=item.itemDesc or "",
            counterparty=item.counterparty or "",
            account=item.rawAccountName or "",
            category=item.tradeCategory or "",
            target_type=match_target,
        )
        if match_target == "account" and matched.get("account_id"):
            item.matchedAccountId = matched["account_id"]
            item.matchedAccountName = accounts.get(matched["account_id"])
            item.accountMatchStatus = "MATCHED"
        elif match_target == "category" and matched.get("category_id"):
            item.categoryId = matched["category_id"]
            item.categoryName = categories.get(matched["category_id"])
            item.categoryMatchStatus = "MATCHED"
        elif match_target == "tag" and matched.get("tag_name"):
            next_tags = list(dict.fromkeys([*item.tags, matched["tag_name"]]))
            item.tags = next_tags

        item.unresolvedReason = _rebuild_unresolved_reason(item)
        row.normalized_data = json.dumps(item.model_dump(mode="json"), ensure_ascii=False)
        row.guessed_account_id = item.matchedAccountId
        row.guessed_category_id = item.categoryId
        row.error_message = item.unresolvedReason
        items.append(item)

    db.commit()
    return ParseBillResponse(parseId=parse_id, items=items)


def _build_business_key(item: ParsedBillItem, bill_type: str, book_id: str) -> str:
    if item.orderNo:
        return f"{bill_type.lower()}:{item.orderNo}"
    seed = f"{book_id}|{item.tempId}|{item.billDate.isoformat()}|{item.amount}|{item.counterparty or ''}|{item.itemDesc or ''}"
    return f"{bill_type.lower()}:{sha256(seed.encode()).hexdigest()[:24]}"


def _direction_to_type(direction: str) -> str:
    return "income" if direction == "in" else "expense"


def confirm_import(
    db: Session,
    user_id: str,
    parse_id: str,
    confirmed_items: List[ParsedBillItem],
) -> ConfirmImportResponse:
    book = get_default_book(db, user_id)
    if not book:
        raise NotFoundException("未找到默认账本")

    batch = (
        db.query(ImportBatch)
        .filter(ImportBatch.id == parse_id, ImportBatch.book_id == book.id)
        .first()
    )
    if not batch:
        raise NotFoundException("parseId 不存在")

    rows = db.query(ImportRow).filter(ImportRow.batch_id == parse_id).all()
    row_map = {f"row-{row.row_no}": row for row in rows}
    bill_type = batch.source_name or "alipay"

    imported_rows = 0
    duplicate_rows = 0
    skipped_rows = 0
    error_rows = 0
    warnings: List[str] = []

    for item in confirmed_items:
        row = row_map.get(item.tempId)
        if not row:
            skipped_rows += 1
            warnings.append(f"{item.tempId} 未找到对应缓冲记录，已跳过")
            continue

        row.normalized_data = json.dumps(item.model_dump(mode="json"), ensure_ascii=False)
        row.guessed_account_id = item.matchedAccountId
        row.guessed_category_id = item.categoryId

        if not item.matchedAccountId:
            row.confirm_status = "skipped"
            row.error_message = "缺少账户，无法导入"
            skipped_rows += 1
            warnings.append(f"{item.tempId} 缺少账户，已跳过")
            continue

        if not item.categoryId:
            row.confirm_status = "skipped"
            row.error_message = "缺少类别，无法导入"
            skipped_rows += 1
            warnings.append(f"{item.tempId} 缺少类别，已跳过")
            continue

        business_key = _build_business_key(item, bill_type, book.id)
        txn_data = TransactionCreate(
            occurred_at=item.billDate,
            transaction_type=_direction_to_type(item.direction),
            direction=item.direction,
            amount=item.amount,
            account_id=item.matchedAccountId,
            category_id=item.categoryId,
            merchant=item.counterparty,
            note=item.itemDesc,
            external_ref=item.merchantOrderNo or item.orderNo,
            source_type=SourceType.IMPORT,
            source_batch_id=parse_id,
            source_row_no=row.row_no,
            tags=json.dumps(item.tags, ensure_ascii=False) if item.tags else None,
            business_key=business_key,
        )

        try:
            create_transaction(db, book.id, txn_data)
            row.confirm_status = "confirmed"
            row.error_message = None
            imported_rows += 1
        except IdempotencyException:
            row.confirm_status = "skipped"
            row.error_message = "重复交易"
            duplicate_rows += 1
        except Exception as exc:  # noqa: BLE001
            row.confirm_status = "skipped"
            row.error_message = str(exc)
            error_rows += 1
            warnings.append(f"{item.tempId} 导入失败: {exc}")

    batch.confirmed_rows = imported_rows
    batch.skipped_rows = skipped_rows + duplicate_rows + error_rows
    batch.duplicate_rows = duplicate_rows
    batch.status = ImportStatus.CONFIRMED.value if imported_rows > 0 else ImportStatus.FAILED.value
    db.commit()

    return ConfirmImportResponse(
        parseId=parse_id,
        totalItems=len(confirmed_items),
        importedRows=imported_rows,
        duplicateRows=duplicate_rows,
        skippedRows=skipped_rows,
        errorRows=error_rows,
        warnings=warnings[:100],
    )


def import_bill_file(
    db: Session,
    user_id: str,
    bill_type: str,
    content: bytes,
    account_id: Optional[str] = None,
) -> Dict:
    parse_result = parse_bill_file(
        db=db,
        user_id=user_id,
        bill_type=bill_type,
        filename=f"{bill_type}-legacy.csv",
        content=content,
    )
    items = parse_result.items

    if account_id:
        for item in items:
            item.matchedAccountId = account_id
            item.accountMatchStatus = "MATCHED"

    confirm_result = confirm_import(
        db=db,
        user_id=user_id,
        parse_id=parse_result.parseId,
        confirmed_items=items,
    )

    return BillImportResponse(
        bill_type=bill_type,
        total_rows=len(items),
        parsed_rows=len(items),
        imported_rows=confirm_result.importedRows,
        duplicate_rows=confirm_result.duplicateRows,
        skipped_rows=confirm_result.skippedRows,
        error_rows=confirm_result.errorRows,
        message=f"解析{len(items)}条，导入{confirm_result.importedRows}条",
        preview=[],
        warnings=confirm_result.warnings,
    ).model_dump()
