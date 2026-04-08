from typing import List
from decimal import Decimal
from datetime import datetime, timezone

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


# WARNING: Static routes must remain above dynamic routes like /{account_id}.
# Reordering these routes can change matching behavior and break this endpoint.
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


@router.get("")
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
        # 显式转换 Decimal 字段，避免 None 导致序列化失败
        acc_dict = {
            'id': acc.id,
            'book_id': acc.book_id,
            'name': acc.name,
            'account_type': acc.account_type,
            'institution_name': acc.institution_name,
            'card_last4': acc.card_last4,
            'credit_limit': acc.credit_limit if acc.credit_limit is not None else Decimal("0"),
            'billing_day': acc.billing_day,
            'billing_day_rule': acc.billing_day_rule,
            'repayment_day': acc.repayment_day,
            'opening_balance': acc.opening_balance if acc.opening_balance is not None else Decimal("0"),
            'current_balance': acc.current_balance if acc.current_balance is not None else Decimal("0"),
            'debt_amount': acc.debt_amount if acc.debt_amount is not None else Decimal("0"),
            'frozen_amount': acc.frozen_amount if acc.frozen_amount is not None else Decimal("0"),
            'currency': acc.currency,
            'note': acc.note,
            'is_active': acc.is_active,
            'is_deleted': acc.is_deleted,
            'created_at': acc.created_at,
            'updated_at': acc.updated_at,
            'current_statement_balance': statement_info['current_statement_balance'],
            'repayment_date': statement_info['next_repayment_date'],
            'days_until_repayment': statement_info['days_until_repayment'],
            'is_overdue': statement_info['is_overdue']
        }
        result.append(acc_dict)
    
    return result


@router.get("/{account_id}")
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
        'id': account.id,
        'book_id': account.book_id,
        'name': account.name,
        'account_type': account.account_type,
        'institution_name': account.institution_name,
        'card_last4': account.card_last4,
        'credit_limit': account.credit_limit if account.credit_limit is not None else Decimal("0"),
        'billing_day': account.billing_day,
        'billing_day_rule': account.billing_day_rule,
        'repayment_day': account.repayment_day,
        'opening_balance': account.opening_balance if account.opening_balance is not None else Decimal("0"),
        'current_balance': account.current_balance if account.current_balance is not None else Decimal("0"),
        'debt_amount': account.debt_amount if account.debt_amount is not None else Decimal("0"),
        'frozen_amount': account.frozen_amount if account.frozen_amount is not None else Decimal("0"),
        'currency': account.currency,
        'note': account.note,
        'is_active': account.is_active,
        'is_deleted': account.is_deleted,
        'created_at': account.created_at,
        'updated_at': account.updated_at,
        'current_statement_balance': statement_info['current_statement_balance'],
        'repayment_date': statement_info['next_repayment_date'],
        'days_until_repayment': statement_info['days_until_repayment'],
        'is_overdue': statement_info['is_overdue']
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
    🛡️ L: 获取账户可用额度每日趋势数据
    
    对于信用账户：
    - 每日可用额度 = Credit_Limit - 当日累计欠款 - 冻结金额
    - 使用当前信用额度减去每天的运行欠款（Running Debt）
    
    对于资产账户：
    - 每日余额 = Opening_Balance + 运行支出/收入
    """
    from datetime import datetime, date, timedelta
    from decimal import Decimal
    from src.modules.accounts.service import get_account
    
    # 获取账本
    bid = get_current_book_id(current_user, db, book_id)
    
    # 获取账户信息
    account = get_account(db, account_id, bid)
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    
    # 确定日期范围
    if end_date:
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    else:
        end_dt = datetime.now(timezone.utc)
    
    if start_date:
        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    else:
        start_dt = end_dt - timedelta(days=90)
    
    start_date_str = start_dt.strftime('%Y-%m-%d')
    end_date_str = end_dt.strftime('%Y-%m-%d')
    
    # 判断账户类型
    is_credit = account.account_type in ['credit_card', 'credit_line']
    is_loan = account.account_type == 'loan'
    
    # 获取账户基础数据
    credit_limit = Decimal(str(account.credit_limit or 0))
    opening_balance = Decimal(str(account.opening_balance or 0))
    current_debt = Decimal(str(account.debt_amount or 0))
    frozen_amount = Decimal(str(account.frozen_amount or 0))
    
    data_points = []
    
    if is_credit:
        # 🛡️ L: 信用账户 - 计算每日可用额度
        # 算法：对于每一天，使用窗口函数计算累计欠款变化，然后：
        # Available_Credit = Credit_Limit - Running_Debt - Frozen_Amount
        
        # 信用账户的初始欠款（opening_balance 存储为 debt_amount）
        initial_debt = opening_balance
        
        # 使用 SQL 窗口函数计算每天的运行欠款
        sql = """
        WITH daily_changes AS (
            SELECT 
                date(occurred_at) as txn_date,
                SUM(
                    CASE 
                        WHEN direction = 'out' THEN amount
                        WHEN direction = 'in' THEN -amount
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
        running_debt AS (
            SELECT 
                txn_date,
                daily_change,
                SUM(daily_change) OVER (ORDER BY txn_date ROWS UNBOUNDED PRECEDING) as running_debt_change
            FROM daily_changes
        )
        SELECT 
            txn_date,
            :initial_debt + COALESCE(running_debt_change, 0) as daily_debt
        FROM running_debt
        ORDER BY txn_date
        """
        
        result = db.execute(
            text(sql),
            {
                'account_id': account_id,
                'start_dt': start_dt,
                'end_dt': end_dt,
                'initial_debt': float(initial_debt)
            }
        )
        
        for row in result:
            txn_date = row[0]
            daily_debt = Decimal(str(row[1]))
            
            # 🛡️ L: 可用额度 = 信用额度 - 欠款 - 冻结金额
            # 这是用户真正可以使用的额度
            available_credit = credit_limit - daily_debt - frozen_amount
            
            data_points.append({
                'date': txn_date.isoformat() if hasattr(txn_date, 'isoformat') else str(txn_date),
                'balance': float(available_credit)
            })
        
        # 如果没有交易数据，返回当前可用额度作为起点
        if not data_points:
            available_credit = credit_limit - current_debt - frozen_amount
            data_points.append({
                'date': start_date_str,
                'balance': float(available_credit)
            })
    
    else:
        # 🛡️ L: 资产账户/贷款账户 - 保持原有逻辑
        opening = opening_balance if not is_loan else Decimal("0")
        
        sql = """
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
            :opening_balance + COALESCE(running_sum, 0) as balance
        FROM running_total
        ORDER BY txn_date
        """
        
        result = db.execute(
            text(sql),
            {
                'account_id': account_id,
                'start_dt': start_dt,
                'end_dt': end_dt,
                'opening_balance': float(opening)
            }
        )
        
        for row in result:
            txn_date = row[0]
            balance = Decimal(str(row[1]))
            
            # 贷款账户余额取负
            if is_loan:
                balance = -balance
            
            data_points.append({
                'date': txn_date.isoformat() if hasattr(txn_date, 'isoformat') else str(txn_date),
                'balance': float(balance)
            })
        
        if not data_points and opening > 0:
            data_points.append({
                'date': start_date_str,
                'balance': float(-opening if is_loan else opening)
            })
    
    return data_points


@router.post("/{account_id}/adjust-limit", response_model=AccountResponse)
def adjust_credit_limit(
    account_id: str,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    book_id: str = None
):
    """
    🛡️ L: 调整信用账户总额度（不生成交易流水）
    
    纯粹的额度调整，只修改 credit_limit 字段：
    - Available_Credit = Credit_Limit - Debt_Amount - Frozen_Amount
    - 绝对不生成任何 Transaction 流水
    """
    from decimal import Decimal
    from src.modules.accounts.service import get_account
    
    new_limit = data.get("new_limit")
    if not new_limit:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="new_limit is required")
    
    bid = get_current_book_id(current_user, db, book_id)
    account = get_account(db, account_id, bid)
    
    if not account:
        raise NotFoundException("Account not found")
    
    # 只能是信用类账户
    if account.account_type not in ["credit_card", "credit_line"]:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS,
                          message="只有信用卡/信用账户才能调整额度")
    
    # 纯粹的额度修改 - 不生成任何交易流水
    account.credit_limit = Decimal(str(new_limit))
    db.commit()
    db.refresh(account)
    
    # 返回完整的账户信息（包含计算字段）
    statement_info = calculate_credit_statement_info(db, account)
    return {
        **account.__dict__,
        'current_statement_balance': statement_info['current_statement_balance'],
        'next_repayment_date': statement_info['next_repayment_date'],
        'days_until_repayment': statement_info['days_until_repayment']
    }
