from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from src.core import get_db
from src.core.auth import get_current_user
from src.core.logger import log_audit, log_business
from src.modules.auth.models import User

from .schemas import (
    TransactionCreate, TransactionResponse, TransactionUpdate,
    TransferCreate, CreditCardRepaymentCreate, RefundCreate, TransactionFilter, TransactionSummary,
    TransferEditResponse,
)
from .service import (
    create_transaction, create_transfer, create_credit_card_repayment, create_refund,
    get_transactions, get_transaction, update_transaction, delete_transaction,
    get_transfer_edit_context, update_transfer,
    adjust_account_balance
)
from src.modules.books.service import get_default_book
from src.common.enums import TransactionType, TransactionDirection

router = APIRouter(prefix="/transactions", tags=["transactions"])


# Balance adjustment schema
class BalanceAdjustCreate(BaseModel):
    book_id: str
    account_id: str
    target_value: Decimal  # 目标值（余额或可用额度）
    adjust_mode: str = "balance"  # "balance" | "available_credit"
    note: str = ""  # 调整原因（必填）
    is_counted_in_reports: bool = False  # 是否计入收支报表


def get_current_book_id(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
) -> str:
    """Get current book ID from user or parameter"""
    if book_id:
        return book_id
    default_book = get_default_book(db, current_user.id)
    if not default_book:
        raise HTTPException(status_code=400, detail="未找到默认账本，请先初始化")
    return default_book.id


@router.post("", response_model=TransactionResponse)
def create(
    data: TransactionCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create new transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    result = create_transaction(db, bid, data)
    
    # 记录审计日志
    log_audit(
        action="create_transaction",
        user_id=current_user.id,
        resource_type="transaction",
        resource_id=result.id,
        details={
            "amount": str(result.amount),
            "direction": result.direction.value if hasattr(result.direction, 'value') else str(result.direction),
            "merchant": result.merchant,
        },
    )
    
    return result


@router.post("/transfer", response_model=List[TransactionResponse])
def transfer(
    data: TransferCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create transfer between two accounts"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_transfer(db, bid, data)


@router.get("/transfer/{transaction_id}/edit", response_model=TransferEditResponse)
def transfer_edit_context(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get normalized edit payload for a transfer transaction."""
    bid = get_current_book_id(current_user, db, book_id)
    return get_transfer_edit_context(db, transaction_id, bid)


@router.put("/transfer/{transaction_id}", response_model=List[TransactionResponse])
def update_transfer_route(
    transaction_id: str,
    data: TransferCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Replace a transfer batch using the transfer form payload."""
    bid = get_current_book_id(current_user, db, book_id)
    return update_transfer(db, transaction_id, bid, data)


@router.post("/repayment/credit-card", response_model=TransactionResponse)
def credit_card_repayment(
    data: CreditCardRepaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create credit card repayment"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_credit_card_repayment(db, bid, data)


@router.post("/refund", response_model=TransactionResponse)
def refund(
    data: RefundCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create refund transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_refund(db, bid, data)


@router.post("/adjust", response_model=TransactionResponse)
def adjust_balance(
    data: BalanceAdjustCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Adjust account balance or available credit (create adjustment transaction)"""
    # 验证 adjust_mode
    if data.adjust_mode not in ["balance", "available_credit"]:
        raise HTTPException(status_code=400, detail="adjust_mode must be 'balance' or 'available_credit'")

    current_book_id = get_current_book_id(current_user, db)
    if current_book_id != data.book_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return adjust_account_balance(
        db=db,
        book_id=data.book_id,
        account_id=data.account_id,
        target_value=data.target_value,
        adjust_mode=data.adjust_mode,
        note=data.note,
        is_counted_in_reports=data.is_counted_in_reports
    )


@router.get("", response_model=TransactionSummary)
def list_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    year: int = None,
    month: int = None,
    date_from: str = None,
    date_to: str = None,
    account_id: str = None,
    category_id: str = None,
    transaction_type: str = None,
    status: str = None,
    keyword: str = None,
    tag: str = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    include_hidden: bool = False  # 🛡️ L: 是否包含隐身账单
):
    """Get transactions with filters"""
    from datetime import datetime, timedelta

    bid = get_current_book_id(current_user, db, book_id)

    # 处理日期：如果只有日期（没有时间），自动调整为完整日期范围
    dt_from = None
    dt_to = None
    
    # 如果指定了 year 和 month，优先使用它们计算日期范围
    if year and month:
        dt_from = datetime(year, month, 1)
        # 获取该月的最后一天
        if month == 12:
            dt_to = datetime(year + 1, 1, 1) - timedelta(seconds=1)
        else:
            dt_to = datetime(year, month + 1, 1) - timedelta(seconds=1)
    elif year:
        # 只指定年份，则查询整年
        dt_from = datetime(year, 1, 1)
        dt_to = datetime(year, 12, 31, 23, 59, 59)
    else:
        # 使用手动指定的日期范围
        if date_from:
            dt_from = datetime.fromisoformat(date_from)
            if len(date_from) <= 10:
                dt_from = dt_from.replace(hour=0, minute=0, second=0)
        
        if date_to:
            dt_to = datetime.fromisoformat(date_to)
            if len(date_to) <= 10:
                dt_to = dt_to.replace(hour=23, minute=59, second=59)

    filters = {
        "date_from": dt_from,
        "date_to": dt_to,
        "account_id": account_id,
        "category_id": category_id,
        "transaction_type": transaction_type,
        "status": status,
        "keyword": keyword,
        "tag": tag,
        "page": page,
        "page_size": page_size,
        "include_hidden": include_hidden  # 🛡️ L: 传递隐身账单过滤
    }

    items, total = get_transactions(db, bid, filters)

    return TransactionSummary(
        total_count=total,
        total_amount=sum(i.amount for i in items),
        page=page,
        page_size=page_size,
        items=items
    )


@router.get("/year-range")
def get_year_range(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get the year range (min year and max year) for transactions"""
    bid = get_current_book_id(current_user, db, book_id)
    
    # 使用原始 SQL 查询以避免 SQLAlchemy 函数兼容性问题
    from sqlalchemy import text
    
    result = db.execute(text("""
        SELECT MIN(CAST(STRFTIME('%Y', occurred_at) AS TEXT)), 
               MAX(CAST(STRFTIME('%Y', occurred_at) AS TEXT))
        FROM transactions 
        WHERE book_id = :book_id AND status != 'void' AND occurred_at IS NOT NULL
    """), {"book_id": bid}).fetchone()
    
    return {
        "min_year": int(result[0]) if result[0] else None,
        "max_year": int(result[1]) if result[1] else None
    }


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get(
    transaction_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get transaction by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    txn = get_transaction(db, transaction_id, bid)
    if not txn:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update(
    transaction_id: str, 
    data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_transaction(db, transaction_id, bid, data)


@router.put("/{transaction_id}", response_model=TransactionResponse)
def replace(
    transaction_id: str,
    data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update transaction with PUT for form reuse."""
    bid = get_current_book_id(current_user, db, book_id)
    return update_transaction(db, transaction_id, bid, data)


@router.delete("/{transaction_id}")
def delete(
    transaction_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Delete (void) transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    delete_transaction(db, transaction_id, bid)
    return {"message": "Transaction voided"}
