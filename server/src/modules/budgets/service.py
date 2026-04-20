from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased, selectinload

from src.common.enums import CategoryType, TransactionStatus, TransactionType
from src.core.database import generate_uuid
from src.modules.categories.models import Category
from src.modules.transactions.models import Transaction
from src.modules.reports.service import _datetime_range

from .models import Budget
from .schemas import BudgetCreateSchema, BudgetUpdateSchema

EXPENSE_TRANSACTION_TYPES = [
    TransactionType.EXPENSE.value,
    TransactionType.FEE.value,
    TransactionType.INSTALLMENT_PURCHASE.value,
]


def _validate_budget_dates(
    db: Session,
    book_id: str,
    period_type: str,
    start_date: date,
    end_date: date,
    *,
    exclude_budget_id: str | None = None,
    status: str = "active",
    dimension_type: str = "overall",
    category_id: str | None = None,
) -> None:
    if start_date > end_date:
        raise ValueError("开始日期不能晚于结束日期")

    if status != "active":
        return

    query = db.query(Budget).filter(
        Budget.book_id == book_id,
        Budget.status == "active",
        Budget.dimension_type == dimension_type,
    )
    if dimension_type == "category":
        query = query.filter(Budget.category_id == category_id)

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


def _get_category_or_raise(db: Session, book_id: str, category_id: str) -> Category:
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.book_id == book_id,
        Category.is_deleted == False,
        Category.is_active == True,
    ).first()
    if not category:
        raise ValueError("预算分类不存在")
    if category.category_type != CategoryType.EXPENSE.value:
        raise ValueError("预算分类必须是支出分类")
    return category


def _validate_budget_dimension(
    db: Session,
    book_id: str,
    dimension_type: str,
    category_id: str | None,
) -> Category | None:
    if dimension_type not in {"overall", "category"}:
        raise ValueError("不支持的预算维度")

    if dimension_type == "overall":
        if category_id is not None:
            raise ValueError("总预算不能指定分类")
        return None

    if not category_id:
        raise ValueError("分类预算必须选择分类")
    return _get_category_or_raise(db, book_id, category_id)


def _get_descendant_category_ids(db: Session, book_id: str, category_id: str) -> set[str]:
    categories = db.query(Category.id, Category.parent_id).filter(
        Category.book_id == book_id,
        Category.is_deleted == False,
    ).all()
    children_map: dict[str, list[str]] = defaultdict(list)
    valid_ids = set()
    for cid, parent_id in categories:
        valid_ids.add(cid)
        if parent_id:
            children_map[parent_id].append(cid)

    if category_id not in valid_ids:
        return set()

    descendants: set[str] = set()
    stack = [category_id]
    while stack:
        current_id = stack.pop()
        if current_id in descendants:
            continue
        descendants.add(current_id)
        stack.extend(children_map.get(current_id, []))
    return descendants


def _resolve_budget_category_ids(db: Session, budget: Budget) -> set[str] | None:
    if budget.dimension_type != "category" or not budget.category_id:
        return None
    if budget.rollup_children:
        return _get_descendant_category_ids(db, budget.book_id, budget.category_id)
    return {budget.category_id}


def _get_category_names(db: Session, book_id: str, category_ids: set[str]) -> dict[str, str]:
    if not category_ids:
        return {}
    categories = db.query(Category.id, Category.name).filter(
        Category.book_id == book_id,
        Category.id.in_(category_ids),
    ).all()
    return {cid: name for cid, name in categories}


def _to_alert_status(usage_ratio: float) -> str:
    if usage_ratio >= 1:
        return "exceeded"
    if usage_ratio >= 0.8:
        return "warning"
    return "normal"


def _serialize_category_breakdown(category_metrics: dict[str | None, dict[str, Decimal | str | None]]) -> list[dict]:
    items = []
    for category_id, metrics in category_metrics.items():
        gross_amount = metrics["gross_amount"]
        refund_deduction = metrics["refund_deduction"]
        items.append({
            "category_id": category_id,
            "category_name": metrics["category_name"],
            "gross_amount": gross_amount,
            "refund_deduction": refund_deduction,
            "net_amount": gross_amount - refund_deduction,
        })
    items.sort(key=lambda item: (item["net_amount"], item["gross_amount"]), reverse=True)
    return items


def _build_budget_metrics(db: Session, budget: Budget) -> dict:
    dt_from, dt_to = _datetime_range(budget.start_date, budget.end_date)
    relevant_category_ids = _resolve_budget_category_ids(db, budget)
    visible_category_ids = set(relevant_category_ids or set())

    expense_query = db.query(Transaction).options(
        selectinload(Transaction.category),
    ).filter(
        Transaction.book_id == budget.book_id,
        Transaction.transaction_type.in_(EXPENSE_TRANSACTION_TYPES),
        Transaction.status == TransactionStatus.CONFIRMED.value,
        Transaction.include_in_expense == True,
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    )
    if relevant_category_ids is not None:
        expense_query = expense_query.filter(Transaction.category_id.in_(relevant_category_ids))
    expenses = expense_query.all()

    OriginalTxn = aliased(Transaction)
    refund_query = db.query(Transaction, OriginalTxn.category_id).outerjoin(
        OriginalTxn,
        Transaction.related_transaction_id == OriginalTxn.id,
    ).filter(
        Transaction.book_id == budget.book_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == TransactionStatus.CONFIRMED.value,
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    )
    if relevant_category_ids is not None:
        refund_query = refund_query.filter(OriginalTxn.category_id.in_(relevant_category_ids))
    refunds = refund_query.all()

    visible_category_ids.update(txn.category_id for txn in expenses if txn.category_id)
    visible_category_ids.update(original_category_id for _, original_category_id in refunds if original_category_id)
    category_names = _get_category_names(db, budget.book_id, visible_category_ids)

    gross_expense = Decimal("0")
    refund_deduction = Decimal("0")
    category_metrics: dict[str | None, dict[str, Decimal | str | None]] = {}
    transactions: list[dict] = []

    def ensure_category_metric(category_id: str | None, category_name: str | None) -> dict[str, Decimal | str | None]:
        if category_id not in category_metrics:
            category_metrics[category_id] = {
                "category_name": category_name,
                "gross_amount": Decimal("0"),
                "refund_deduction": Decimal("0"),
            }
        return category_metrics[category_id]

    for txn in expenses:
        category_name = txn.category.name if txn.category else category_names.get(txn.category_id)
        gross_expense += txn.amount
        ensure_category_metric(txn.category_id, category_name)["gross_amount"] += txn.amount
        transactions.append({
            "id": txn.id,
            "occurred_at": txn.occurred_at,
            "transaction_type": txn.transaction_type,
            "merchant": txn.merchant,
            "note": txn.note,
            "category_id": txn.category_id,
            "category_name": category_name,
            "amount": txn.amount,
            "impact_amount": txn.amount,
            "related_transaction_id": txn.related_transaction_id,
        })

    for txn, original_category_id in refunds:
        refund_category_name = category_names.get(original_category_id) or category_names.get(txn.category_id)
        transactions.append({
            "id": txn.id,
            "occurred_at": txn.occurred_at,
            "transaction_type": txn.transaction_type,
            "merchant": txn.merchant,
            "note": txn.note,
            "category_id": original_category_id or txn.category_id,
            "category_name": refund_category_name,
            "amount": txn.amount,
            "impact_amount": -txn.amount,
            "related_transaction_id": txn.related_transaction_id,
        })
        if original_category_id:
            refund_deduction += txn.amount
            ensure_category_metric(original_category_id, refund_category_name)["refund_deduction"] += txn.amount

    transactions.sort(key=lambda item: (item["occurred_at"], item["id"]), reverse=True)
    return {
        "gross_expense": gross_expense,
        "refund_deduction": refund_deduction,
        "net_expense": gross_expense - refund_deduction,
        "transactions": transactions,
        "category_breakdown": _serialize_category_breakdown(category_metrics),
    }


def _to_budget_summary(budget: Budget, spent_amount: Decimal, category_name: str | None = None) -> dict:
    remaining_amount = budget.amount - spent_amount
    usage_ratio = float(spent_amount / budget.amount) if budget.amount else 0.0
    return {
        "id": budget.id,
        "name": budget.name,
        "period_type": budget.period_type,
        "dimension_type": budget.dimension_type,
        "amount": budget.amount,
        "start_date": budget.start_date,
        "end_date": budget.end_date,
        "category_id": budget.category_id,
        "category_name": category_name,
        "rollup_children": budget.rollup_children,
        "status": budget.status,
        "spent_amount": spent_amount,
        "remaining_amount": remaining_amount,
        "usage_ratio": usage_ratio,
        "alert_status": _to_alert_status(usage_ratio),
    }


def create_budget(db: Session, book_id: str, data: BudgetCreateSchema) -> dict:
    category = _validate_budget_dimension(db, book_id, data.dimension_type, data.category_id)
    _validate_budget_dates(
        db,
        book_id,
        data.period_type,
        data.start_date,
        data.end_date,
        dimension_type=data.dimension_type,
        category_id=category.id if category else None,
    )

    budget = Budget(
        id=generate_uuid(),
        book_id=book_id,
        name=data.name.strip(),
        period_type=data.period_type,
        dimension_type=data.dimension_type,
        amount=data.amount,
        start_date=data.start_date,
        end_date=data.end_date,
        category_id=category.id if category else None,
        rollup_children=data.rollup_children,
        status="active",
        note=data.note,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget_to_dict(db, budget)


def get_budgets(db: Session, book_id: str) -> list[dict]:
    budgets = db.query(Budget).filter(
        Budget.book_id == book_id,
    ).order_by(Budget.start_date.desc(), Budget.created_at.desc()).all()
    return [get_budget_summary(db, budget.id, book_id) for budget in budgets]


def get_budget(db: Session, budget_id: str, book_id: str) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    return budget_to_dict(db, budget)


def update_budget(db: Session, budget_id: str, book_id: str, data: BudgetUpdateSchema) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    update_data = data.model_dump(exclude_unset=True)

    next_dimension_type = update_data.get("dimension_type", budget.dimension_type)
    category_id_supplied = "category_id" in update_data
    next_category_id = update_data["category_id"] if category_id_supplied else budget.category_id
    category = _validate_budget_dimension(db, book_id, next_dimension_type, next_category_id)
    next_name = update_data.get("name", budget.name)
    next_amount = update_data.get("amount", budget.amount)
    next_start_date = update_data.get("start_date", budget.start_date)
    next_end_date = update_data.get("end_date", budget.end_date)
    next_status = update_data.get("status", budget.status)
    next_note = update_data.get("note", budget.note)
    next_rollup_children = update_data.get("rollup_children", budget.rollup_children)

    _validate_budget_dates(
        db,
        book_id,
        budget.period_type,
        next_start_date,
        next_end_date,
        exclude_budget_id=budget.id,
        status=next_status,
        dimension_type=next_dimension_type,
        category_id=category.id if category else None,
    )

    budget.name = next_name.strip() if isinstance(next_name, str) else next_name
    budget.dimension_type = next_dimension_type
    budget.amount = next_amount
    budget.start_date = next_start_date
    budget.end_date = next_end_date
    budget.category_id = category.id if category else None
    budget.rollup_children = next_rollup_children
    budget.status = next_status
    budget.note = next_note

    db.commit()
    db.refresh(budget)
    return budget_to_dict(db, budget)


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
    if budget.book_id != book_id:
        raise ValueError("Budget not found")
    metrics = _build_budget_metrics(db, budget)
    return metrics["net_expense"]


def get_budget_summary(db: Session, budget_id: str, book_id: str) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    metrics = _build_budget_metrics(db, budget)
    category_name = None
    if budget.category_id:
        category_name = _get_category_names(db, book_id, {budget.category_id}).get(budget.category_id)
    summary = _to_budget_summary(budget, metrics["net_expense"], category_name)
    summary["category_breakdown"] = metrics["category_breakdown"]
    return summary


def get_budget_breakdown(db: Session, budget_id: str, book_id: str) -> dict:
    budget = _get_budget_or_raise(db, budget_id, book_id)
    metrics = _build_budget_metrics(db, budget)
    category_name = None
    if budget.category_id:
        category_name = _get_category_names(db, book_id, {budget.category_id}).get(budget.category_id)
    return {
        "budget_id": budget.id,
        "dimension_type": budget.dimension_type,
        "category_id": budget.category_id,
        "category_name": category_name,
        "rollup_children": budget.rollup_children,
        "gross_expense": metrics["gross_expense"],
        "refund_deduction": metrics["refund_deduction"],
        "net_expense": metrics["net_expense"],
        "category_breakdown": metrics["category_breakdown"],
        "transactions": metrics["transactions"],
    }


def budget_to_dict(db: Session, budget: Budget) -> dict:
    category_name = None
    if budget.category_id:
        category_name = _get_category_names(db, budget.book_id, {budget.category_id}).get(budget.category_id)
    return {
        "id": budget.id,
        "book_id": budget.book_id,
        "name": budget.name,
        "period_type": budget.period_type,
        "dimension_type": budget.dimension_type,
        "amount": budget.amount,
        "start_date": budget.start_date,
        "end_date": budget.end_date,
        "category_id": budget.category_id,
        "category_name": category_name,
        "rollup_children": budget.rollup_children,
        "status": budget.status,
        "note": budget.note,
        "created_at": budget.created_at,
        "updated_at": budget.updated_at,
    }
