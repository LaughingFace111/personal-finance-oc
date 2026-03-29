from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import AccountCreate, AccountResponse, AccountUpdate
from .service import create_account, delete_account, get_account, get_accounts, update_account, calculate_credit_statement_info
from .rebuild import rebuild_account_balance, rebuild_book_accounts
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/accounts", tags=["accounts"])


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
        from src.modules.books.service import create_book
        default_book = create_book(db, current_user.id, {"name": "默认账本"})
    return default_book.id


# 🛡️ L: 重要 - 静态路由必须放在动态路由 {account_id} 之前，否则会被劫持！
@router.get("/credit-repayment-summary")
def get_credit_repayment_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """获取所有信用账户的待还摘要（用于首页展示）"""
    from .service import get_credit_accounts_repayment_summary
    bid = get_current_book_id(current_user, db, book_id)
    return get_credit_accounts_repayment_summary(db, bid)


@router.post("", response_model=AccountResponse)
def create(
    data: AccountCreate, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Create new account"""
    bid = get_current_book_id(current_user, db, book_id)
    return create_account(db, bid, data)


@router.get("", response_model=List[AccountResponse])
def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None,
    include_inactive: bool = False
):
    """Get all accounts"""
    bid = get_current_book_id(current_user, db, book_id)
    accounts = get_accounts(db, bid, include_inactive)
    
    # 🛡️ L: 为每个信用账户计算本期待还信息
    result = []
    for acc in accounts:
        statement_info = calculate_credit_statement_info(db, acc)
        acc_dict = {
            **acc.__dict__,
            'current_statement_balance': statement_info['current_statement_balance'],
            'next_repayment_date': statement_info['next_repayment_date'],
            'days_until_repayment': statement_info['days_until_repayment']
        }
        result.append(acc_dict)
    
    return result


@router.get("/{account_id}", response_model=AccountResponse)
def get(
    account_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Get account by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    account = get_account(db, account_id, bid)
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    
    # 🛡️ L: 计算本期待还信息
    statement_info = calculate_credit_statement_info(db, account)
    return {
        **account.__dict__,
        'current_statement_balance': statement_info['current_statement_balance'],
        'next_repayment_date': statement_info['next_repayment_date'],
        'days_until_repayment': statement_info['days_until_repayment']
    }


@router.patch("/{account_id}", response_model=AccountResponse)
def update(
    account_id: str, 
    data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Update account"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_account(db, account_id, bid, data)


@router.delete("/{account_id}")
def delete(
    account_id: str, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Delete (deactivate) account"""
    bid = get_current_book_id(current_user, db, book_id)
    delete_account(db, account_id, bid)
    return {"message": "Account deleted"}


@router.post("/rebuild/{account_id}")
def rebuild_single(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rebuild single account balance"""
    result = rebuild_account_balance(db, account_id)
    return result


@router.post("/rebuild")
def rebuild_book(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """Rebuild all accounts in the book"""
    bid = get_current_book_id(current_user, db, book_id)
    results = rebuild_book_accounts(db, bid)
    return {"book_id": bid, "accounts": results}


@router.get("/{account_id}/balance-trend")
def get_balance_trend(
    account_id: str, 
    start_date: str = None,
    end_date: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """
    获取账户余额每日趋势数据
    使用窗口函数计算 Running Total，避免内存级累加
    """
    from datetime import datetime, date, timedelta
    from decimal import Decimal
    from src.modules.accounts.service import get_account
    
    # 获取账本
    bid = get_current_book_id(current_user, db, book_id)
    
    # 获取账户信息，用于判断账户类型
    account = get_account(db, account_id, bid)
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    
    # 确定日期范围：默认最近90天
    if end_date:
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    else:
        end_dt = datetime.utcnow()
    
    if start_date:
        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    else:
        start_dt = end_dt - timedelta(days=90)
    
    end_date_str = end_dt.strftime('%Y-%m-%d')
    start_date_str = start_dt.strftime('%Y-%m-%d')
    
    # 判断账户类型
    is_credit = account.account_type in ['credit_card', 'credit_line']
    is_loan = account.account_type == 'loan'
    
    # 获取初始余额
    opening_balance = Decimal(str(account.opening_balance or 0))
    
    # 🛡️ L: 使用原生 SQL + 窗口函数 (Running Total) 进行高效聚合
    # 这样避免了将所有交易拉到内存中计算的问题
    sql = f"""
    WITH daily_changes AS (
        SELECT 
            date(occurred_at) as txn_date,
            SUM(
                CASE 
                    WHEN direction = 'in' THEN amount
                    WHEN direction = 'out' THEN -amount
                    ELSE 0
                END
            ) as daily_change
        FROM transactions
        WHERE account_id = :account_id
          AND occurred_at >= :start_dt
          AND occurred_at <= :end_dt
          AND status = 'confirmed'
        GROUP BY date(occurred_at)
    ),
    running_total AS (
        SELECT 
            txn_date,
            daily_change,
            SUM(daily_change) OVER (ORDER BY txn_date ROWS UNBOUNDED PRECEDING) as running_sum
        FROM daily_changes
    )
    SELECT 
        txn_date,
        :opening_balance + running_sum as balance
    FROM running_total
    ORDER BY txn_date
    """
    
    result = db.execute(
        text(sql),
        {
            'account_id': account_id,
            'start_dt': start_dt,
            'end_dt': end_dt,
            'opening_balance': float(opening_balance)
        }
    )
    
    # 构建数据点列表
    data_points = []
    last_balance = opening_balance
    
    for row in result:
        txn_date = row[0]  # date object
        balance = Decimal(str(row[1]))
        
        # 对于信用账户，将欠款转为负向净值
        if is_credit:
            # 可用额度 = 信用额度 - 欠款，转为净值需要取负
            credit_limit = Decimal(str(account.credit_limit or 0))
            debt = Decimal(str(account.debt_amount or 0))
            # 净值 = -(debt - 初始欠款) + (当天余额变化)
            # 简化处理：直接取余额的负值表示负债状态
            balance = -balance
        elif is_loan:
            balance = -balance  # 贷款余额取负表示负债
        
        data_points.append({
            'date': txn_date.isoformat() if hasattr(txn_date, 'isoformat') else str(txn_date),
            'balance': float(balance)
        })
        last_balance = balance
    
    # 🛡️ L: 如果没有交易数据但账户有余额，也返回初始点
    if not data_points and opening_balance > 0:
        is_positive = not is_credit and not is_loan
        data_points.append({
            'date': start_date_str,
            'balance': float(-opening_balance) if (is_credit or is_loan) else float(opening_balance)
        })
    
    return data_points
