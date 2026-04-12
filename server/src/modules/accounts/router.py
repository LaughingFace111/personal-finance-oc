from typing import List
from decimal import Decimal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User
from src.core import AppException, ErrorCode, NotFoundException

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
    获取账户每日收盘趋势数据。

    - 资产账户: 每日收盘余额
    - 信用账户: 每日收盘可用额度 = credit_limit - debt_amount - frozen_amount
    - 贷款账户: 每日收盘剩余本金 / 负债

    返回区间内每一天的数据；无交易日沿用上一日收盘值。
    """
    from datetime import datetime, time, timedelta
    from src.modules.accounts.service import get_account

    def _parse_boundary(raw_value: str | None, *, is_end: bool) -> datetime:
        if not raw_value:
            return datetime.now(timezone.utc)

        normalized = raw_value.replace('Z', '+00:00')
        parsed = datetime.fromisoformat(normalized)
        is_date_only = 'T' not in raw_value and ' ' not in raw_value
        if not is_date_only:
            return parsed

        boundary_time = time.max if is_end else time.min
        return datetime.combine(parsed.date(), boundary_time, tzinfo=parsed.tzinfo)

    def _load_daily_changes(change_case_sql: str, start_dt: datetime, end_dt: datetime) -> tuple[Decimal, dict[str, Decimal]]:
        params = {
            'account_id': account_id,
            'start_dt': start_dt,
            'end_dt': end_dt,
        }

        change_after_end = Decimal(str(
            db.execute(
                text(f"""
                    SELECT COALESCE(SUM({change_case_sql}), 0)
                    FROM transactions
                    WHERE status = 'confirmed'
                      AND occurred_at > :end_dt
                      AND (
                            account_id = :account_id
                         OR counterparty_account_id = :account_id
                      )
                """),
                params,
            ).scalar() or 0
        ))

        rows = db.execute(
            text(f"""
                SELECT
                    date(occurred_at) AS txn_date,
                    COALESCE(SUM({change_case_sql}), 0) AS daily_change
                FROM transactions
                WHERE status = 'confirmed'
                  AND occurred_at >= :start_dt
                  AND occurred_at <= :end_dt
                  AND (
                        account_id = :account_id
                     OR counterparty_account_id = :account_id
                  )
                GROUP BY date(occurred_at)
                ORDER BY date(occurred_at)
            """),
            params,
        ).all()

        changes_by_day: dict[str, Decimal] = {}
        for txn_date, daily_change in rows:
            key = txn_date.isoformat() if hasattr(txn_date, 'isoformat') else str(txn_date)
            changes_by_day[key] = Decimal(str(daily_change or 0))

        return change_after_end, changes_by_day
    
    # 获取账本
    bid = get_current_book_id(current_user, db, book_id)
    
    # 获取账户信息
    account = get_account(db, account_id, bid)
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Account not found")
    
    # 确定日期范围
    end_dt = _parse_boundary(end_date, is_end=True)
    if start_date:
        start_dt = _parse_boundary(start_date, is_end=False)
    else:
        start_dt = datetime.combine((end_dt - timedelta(days=90)).date(), time.min, tzinfo=end_dt.tzinfo)

    if start_dt > end_dt:
        raise AppException(
            status_code=400,
            code=ErrorCode.INVALID_PARAMS,
            message="start_date must be earlier than or equal to end_date",
        )
    
    # 判断账户类型
    is_credit = account.account_type in ['credit_card', 'credit_line']
    is_loan = account.account_type == 'loan'
    
    # 获取账户基础数据
    credit_limit = Decimal(str(account.credit_limit or 0))
    opening_balance = Decimal(str(account.opening_balance or 0))
    current_debt = Decimal(str(account.debt_amount or 0))
    frozen_amount = Decimal(str(account.frozen_amount or 0))

    if is_loan:
        loan_principal_remaining = db.execute(
            text("""
                SELECT COALESCE(SUM(principal_remaining), 0)
                FROM loan_plans
                WHERE account_id = :account_id
            """),
            {'account_id': account_id},
        ).scalar()
        current_debt = Decimal(str(
            loan_principal_remaining if loan_principal_remaining is not None else account.debt_amount or 0
        ))

    if is_credit:
        metric_change_case = """
            CASE
                WHEN account_id = :account_id
                  AND transaction_type IN ('expense', 'installment_purchase')
                  THEN amount
                WHEN account_id = :account_id
                  AND transaction_type = 'refund'
                  THEN -amount
                WHEN account_id = :account_id
                  AND transaction_type = 'transfer'
                  AND direction = 'out'
                  THEN amount
                WHEN account_id = :account_id
                  AND transaction_type = 'transfer'
                  AND direction = 'in'
                  THEN -amount
                WHEN counterparty_account_id = :account_id
                  AND transaction_type = 'repayment_credit_card'
                  THEN -amount
                WHEN counterparty_account_id = :account_id
                  AND transaction_type = 'transfer'
                  AND related_transaction_id IS NULL
                  THEN -amount
                ELSE 0
            END
        """

        change_after_end, changes_by_day = _load_daily_changes(metric_change_case, start_dt, end_dt)
        metric_at_end = current_debt - change_after_end
        opening_metric = metric_at_end - sum(changes_by_day.values(), Decimal("0"))
    else:
        if is_loan:
            metric_change_case = """
                CASE
                    WHEN account_id = :account_id
                      AND transaction_type = 'transfer'
                      AND direction = 'out'
                      THEN amount
                    WHEN account_id = :account_id
                      AND transaction_type = 'transfer'
                      AND direction = 'in'
                      THEN -amount
                    WHEN counterparty_account_id = :account_id
                      AND transaction_type = 'repayment_loan'
                      THEN -amount
                    WHEN counterparty_account_id = :account_id
                      AND transaction_type = 'transfer'
                      AND related_transaction_id IS NULL
                      THEN -amount
                    ELSE 0
                END
            """
            current_metric = current_debt
        else:
            metric_change_case = """
                CASE
                    WHEN account_id = :account_id
                      AND transaction_type = 'income'
                      THEN amount
                    WHEN account_id = :account_id
                      AND transaction_type IN (
                          'expense',
                          'fee',
                          'repayment_credit_card',
                          'repayment_loan',
                          'debt_lend',
                          'debt_pay_back'
                      )
                      THEN -amount
                    WHEN account_id = :account_id
                      AND transaction_type IN (
                          'refund',
                          'debt_borrow',
                          'debt_receive_back'
                      )
                      THEN amount
                    WHEN account_id = :account_id
                      AND transaction_type = 'transfer'
                      AND direction = 'out'
                      THEN -amount
                    WHEN account_id = :account_id
                      AND transaction_type = 'transfer'
                      AND direction = 'in'
                      THEN amount
                    WHEN counterparty_account_id = :account_id
                      AND transaction_type = 'transfer'
                      AND related_transaction_id IS NULL
                      THEN amount
                    ELSE 0
                END
            """
            current_metric = Decimal(str(account.current_balance or opening_balance or 0))

        change_after_end, changes_by_day = _load_daily_changes(metric_change_case, start_dt, end_dt)
        metric_at_end = current_metric - change_after_end
        opening_metric = metric_at_end - sum(changes_by_day.values(), Decimal("0"))

    data_points = []
    running_metric = opening_metric
    current_day = start_dt.date()
    end_day = end_dt.date()

    while current_day <= end_day:
        day_key = current_day.isoformat()
        running_metric += changes_by_day.get(day_key, Decimal("0"))

        if is_credit:
            display_value = credit_limit - running_metric - frozen_amount
        else:
            display_value = running_metric

        data_points.append({
            'date': day_key,
            'balance': float(display_value),
        })
        current_day += timedelta(days=1)

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
