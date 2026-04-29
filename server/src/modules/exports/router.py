import csv
import json
from datetime import datetime
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.modules.books.service import get_book, get_default_book
from src.modules.transactions.service import get_transactions_for_export

router = APIRouter(prefix="/export", tags=["export"])


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
) -> str:
    if book_id:
        book = get_book(db, book_id, current_user.id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        return book.id

    default_book = get_default_book(db, current_user.id)
    if not default_book:
        raise HTTPException(status_code=400, detail="未找到默认账本，请先初始化")
    return default_book.id


def _parse_date_param(value: str | None, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None

    parsed = datetime.fromisoformat(value)
    if len(value) <= 10:
        if end_of_day:
            return parsed.replace(hour=23, minute=59, second=59)
        return parsed.replace(hour=0, minute=0, second=0)
    return parsed


def _format_tags(raw_tags) -> str:
    if not raw_tags:
        return ""

    parsed = raw_tags
    if isinstance(raw_tags, str):
        try:
            parsed = json.loads(raw_tags)
        except json.JSONDecodeError:
            return raw_tags

    if not isinstance(parsed, list):
        return str(parsed)

    names: list[str] = []
    for item in parsed:
        if isinstance(item, str):
            if item.strip():
                names.append(item.strip())
            continue
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            if name:
                names.append(name)

    return ", ".join(names)


def _refund_status_label(transaction) -> str:
    if transaction.transaction_type == "refund":
        return "refund_record"
    if getattr(transaction, "is_fully_refunded", False):
        return "fully_refunded"
    if getattr(transaction, "is_partially_refunded", False):
        return "partially_refunded"
    if getattr(transaction, "has_refund", False):
        return "partially_refunded"
    if transaction.transaction_type == "expense":
        return "not_refunded"
    return ""


@router.get("/transactions")
def export_transactions(
    account_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str | None = None,
):
    current_book_id = get_current_book_id(current_user, db, book_id)
    transactions = get_transactions_for_export(
        db,
        current_book_id,
        {
            "account_id": account_id,
            "date_from": _parse_date_param(start_date),
            "date_to": _parse_date_param(end_date, end_of_day=True),
            "include_hidden": False,
        },
    )

    buffer = StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=[
            "id",
            "date",
            "amount",
            "currency",
            "type",
            "direction",
            "category",
            "account",
            "merchant",
            "note",
            "tags",
            "refund_status",
            "refunded_amount",
            "remaining_refundable_amount",
            "created_at",
        ],
    )
    writer.writeheader()

    for transaction in transactions:
        writer.writerow(
            {
                "id": transaction.id,
                "date": transaction.occurred_at.isoformat(),
                "amount": str(transaction.amount),
                "currency": transaction.currency,
                "type": transaction.transaction_type,
                "direction": transaction.direction,
                "category": transaction.category.name if transaction.category else "",
                "account": transaction.account.name if transaction.account else "",
                "merchant": transaction.merchant or "",
                "note": transaction.note or "",
                "tags": _format_tags(transaction.tags),
                "refund_status": _refund_status_label(transaction),
                "refunded_amount": str(getattr(transaction, "refunded_amount", "")),
                "remaining_refundable_amount": str(getattr(transaction, "remaining_refundable_amount", "")),
                "created_at": transaction.created_at.isoformat() if transaction.created_at else "",
            }
        )

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"transactions-export-{timestamp}.csv"
    csv_content = "\ufeff" + buffer.getvalue()
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=csv_content, media_type="text/csv; charset=utf-8", headers=headers)
