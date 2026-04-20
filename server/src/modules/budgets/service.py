from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from src.common.enums import TransactionStatus, TransactionType
from src.core.database import generate_uuid
from src.modules.transactions.models import Transaction
from src.modules.reports.service import _datetime_range, _get_period_metrics

from .models import Budget
from .schemas import BudgetCreateSchema, BudgetUpdateSchema


def _validate_budget_dates(
    db: Session,
    book_id: str,
    period_type: str,
    start_date: date,
    end_date: date,
    *,
    exclude_budget_id: str | None = None,
    status: str = "active",
) -> None:
    if start_date > end_date:
        raise ValueError("开始日期不能晚于结束日期")

    if status != "active":
        return

    query = db.query(Budget).filter(
        Budget.book_id == book_id,
        Budget.status == "active",
    )
    if exclude_budget_id:
        query = query.filter(Budget.id != exclude_budget_id)

    if period_type == "monthly":
        last_day = monthrange(start_date.year, start_date.month)[1]
        if start_date.day != 1:
            raise ValueError("月预算开始日期必须是当月第一天")
        if end_date != date(start_date.year, start_date.month, last_day):
            raise ValueError("月预算结束日期必须是当月最后一天")
        if start_date.year != end_date.year or start_date.month != end_date.month:
            raise ValueError("月预算必须落在同一个自然月内")

        existing = query.filter(
            Budget.period_type == "monthly",
            Budget.start_date == start_date,
            Budget.end_date == end_date,
        ).first()
        if existing:
            raise ValueError("该自然月已存在激活中的预算")
        return

    if period_type != "custom_range":
        raise ValueError("不支持的预算周期类型")

    if start_date >= end_date:
        raise ValueError("自定义区间预算的开始日期必须早于结束日期")

    overlap = query.filter(
        Budget.start_date <= end_date,
        Budget.end_date >= start_date,
    ).first()
    if overlap:
        raise ValueError("预算时间范围与现有激活预算重叠")


def _get_budget_or_raise(db: Session, budget_id: str, book_id: str) -> Budget:
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.book_id == book_id,
    ).first()
    if not budget:
        raise ValueError("Budget not found")
    return budget


def _to_alert_status(usage_ratio: float) -> str:
    if usage_ratio >= 1:
        return "exceeded"
    if usage_ratio >= 0.8:
        return "warning"
    return "normal"


def _to_budget_summary(budget: Budget, spent_amount: Decimal) -> dict:
    remaining_amount = budget.amount - spent_amount
    usage_ratio = float(spent_amount / budget.amount) if budget.amount else 0.0
    return {
        "id": budget.id,
        "name": budget.name,
        "period_type": budget.period_type,
        "amount": budget.amount,
        "start_date": budget.start_date,
        "end_date": budget.end_date,
        "status": budget.status,
        "spent_amount": spent_amount,
        "remaining_amount": remaining_amount,
        "usage_ratio": usage_ratio,
        "alert_status": _to_alert_status(usage_ratio),
    }


def create_budget(db: Session, book_id: str, data: BudgetCreateSchema) -> dict:
    _validate_budget_dates(
        db,
        book_id,
        data.period_type,
        data.start_date,
        data.end_date,
    )

    budget = Budget(
        id=generate_uuid(),
        book_id=book_id,
        name=data.name.strip(),
        period_type=data.period_type,
        amount=data.amount,
        start_date=data.start_date,
        end_date=data.end_date,
        status="active",
        note=data.note,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget_to_dict(budget)


def get_budgets(db: Session, book_id: str) -> list[dict]:
    budgets = db.query(Budget).filter(
        Budget.book_id == book_id,
    ).order_by(Budget.start_date.desc(), Budget.created_at.desc()).all()
    return [_to_budget_summary(budget, calculate_budget_spent(db, budget, book_id)) for budget in budgets]


def get_budget(db: Session, budget_id: str, book_id: str) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    return budget_to_dict(budget)


def update_budget(db: Session, budget_id: str, book_id: str, data: BudgetUpdateSchema) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    update_data = data.model_dump(exclude_unset=True)

    next_name = update_data.get("name", budget.name)
    next_amount = update_data.get("amount", budget.amount)
    next_start_date = update_data.get("start_date", budget.start_date)
    next_end_date = update_data.get("end_date", budget.end_date)
    next_status = update_data.get("status", budget.status)
    next_note = update_data.get("note", budget.note)

    _validate_budget_dates(
        db,
        book_id,
        budget.period_type,
        next_start_date,
        next_end_date,
        exclude_budget_id=budget.id,
        status=next_status,
    )

    budget.name = next_name.strip() if isinstance(next_name, str) else next_name
    budget.amount = next_amount
    budget.start_date = next_start_date
    budget.end_date = next_end_date
    budget.status = next_status
    budget.note = next_note

    db.commit()
    db.refresh(budget)
    return budget_to_dict(budget)


def delete_budget(db: Session, budget_id: str, book_id: str) -> bool:
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.book_id == book_id,
    ).first()
    if not budget:
        return False
    db.delete(budget)
    db.commit()
    return True


def calculate_budget_spent(db: Session, budget: Budget, book_id: str) -> Decimal:
    metrics = _get_period_metrics(db, book_id, budget.start_date, budget.end_date)
    return metrics["expense"]


def get_budget_summary(db: Session, budget_id: str, book_id: str) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    spent_amount = calculate_budget_spent(db, budget, book_id)
    return _to_budget_summary(budget, spent_amount)


def get_budget_breakdown(db: Session, budget_id: str, book_id: str) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    dt_from, dt_to = _datetime_range(budget.start_date, budget.end_date)
    expense_types = [
        TransactionType.EXPENSE.value,
        TransactionType.FEE.value,
        TransactionType.INSTALLMENT_PURCHASE.value,
    ]

    expenses = db.query(Transaction).options(
        selectinload(Transaction.category),
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_(expense_types),
        Transaction.status == TransactionStatus.CONFIRMED.value,
        Transaction.include_in_expense == True,
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    ).all()

    refunds = db.query(Transaction).options(
        selectinload(Transaction.category),
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == TransactionStatus.CONFIRMED.value,
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    ).all()

    transactions: list[dict] = []
    for txn in expenses:
        transactions.append({
            "id": txn.id,
            "occurred_at": txn.occurred_at,
            "transaction_type": txn.transaction_type,
            "merchant": txn.merchant,
            "note": txn.note,
            "category_id": txn.category_id,
            "category_name": txn.category.name if txn.category else None,
            "amount": txn.amount,
            "impact_amount": txn.amount,
            "related_transaction_id": txn.related_transaction_id,
        })

    for txn in refunds:
        transactions.append({
            "id": txn.id,
            "occurred_at": txn.occurred_at,
            "transaction_type": txn.transaction_type,
            "merchant": txn.merchant,
            "note": txn.note,
            "category_id": txn.category_id,
            "category_name": txn.category.name if txn.category else None,
            "amount": txn.amount,
            "impact_amount": -txn.amount,
            "related_transaction_id": txn.related_transaction_id,
        })

    transactions.sort(key=lambda item: (item["occurred_at"], item["id"]), reverse=True)
    metrics = _get_period_metrics(db, book_id, budget.start_date, budget.end_date)
    return {
        "budget_id": budget.id,
        "gross_expense": metrics["gross_expense"],
        "refund_deduction": metrics["refund_deduction"],
        "net_expense": metrics["expense"],
        "transactions": transactions,
    }


def budget_to_dict(budget: Budget) -> dict:
    return {
        "id": budget.id,
        "book_id": budget.book_id,
        "name": budget.name,
        "period_type": budget.period_type,
        "amount": budget.amount,
        "start_date": budget.start_date,
        "end_date": budget.end_date,
        "status": budget.status,
        "note": budget.note,
        "created_at": budget.created_at,
        "updated_at": budget.updated_at,
    }
