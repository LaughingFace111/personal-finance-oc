from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db
from src.core.auth import get_current_user
from src.modules.auth.models import User

from .schemas import (
    CreateInstallmentRequest, InstallmentPlanResponse, InstallmentPlanUpdate,
    InstallmentScheduleResponse
)
from .service import (
    create_installment_with_transaction, get_installment_plans, get_installment_plan,
    get_installment_schedules, get_upcoming_installments, update_installment_plan, settle_installment,
    delete_installment_plan, revert_installment_period
)
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/installments", tags=["installments"])


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
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No default book found")
    return default_book.id


@router.post("", response_model=InstallmentPlanResponse)
def create(
    data: CreateInstallmentRequest, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Create installment with purchase transaction"""
    bid = get_current_book_id(current_user, db, book_id)
    plan, _ = create_installment_with_transaction(db, bid, data)
    return plan


@router.get("", response_model=List[InstallmentPlanResponse])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None,
    account_id: str = None,
    status: str = None
):
    """Get installment plans"""
    bid = get_current_book_id(current_user, db, book_id)
    plans = get_installment_plans(db, bid, account_id, status)
    # 🛡️ L: 注入 account_name 以便前端卡片展示关联账户
    if plans:
        from src.modules.accounts.models import Account
        account_ids = list({p.account_id for p in plans})
        accounts = db.query(Account.id, Account.name).filter(Account.id.in_(account_ids)).all()
        name_map = {a.id: a.name for a in accounts}
        for plan in plans:
            plan.account_name = name_map.get(plan.account_id)
    return plans


@router.get("/upcoming", response_model=List[InstallmentScheduleResponse])
def list_upcoming(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    book_id: str = None, 
    days: int = 30
):
    """Get upcoming installment payments"""
    bid = get_current_book_id(current_user, db, book_id)
    return get_upcoming_installments(db, bid, days)


@router.get("/{plan_id}", response_model=InstallmentPlanResponse)
def get_plan(
    plan_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Get installment plan by ID"""
    bid = get_current_book_id(current_user, db, book_id)
    plan = get_installment_plan(db, plan_id, bid)
    if not plan:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Installment plan not found")
    return plan


@router.get("/{plan_id}/schedules", response_model=List[InstallmentScheduleResponse])
def list_schedules(plan_id: str, db: Session = Depends(get_db)):
    """Get installment schedules"""
    return get_installment_schedules(db, plan_id)


@router.patch("/{plan_id}", response_model=InstallmentPlanResponse)
def update_plan(
    plan_id: str, 
    data: InstallmentPlanUpdate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Update installment plan"""
    bid = get_current_book_id(current_user, db, book_id)
    return update_installment_plan(db, plan_id, bid, data)


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    bid = get_current_book_id(current_user, db, book_id)
    delete_installment_plan(db, plan_id, bid)
    return {"ok": True}


@router.post("/{plan_id}/settle")
def settle(
    plan_id: str, 
    account_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """Settle next installment payment"""
    bid = get_current_book_id(current_user, db, book_id)
    from datetime import datetime
    schedule, transaction = settle_installment(db, plan_id, bid, account_id, datetime.utcnow())
    return {"schedule": schedule, "transaction": transaction}


# 🛡️ L: 执行单期分期扣款接口
@router.post("/{plan_id}/execute")
def execute_period(
    plan_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    """
    执行单期分期扣款
    
    步骤：
    1. 校验剩余期数
    2. 创建单期 Transaction 交易记录
    3. 减少对应账户的 frozen_amount
    4. 推算下一个执行日期（处理跨月问题）
    5. 更新计划状态
    """
    from .service import execute_installment_period
    
    bid = get_current_book_id(current_user, db, book_id)
    result = execute_installment_period(db, plan_id, bid)
    
    return {
        "plan_id": plan_id,
        "executed_period": result["plan"].executed_periods,
        "remaining_periods": result["plan"].total_periods - result["plan"].executed_periods,
        "next_execution_date": result["next_execution_date"],
        "status": result["plan"].status
    }


@router.post("/periods/{period_id}/revert")
def revert_period(
    period_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    book_id: str = None
):
    bid = get_current_book_id(current_user, db, book_id)
    result = revert_installment_period(db, period_id, bid)
    return {
        "plan_id": result["plan"].id,
        "period_id": result["schedule"].id,
        "executed_period": result["plan"].executed_periods,
        "next_execution_date": result["plan"].next_execution_date,
        "status": result["plan"].status,
    }
