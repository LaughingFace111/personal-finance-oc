import json
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timedelta, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import alias, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from src.common.enums import AccountType, TransactionType, TransactionStatus
from src.modules.categories.models import Category
from src.modules.tags.models import Tag
from src.modules.transactions.models import Transaction
from src.modules.accounts.models import Account
from src.modules.installments.models import InstallmentPlan, InstallmentSchedule
from src.modules.loans.models import LoanPlan, LoanSchedule

# 🛡️ L: 共享应用缓存（统一失效机制）
from src.core.cache import get_cached_overview, set_cached_overview


ASSET_ACCOUNT_TYPES = {
    AccountType.CASH.value,
    AccountType.DEBIT_CARD.value,
    AccountType.EWALLET.value,
    AccountType.VIRTUAL.value,
}


def _datetime_range(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    return datetime.combine(date_from, time.min), datetime.combine(date_to, time.max)


def _resolve_direction_types(direction: str) -> tuple[list[str], str]:
    if direction == "expense":
        return [
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value,
        ], "out"
    if direction == "income":
        return [TransactionType.INCOME.value], "in"
    raise ValueError("direction must be expense or income")


def _load_report_transactions(
    db: Session,
    book_id: str,
    date_from: date,
    date_to: date,
    direction: str,
) -> list[Transaction]:
    transaction_types, direction_value = _resolve_direction_types(direction)
    dt_from, dt_to = _datetime_range(date_from, date_to)
    # 🛡️ L: 预加载 category 关系，消除 N+1（reports 层遍历每条 transaction.category 时无需再查库）
    return db.query(Transaction).options(
        selectinload(Transaction.category),
        selectinload(Transaction.account),
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_(transaction_types),
        Transaction.direction == direction_value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    ).order_by(Transaction.occurred_at.desc(), Transaction.created_at.desc()).all()


def _get_month_bounds(year: int, month: int) -> tuple[date, date]:
    _, last_day = monthrange(year, month)
    return date(year, month, 1), date(year, month, last_day)


def _get_previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _format_currency(amount: Decimal) -> str:
    return f"¥{amount.quantize(Decimal('0.01'))}"


def _format_rate(rate: Decimal) -> str:
    normalized = rate.quantize(Decimal("0.1"))
    text = format(normalized, "f").rstrip("0").rstrip(".")
    return text or "0"


def _decimal_to_float(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _get_period_metrics(db: Session, book_id: str, date_from: date, date_to: date) -> dict[str, Decimal]:
    dt_from, dt_to = _datetime_range(date_from, date_to)

    income = db.query(func.sum(Transaction.amount)).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.INCOME.value,
        Transaction.status == "confirmed",
        Transaction.include_in_income == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    ).scalar() or Decimal("0")

    gross_expense = db.query(func.sum(Transaction.amount)).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value,
        ]),
        Transaction.status == "confirmed",
        Transaction.include_in_expense == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    ).scalar() or Decimal("0")

    refunds = db.query(
        Transaction.related_transaction_id,
        func.sum(Transaction.amount).label("refund_amount"),
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
        Transaction.related_transaction_id.isnot(None),
    ).group_by(Transaction.related_transaction_id).all()

    refund_deduction = sum((refund.refund_amount for refund in refunds), Decimal("0"))
    net_expense = gross_expense - refund_deduction
    balance = income - net_expense
    total = income + net_expense

    return {
        "income": income,
        "gross_expense": gross_expense,
        "refund_deduction": refund_deduction,
        "expense": net_expense,
        "net_expense": net_expense,
        "balance": balance,
        "net": balance,
        "total": total,
    }


def _resolve_compare_value(metrics: dict[str, Decimal], compare_type: str) -> Decimal:
    if compare_type not in {"total", "income", "expense", "balance"}:
        raise ValueError("compare_type must be one of total, income, expense, balance")
    if compare_type == "balance":
        return metrics["balance"]
    return metrics[compare_type]


def _build_comparison_entry(current_value: Decimal, compare_value: Decimal) -> dict:
    change_amount = current_value - compare_value

    if compare_value == 0:
        if current_value == 0:
            trend_direction = "stable"
            change_rate = None
            label = "持平"
        elif current_value > 0:
            trend_direction = "new"
            change_rate = None
            label = "新增"
        else:
            trend_direction = "decrease"
            change_rate = None
            label = "变化"
    else:
        change_rate = (change_amount / compare_value) * Decimal("100")
        if change_amount > 0:
            trend_direction = "up"
            label = "上升"
        elif change_amount < 0:
            trend_direction = "down"
            label = "下降"
        else:
            trend_direction = "stable"
            label = "持平"

    return {
        "compare_value": _decimal_to_float(compare_value),
        "change_amount": _decimal_to_float(change_amount),
        "change_rate": float(change_rate) if change_rate is not None else None,
        "trend_direction": trend_direction,
        "label": label,
    }


def _build_category_tree(categories: list[Category]) -> tuple[dict[str, Category], dict[str, list[str]]]:
    category_map = {category.id: category for category in categories}
    children_map: dict[str, list[str]] = {}
    for category in categories:
        if category.parent_id:
            children_map.setdefault(category.parent_id, []).append(category.id)
    return category_map, children_map


def _collect_descendant_ids(category_id: str, children_map: dict[str, list[str]]) -> set[str]:
    collected: set[str] = set()
    stack = [category_id]
    while stack:
        current = stack.pop()
        if current in collected:
            continue
        collected.add(current)
        stack.extend(children_map.get(current, []))
    return collected


def _get_category_amounts_for_period(
    db: Session,
    book_id: str,
    category_ids: set[str],
    date_from: date,
    date_to: date,
    direction: str,
) -> dict[str, Decimal]:
    if not category_ids:
        return {}

    dt_from, dt_to = _datetime_range(date_from, date_to)

    if direction == "income":
        rows = db.query(
            Transaction.category_id,
            func.sum(Transaction.amount).label("amount"),
        ).filter(
            Transaction.book_id == book_id,
            Transaction.transaction_type == TransactionType.INCOME.value,
            Transaction.status == "confirmed",
            Transaction.include_in_income == True,  # 🛡️ L: 收支开关过滤
            Transaction.occurred_at >= dt_from,
            Transaction.occurred_at <= dt_to,
            Transaction.category_id.in_(category_ids),
        ).group_by(Transaction.category_id).all()
        return {row.category_id: row.amount or Decimal("0") for row in rows if row.category_id}

    OriginalTxn = alias(Transaction, name="original_txn")
    RefundTxn = alias(Transaction, name="refund_txn")

    expense_rows = db.query(
        Transaction.category_id,
        func.sum(Transaction.amount).label("gross_amount"),
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value,
        ]),
        Transaction.status == "confirmed",
        Transaction.include_in_expense == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
        Transaction.category_id.in_(category_ids),
    ).group_by(Transaction.category_id).all()

    refund_rows = db.query(
        OriginalTxn.c.category_id,
        func.sum(RefundTxn.c.amount).label("refund_amount"),
    ).join(
        RefundTxn, RefundTxn.c.related_transaction_id == OriginalTxn.c.id
    ).filter(
        OriginalTxn.c.book_id == book_id,
        RefundTxn.c.transaction_type == TransactionType.REFUND.value,
        RefundTxn.c.status == "confirmed",
        RefundTxn.c.include_in_expense == True,  # 🛡️ L: 收支开关过滤（退款也计入支出抵消）
        RefundTxn.c.occurred_at >= dt_from,
        RefundTxn.c.occurred_at <= dt_to,
        OriginalTxn.c.category_id.in_(category_ids),
    ).group_by(OriginalTxn.c.category_id).all()

    amounts = {row.category_id: row.gross_amount or Decimal("0") for row in expense_rows if row.category_id}
    for row in refund_rows:
        if not row.category_id:
            continue
        amounts[row.category_id] = amounts.get(row.category_id, Decimal("0")) - (row.refund_amount or Decimal("0"))
    return amounts


def _sum_category_tree_amounts(
    category_amounts: dict[str, Decimal],
    category_ids: set[str],
) -> Decimal:
    return sum((category_amounts.get(category_id, Decimal("0")) for category_id in category_ids), Decimal("0"))


def _pick_top_contributors(
    category_map: dict[str, Category],
    current_amounts: dict[str, Decimal],
    previous_amounts: dict[str, Decimal],
    child_ids: list[str],
    children_map: dict[str, list[str]],
    trend_type: str,
) -> list[dict]:
    contributors: list[dict] = []
    for child_id in child_ids:
        descendant_ids = _collect_descendant_ids(child_id, children_map)
        current_amount = _sum_category_tree_amounts(current_amounts, descendant_ids)
        previous_amount = _sum_category_tree_amounts(previous_amounts, descendant_ids)
        change_amount = current_amount - previous_amount
        contributors.append({
            "categoryId": child_id,
            "categoryName": category_map[child_id].name,
            "monthAmount": float(current_amount),
            "prevMonthAmount": float(previous_amount),
            "changeAmount": float(change_amount),
        })

    if trend_type == "INCREASE":
        ranked = [item for item in contributors if item["changeAmount"] > 0]
        ranked.sort(key=lambda item: item["changeAmount"], reverse=True)
    elif trend_type == "DECREASE":
        ranked = [item for item in contributors if item["changeAmount"] < 0]
        ranked.sort(key=lambda item: item["changeAmount"])
    else:
        ranked = [item for item in contributors if item["monthAmount"] > 0]
        ranked.sort(key=lambda item: item["monthAmount"], reverse=True)

    return ranked[:3]


def _build_category_summary_text(
    category_name: str,
    direction: str,
    month_amount: Decimal,
    prev_month_amount: Decimal,
    change_rate: Decimal,
    trend_type: str,
    top_contributors: list[dict],
) -> str:
    noun = "支出" if direction == "expense" else "收入"
    contributor_names = "、".join(item["categoryName"] for item in top_contributors)

    if trend_type == "NEW":
        return f"本月新增{category_name}{noun}{_format_currency(month_amount)}"
    if trend_type == "CLEARED":
        return f"本月未产生{category_name}{noun}，上月为{_format_currency(prev_month_amount)}"
    if trend_type == "STABLE":
        text = f"本月{category_name}{noun}与上月基本持平"
        if contributor_names:
            text += f"，{noun}仍主要集中在{contributor_names}"
        return f"{text}。"
    if trend_type == "DECREASE":
        text = f"本月{category_name}{noun}较上月下降{_format_rate(abs(change_rate))}%"
        if contributor_names:
            text += f"，主要减少来自{contributor_names}"
        return f"{text}。"

    text = f"本月{category_name}{noun}较上月上涨{_format_rate(abs(change_rate))}%"
    if contributor_names:
        text += f"，主要来自{contributor_names}"
    return f"{text}。"


def get_category_monthly_insight(
    db: Session,
    book_id: str,
    category_id: str,
    year: int,
    month: int,
    direction: str = "expense",
) -> dict:
    if month < 1 or month > 12:
        raise ValueError("month must be between 1 and 12")
    if direction not in {"expense", "income"}:
        raise ValueError("direction must be expense or income")

    categories = db.query(Category).filter(Category.book_id == book_id).all()
    category_map, children_map = _build_category_tree(categories)
    category = category_map.get(category_id)
    if not category:
        raise ValueError("Category not found")
    if category.category_type != direction:
        raise ValueError("Category direction mismatch")

    current_start, current_end = _get_month_bounds(year, month)
    prev_year, prev_month = _get_previous_month(year, month)
    previous_start, previous_end = _get_month_bounds(prev_year, prev_month)

    current_tree_ids = _collect_descendant_ids(category_id, children_map)
    current_amounts = _get_category_amounts_for_period(db, book_id, current_tree_ids, current_start, current_end, direction)
    previous_amounts = _get_category_amounts_for_period(db, book_id, current_tree_ids, previous_start, previous_end, direction)

    month_amount = _sum_category_tree_amounts(current_amounts, current_tree_ids)
    prev_month_amount = _sum_category_tree_amounts(previous_amounts, current_tree_ids)
    change_amount = month_amount - prev_month_amount

    amount_threshold = Decimal("10")
    rate_threshold = Decimal("5")

    if prev_month_amount > 0:
        change_rate = (change_amount / prev_month_amount) * Decimal("100")
    else:
        change_rate = Decimal("0")

    if abs(change_amount) < amount_threshold:
        trend_type = "STABLE"
    elif prev_month_amount == 0 and month_amount > 0:
        trend_type = "NEW"
    elif month_amount == 0 and prev_month_amount > 0:
        trend_type = "CLEARED"
    elif abs(change_rate) < rate_threshold:
        trend_type = "STABLE"
    elif change_amount > 0:
        trend_type = "INCREASE"
    elif change_amount < 0:
        trend_type = "DECREASE"
    else:
        trend_type = "STABLE"

    top_contributors = _pick_top_contributors(
        category_map=category_map,
        current_amounts=current_amounts,
        previous_amounts=previous_amounts,
        child_ids=children_map.get(category_id, []),
        children_map=children_map,
        trend_type=trend_type,
    )

    return {
        "categoryId": category.id,
        "categoryName": category.name,
        "monthAmount": float(month_amount),
        "prevMonthAmount": float(prev_month_amount),
        "changeAmount": float(change_amount),
        "changeRate": float(change_rate),
        "trendType": trend_type,
        "topContributors": top_contributors,
        "summaryText": _build_category_summary_text(
            category_name=category.name,
            direction=direction,
            month_amount=month_amount,
            prev_month_amount=prev_month_amount,
            change_rate=change_rate,
            trend_type=trend_type,
            top_contributors=top_contributors,
        ),
    }


def _parse_tag_names(raw_tags: Optional[str]) -> list[str]:
    if not raw_tags:
        return []
    try:
        parsed = json.loads(raw_tags)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []

    names: list[str] = []
    seen: set[str] = set()
    for item in parsed:
        if not isinstance(item, str):
            continue
        name = item.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def get_overview(db: Session, book_id: str, date_from: date, date_to: date) -> dict:
    """
    Get dashboard overview
    按最终设计口径:
    - 收入 = income
    - 支出 = expense + fee + installment_purchase - refund冲减
    - 现金流 = income + expense(资产) + fee
    🛡️ L: 5 分钟 TTL 缓存，记账即失效
    """
    # 🛡️ L: 缓存命中则直接返回
    cached = get_cached_overview(book_id, str(date_from), str(date_to))
    if cached is not None:
        return cached
    metrics = _get_period_metrics(db, book_id, date_from, date_to)
    income = metrics["income"]
    expense_txns = metrics["gross_expense"]
    refund_deduction = metrics["refund_deduction"]
    net_expense = metrics["net_expense"]

    # === 资产账户余额 ===
    asset_accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.account_type.in_(["cash", "debit_card", "ewallet", "virtual"]),
        Account.is_active == True
    ).all()
    total_asset = sum(a.current_balance for a in asset_accounts)

    # === 信用负债 ===
    credit_accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.account_type.in_(["credit_card", "credit_line"]),
        Account.is_active == True
    ).all()
    total_credit_debt = sum(a.debt_amount for a in credit_accounts)

    # === 贷款负债 ===
    loan_accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.account_type == "loan",
        Account.is_active == True
    ).all()
    total_loan_debt = sum(a.debt_amount for a in loan_accounts)

    result = {
        "period": {"date_from": date_from, "date_to": date_to},
        "income": income,
        "gross_expense": expense_txns,
        "refund_deduction": refund_deduction,
        "net_expense": net_expense,
        "net": metrics["net"],
        "total_assets": total_asset,
        "total_credit_debt": total_credit_debt,
        "total_loan_debt": total_loan_debt,
        "total_debt": total_credit_debt + total_loan_debt,
    }
    # 🛡️ L: 写入缓存
    set_cached_overview(book_id, str(date_from), str(date_to), result)
    return result


def get_expense_by_category(db: Session, book_id: str, date_from: date, date_to: date) -> list:
    """
    Get expense breakdown by category (净支出)
    按最终设计口径:
    - 按原消费分类统计
    - 退款冲减按原消费分类扣减
    """
    # === 支出查询：使用别名避免混淆 ===
    # 原始支出（毛支出）- 退款需要通过它找到原交易的分类
    OriginalTxn = alias(Transaction, name="original_txn")
    RefundTxn = alias(Transaction, name="refund_txn")

    # 按分类统计毛支出
    expense_query = db.query(
        Transaction.category_id,
        func.sum(Transaction.amount).label("gross_amount")
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value
        ]),
        Transaction.status == "confirmed",
        Transaction.include_in_expense == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max),
        Transaction.category_id.isnot(None)
    ).group_by(Transaction.category_id).all()

    # 按原交易分类统计退款冲减
    # 思路：通过 refund.related_transaction_id 找到原交易，再获取原交易的 category_id
    # 使用两个别名：refund_txn 是退款记录，original_txn 是原交易
    refund_query = db.query(
        OriginalTxn.c.category_id,
        func.sum(RefundTxn.c.amount).label("refund_amount")
    ).join(
        RefundTxn, RefundTxn.c.related_transaction_id == OriginalTxn.c.id
    ).filter(
        OriginalTxn.c.book_id == book_id,
        RefundTxn.c.transaction_type == TransactionType.REFUND.value,
        RefundTxn.c.status == "confirmed",
        RefundTxn.c.occurred_at >= datetime.combine(date_from, time.min),
        RefundTxn.c.occurred_at <= datetime.combine(date_to, time.max),
        OriginalTxn.c.category_id.isnot(None)
    ).group_by(OriginalTxn.c.category_id).all()

    # 构建退款冲减映射
    refund_map = {r.category_id: r.refund_amount for r in refund_query if r.category_id}

    # === 处理无法关联原交易的退款（单独统计）===
    # 这部分退款没有关联到原交易，无法冲减分类支出
    unlinked_refunds = db.query(
        func.sum(Transaction.amount).label("amount")
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max),
        Transaction.related_transaction_id.is_(None)
    ).scalar() or Decimal("0")

    # === 获取分类信息并组装结果 ===
    category_ids = [e.category_id for e in expense_query]
    categories = {c.id: c for c in db.query(Category).filter(Category.id.in_(category_ids)).all()} if category_ids else {}

    result = []
    for e in expense_query:
        cat = categories.get(e.category_id)
        refund = refund_map.get(e.category_id, Decimal("0"))
        result.append({
            "id": e.category_id,
            "name": cat.name if cat else "未知",
            "icon": cat.icon if cat else "?",
            "color": cat.color if cat else "#999",
            "gross_amount": e.gross_amount,
            "refund_amount": refund,
            "net_amount": e.gross_amount - refund
        })

    # 如果有无法关联的退款，添加一行"未归属退款"
    if unlinked_refunds > 0:
        result.append({
            "id": "unlinked",
            "name": "未关联退款",
            "icon": "🔄",
            "color": "#999",
            "gross_amount": Decimal("0"),
            "refund_amount": unlinked_refunds,
            "net_amount": -unlinked_refunds
        })

    return result


def get_accounts_summary(db: Session, book_id: str) -> list:
    """Get accounts summary"""
    accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.is_active == True
    ).all()

    return [
        {
            "id": a.id,
            "name": a.name,
            "account_type": a.account_type,
            "balance": a.current_balance,
            "debt": a.debt_amount,
            "credit_limit": a.credit_limit,
        }
        for a in accounts
    ]


def get_upcoming_debts(db: Session, book_id: str, days: int = 30) -> dict:
    """Get upcoming debt payments"""
    end_date = datetime.now().date() + timedelta(days=days)

    # Upcoming installments
    installments = db.query(InstallmentSchedule).join(InstallmentPlan).join(Account).filter(
        Account.book_id == book_id,
        InstallmentSchedule.status == "pending",
        InstallmentSchedule.due_date <= end_date
    ).order_by(InstallmentSchedule.due_date).all()

    # Upcoming loan payments
    loans = db.query(LoanSchedule).join(LoanPlan).join(Account).filter(
        Account.book_id == book_id,
        LoanSchedule.status == "pending",
        LoanSchedule.due_date <= end_date
    ).order_by(LoanSchedule.due_date).all()

    return {
        "installments": [
            {
                "id": i.id,
                "plan_id": i.installment_plan_id,
                "period_no": i.period_no,
                "due_date": i.due_date,
                "amount": i.total_due,
            }
            for i in installments
        ],
        "loans": [
            {
                "id": l.id,
                "plan_id": l.loan_plan_id,
                "period_no": l.period_no,
                "due_date": l.due_date,
                "amount": l.total_due,
            }
            for l in loans
        ]
    }


def get_daily_summary(db: Session, book_id: str, date_from: date, date_to: date) -> dict:
    """Get daily income and expense summary for calendar display"""
    # 收入按日期统计
    income_query = db.query(
        func.date(Transaction.occurred_at).label('day'),
        func.sum(Transaction.amount).label('total')
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.INCOME.value,
        Transaction.status == "confirmed",
        Transaction.include_in_income == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max)
    ).group_by(func.date(Transaction.occurred_at)).all()

    # 支出按日期统计（包含 expense, fee, installment_purchase）
    expense_query = db.query(
        func.date(Transaction.occurred_at).label('day'),
        func.sum(Transaction.amount).label('total')
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value
        ]),
        Transaction.status == "confirmed",
        Transaction.include_in_expense == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max)
    ).group_by(func.date(Transaction.occurred_at)).all()

    # 退款冲减按日期统计
    refund_query = db.query(
        func.date(Transaction.occurred_at).label('day'),
        func.sum(Transaction.amount).label('total')
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max)
    ).group_by(func.date(Transaction.occurred_at)).all()

    # 构建映射
    income_map = {str(q.day): float(q.total) for q in income_query}
    expense_map = {str(q.day): float(q.total) for q in expense_query}
    refund_map = {str(q.day): float(q.total) for q in refund_query}

    # 生成每日数据
    daily_data = {}
    current = date_from
    while current <= date_to:
        date_str = str(current)
        income = income_map.get(date_str, 0)
        expense_raw = expense_map.get(date_str, 0)
        refund = refund_map.get(date_str, 0)
        expense = expense_raw - refund  # 净支出
        net = income - expense
        
        daily_data[date_str] = {
            "income": income,
            "expense": expense,
            "net_balance": net
        }
        current += timedelta(days=1)

    return daily_data


def get_income_by_category(db: Session, book_id: str, date_from: date, date_to: date) -> list:
    """Get income breakdown by category"""
    # 收入查询
    income_query = db.query(
        Transaction.category_id,
        func.sum(Transaction.amount).label("total_amount")
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.INCOME.value,
        Transaction.status == "confirmed",
        Transaction.include_in_income == True,  # 🛡️ L: 收支开关过滤
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max),
        Transaction.category_id.isnot(None)
    ).group_by(Transaction.category_id).all()

    # 获取分类信息
    category_ids = [q.category_id for q in income_query]
    categories = {c.id: c for c in db.query(Category).filter(Category.id.in_(category_ids)).all()} if category_ids else {}

    result = []
    for q in income_query:
        cat = categories.get(q.category_id)
        result.append({
            "id": q.category_id,
            "name": cat.name if cat else "未知",
            "icon": cat.icon if cat else "?",
            "color": cat.color if cat else "#52c41a",
            "amount": float(q.total_amount)
        })

    return result


def get_monthly_comparison(db: Session, book_id: str, year: int) -> dict:
    """Get monthly income/expense comparison for a year"""
    from calendar import monthrange

    result = []
    total_income = 0
    total_expense = 0
    total_net = 0

    for month in range(1, 13):
        # 确定该月的起止日期
        month_start = date(year, month, 1)
        _, last_day = monthrange(year, month)
        month_end = date(year, month, last_day)

        # 只统计到今天之前的月份
        today = date.today()
        if month_end > today:
            if month_start > today:
                # 整个月都在未来，跳过
                result.append({
                    "month": month,
                    "month_str": f"{month}月",
                    "income": 0,
                    "expense": 0,
                    "net": 0
                })
                continue
            else:
                # 部分在未来，使用今天作为结束日期
                month_end = today

        metrics = _get_period_metrics(db, book_id, month_start, month_end)
        income_val = float(metrics["income"])
        expense_val = float(metrics["expense"])
        net_val = float(metrics["balance"])

        total_income += income_val
        total_expense += expense_val
        total_net += net_val

        result.append({
            "month": month,
            "month_str": f"{month}月",
            "income": income_val,
            "expense": expense_val,
            "net": net_val
        })

    return {
        "year": year,
        "months": result,
        "total_income": total_income,
        "total_expense": total_expense,
        "total_net": total_net
    }


def get_period_comparison(
    db: Session,
    book_id: str,
    year: int,
    month: int,
    compare_type: str,
) -> dict:
    if month < 1 or month > 12:
        raise ValueError("month must be between 1 and 12")

    current_start, current_end = _get_month_bounds(year, month)
    prev_year, prev_month = _get_previous_month(year, month)
    prev_start, prev_end = _get_month_bounds(prev_year, prev_month)
    yoy_year = year - 1
    yoy_start, yoy_end = _get_month_bounds(yoy_year, month)

    current_metrics = _get_period_metrics(db, book_id, current_start, current_end)
    prev_metrics = _get_period_metrics(db, book_id, prev_start, prev_end)
    yoy_metrics = _get_period_metrics(db, book_id, yoy_start, yoy_end)

    current_value = _resolve_compare_value(current_metrics, compare_type)
    prev_value = _resolve_compare_value(prev_metrics, compare_type)
    yoy_value = _resolve_compare_value(yoy_metrics, compare_type)

    return {
        "book_id": book_id,
        "year": year,
        "month": month,
        "type": compare_type,
        "current_value": _decimal_to_float(current_value),
        "month_over_month": {
            "year": prev_year,
            "month": prev_month,
            **_build_comparison_entry(current_value, prev_value),
        },
        "year_over_year": {
            "year": yoy_year,
            "month": month,
            **_build_comparison_entry(current_value, yoy_value),
        },
    }


def get_tags_by_category(
    db: Session,
    book_id: str,
    date_from: date,
    date_to: date,
    direction: str,
) -> dict:
    transactions = _load_report_transactions(db, book_id, date_from, date_to, direction)
    tags = db.query(Tag).filter(Tag.book_id == book_id, Tag.is_active == True).all()
    tags_by_name = {tag.name: tag for tag in tags}

    total_direction_amount = sum((txn.amount for txn in transactions), Decimal("0"))
    aggregate_map: dict[str, dict] = {}

    for txn in transactions:
        tag_names = _parse_tag_names(txn.tags)
        for tag_name in tag_names:
            tag = tags_by_name.get(tag_name)
            if not tag:
                continue
            current = aggregate_map.setdefault(tag.id, {
                "tag_id": tag.id,
                "tag_name": tag.name,
                "tag_color": tag.color or "#1677ff",
                "parent_id": tag.parent_id,
                "amount": Decimal("0"),
                "transaction_count": 0,
            })
            current["amount"] += txn.amount
            current["transaction_count"] += 1

    items = []
    for item in aggregate_map.values():
        amount = item["amount"]
        tx_count = item["transaction_count"]
        items.append({
            "tag_id": item["tag_id"],
            "tag_name": item["tag_name"],
            "tag_color": item["tag_color"],
            "parent_id": item["parent_id"],
            "amount": float(amount),
            "transaction_count": tx_count,
            "avg_amount": float(amount / tx_count) if tx_count else 0,
            "ratio": float(amount / total_direction_amount) if total_direction_amount > 0 else 0,
        })

    items.sort(key=lambda item: (-item["amount"], item["tag_name"]))

    return {
        "direction": direction,
        "date_from": str(date_from),
        "date_to": str(date_to),
        "total_direction_amount": float(total_direction_amount),
        "items": items,
        "note": "一笔交易可命中多个标签，标签金额按原值分别统计，因此标签金额之和可能大于总额。",
    }


def get_tag_detail(
    db: Session,
    book_id: str,
    tag_id: str,
    date_from: date,
    date_to: date,
    direction: str,
) -> dict:
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.book_id == book_id,
        Tag.is_active == True,
    ).first()
    if not tag:
        raise ValueError("Tag not found")

    transactions = _load_report_transactions(db, book_id, date_from, date_to, direction)
    matched_transactions = []
    category_amounts: dict[str, Decimal] = {}
    category_counts: dict[str, int] = {}
    category_ids: set[str] = set()
    total_direction_amount = sum((txn.amount for txn in transactions), Decimal("0"))
    tag_total_amount = Decimal("0")

    for txn in transactions:
        tag_names = _parse_tag_names(txn.tags)
        if tag.name not in tag_names:
            continue
        matched_transactions.append(txn)
        tag_total_amount += txn.amount

        category_id = txn.category_id or "uncategorized"
        category_amounts[category_id] = category_amounts.get(category_id, Decimal("0")) + txn.amount
        category_counts[category_id] = category_counts.get(category_id, 0) + 1
        if txn.category_id:
            category_ids.add(txn.category_id)

    categories = {}
    if category_ids:
        categories = {
            category.id: category
            for category in db.query(Category).filter(Category.id.in_(category_ids)).all()
        }

    category_breakdown = []
    for category_id, amount in category_amounts.items():
        category = categories.get(category_id)
        category_breakdown.append({
            "category_id": None if category_id == "uncategorized" else category_id,
            "category_name": category.name if category else "未分类",
            "category_icon": category.icon if category else "🏷️",
            "category_color": category.color if category else "#8c8c8c",
            "amount": float(amount),
            "transaction_count": category_counts.get(category_id, 0),
            "ratio": float(amount / tag_total_amount) if tag_total_amount > 0 else 0,
        })
    category_breakdown.sort(key=lambda item: (-item["amount"], item["category_name"]))

    detail_items = []
    for txn in matched_transactions:
        category = categories.get(txn.category_id) if txn.category_id else None
        detail_items.append({
            "id": txn.id,
            "occurred_at": txn.occurred_at.isoformat(),
            "amount": float(txn.amount),
            "merchant": txn.merchant,
            "note": txn.note,
            "transaction_type": txn.transaction_type,
            "category_id": txn.category_id,
            "category_name": category.name if category else "未分类",
            "category_icon": category.icon if category else "🏷️",
            "category_color": category.color if category else "#8c8c8c",
            "tags": _parse_tag_names(txn.tags),
        })

    return {
        "direction": direction,
        "date_from": str(date_from),
        "date_to": str(date_to),
        "tag": {
            "id": tag.id,
            "name": tag.name,
            "color": tag.color or "#1677ff",
            "parent_id": tag.parent_id,
        },
        "summary": {
            "amount": float(tag_total_amount),
            "transaction_count": len(matched_transactions),
            "avg_amount": float(tag_total_amount / len(matched_transactions)) if matched_transactions else 0,
            "ratio": float(tag_total_amount / total_direction_amount) if total_direction_amount > 0 else 0,
        },
        "category_breakdown": category_breakdown,
        "transactions": detail_items,
        "note": "一笔交易可命中多个标签，标签金额按原值分别统计，因此标签金额之和可能大于总额。",
    }


def _is_asset_account_type(account_type: str) -> bool:
    return account_type in ASSET_ACCOUNT_TYPES


def _validate_balance_trend_range(days: int) -> int:
    if days not in (7, 30, 365):
        raise ValueError("range must be 7, 30, or 365")
    return days


def _format_change_rate(change_amount: Decimal, start_balance: Decimal) -> tuple[Optional[float], str]:
    if start_balance == 0:
        if change_amount == 0:
            return 0.0, "0.00%"
        return None, "新增"

    change_rate = (change_amount / start_balance) * Decimal("100")
    return float(change_rate), f"{change_rate.quantize(Decimal('0.01'))}%"


def _get_balance_effect_for_transaction(txn: Transaction, tracked_account_ids: set[str], asset_account_ids: set[str]) -> Decimal:
    amount = txn.amount or Decimal("0")
    effect = Decimal("0")
    tx_type = txn.transaction_type

    source_account_id = txn.account_id
    counterparty_account_id = txn.counterparty_account_id

    if source_account_id in tracked_account_ids and source_account_id in asset_account_ids:
        if tx_type == TransactionType.INCOME.value:
            effect += amount
        elif tx_type in {
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.REPAYMENT_CREDIT_CARD.value,
            TransactionType.REPAYMENT_LOAN.value,
            TransactionType.INSTALLMENT_REPAYMENT.value,
            TransactionType.DEBT_LEND.value,
            TransactionType.DEBT_PAY_BACK.value,
        }:
            effect -= amount
        elif tx_type == TransactionType.TRANSFER.value:
            effect -= amount
        elif tx_type in {
            TransactionType.REFUND.value,
            TransactionType.DEBT_BORROW.value,
            TransactionType.DEBT_RECEIVE_BACK.value,
        }:
            effect += amount

    if (
        tx_type == TransactionType.TRANSFER.value
        and counterparty_account_id in tracked_account_ids
        and counterparty_account_id in asset_account_ids
    ):
        effect += amount

    return effect


def _build_daily_balance_points(
    start_date: date,
    end_date: date,
    ending_balance: Decimal,
    effects_by_day: dict[date, Decimal],
) -> list[dict]:
    balances_by_day = {end_date: ending_balance}
    cursor = end_date
    while cursor > start_date:
        previous_day = cursor - timedelta(days=1)
        balances_by_day[previous_day] = balances_by_day[cursor] - effects_by_day.get(cursor, Decimal("0"))
        cursor = previous_day

    points = []
    cursor = start_date
    while cursor <= end_date:
        points.append({
            "date": cursor.isoformat(),
            "label": cursor.strftime("%m-%d"),
            "balance": float(balances_by_day[cursor]),
        })
        cursor += timedelta(days=1)
    return points


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def _month_label(value: date) -> str:
    return value.strftime("%Y/%m")


def _build_month_sequence(end_date: date, total_months: int) -> list[date]:
    months: list[date] = []
    year = end_date.year
    month = end_date.month
    for _ in range(total_months):
        months.append(date(year, month, 1))
        if month == 1:
            year -= 1
            month = 12
        else:
            month -= 1
    months.reverse()
    return months


def _build_monthly_balance_points(
    end_date: date,
    ending_balance: Decimal,
    effects_by_month: dict[str, Decimal],
) -> list[dict]:
    months = _build_month_sequence(end_date, 12)
    current_month = date(end_date.year, end_date.month, 1)
    balances_by_month = {current_month: ending_balance}

    for index in range(len(months) - 1, 0, -1):
        current = months[index]
        previous = months[index - 1]
        balances_by_month[previous] = balances_by_month[current] - effects_by_month.get(_month_key(current), Decimal("0"))

    return [
        {
            "date": month.isoformat(),
            "label": _month_label(month),
            "balance": float(balances_by_month[month]),
        }
        for month in months
    ]


def get_account_balance_trend(
    db: Session,
    book_id: str,
    account_id: Optional[str] = None,
    days: int = 30,
):
    days = _validate_balance_trend_range(days)

    all_accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.is_active == True,
    ).order_by(Account.created_at.asc(), Account.name.asc()).all()
    asset_accounts = [account for account in all_accounts if _is_asset_account_type(account.account_type)]
    asset_account_ids = {account.id for account in asset_accounts}

    if account_id:
        target_account = next((account for account in asset_accounts if account.id == account_id), None)
        if not target_account:
            if any(account.id == account_id for account in all_accounts):
                raise ValueError("Only asset accounts support balance trend")
            raise ValueError("Account not found")
        tracked_accounts = [target_account]
        tracked_account_ids = {target_account.id}
        view_type = "account"
        current_balance = target_account.current_balance or Decimal("0")
    else:
        tracked_accounts = asset_accounts
        tracked_account_ids = asset_account_ids
        view_type = "total"
        current_balance = sum(
            ((account.current_balance or Decimal("0")) for account in tracked_accounts),
            Decimal("0"),
        )

    end_date = date.today()
    granularity = "month" if days == 365 else "day"
    start_date = (
        _build_month_sequence(end_date, 12)[0]
        if granularity == "month"
        else end_date - timedelta(days=days - 1)
    )

    points: list[dict]
    if tracked_account_ids:
        query = db.query(Transaction).filter(
            Transaction.book_id == book_id,
            Transaction.status == TransactionStatus.CONFIRMED.value,
            Transaction.occurred_at >= datetime.combine(start_date, time.min),
            Transaction.occurred_at <= datetime.combine(end_date, time.max),
            or_(
                Transaction.account_id.in_(tracked_account_ids),
                Transaction.counterparty_account_id.in_(tracked_account_ids),
            ),
        )
        transactions = query.all()
    else:
        transactions = []

    if granularity == "day":
        effects_by_day: dict[date, Decimal] = defaultdict(lambda: Decimal("0"))
        for txn in transactions:
            txn_date = txn.occurred_at.date()
            effects_by_day[txn_date] += _get_balance_effect_for_transaction(
                txn,
                tracked_account_ids,
                asset_account_ids,
            )
        points = _build_daily_balance_points(start_date, end_date, current_balance, effects_by_day)
    else:
        effects_by_month: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
        for txn in transactions:
            month_start = date(txn.occurred_at.year, txn.occurred_at.month, 1)
            effects_by_month[_month_key(month_start)] += _get_balance_effect_for_transaction(
                txn,
                tracked_account_ids,
                asset_account_ids,
            )
        points = _build_monthly_balance_points(end_date, current_balance, effects_by_month)

    start_balance = Decimal(str(points[0]["balance"])) if points else current_balance
    change_amount = current_balance - start_balance
    change_rate, change_rate_label = _format_change_rate(change_amount, start_balance)

    return {
        "view_type": view_type,
        "range": days,
        "granularity": granularity,
        "account": (
            {
                "id": tracked_accounts[0].id,
                "name": tracked_accounts[0].name,
                "account_type": tracked_accounts[0].account_type,
            }
            if account_id and tracked_accounts
            else None
        ),
        "accounts": [
            {
                "id": account.id,
                "name": account.name,
                "account_type": account.account_type,
                "current_balance": float(account.current_balance or Decimal("0")),
            }
            for account in asset_accounts
        ],
        "summary": {
            "current_balance": float(current_balance),
            "start_balance": float(start_balance),
            "change_amount": float(change_amount),
            "change_rate": change_rate,
            "change_rate_label": change_rate_label,
        },
        "points": points,
    }
