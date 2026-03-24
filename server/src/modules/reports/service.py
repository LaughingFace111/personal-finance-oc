import json
from datetime import date, datetime, timedelta, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, alias
from sqlalchemy.orm import Session

from src.common.enums import TransactionType
from src.modules.categories.models import Category
from src.modules.tags.models import Tag
from src.modules.transactions.models import Transaction
from src.modules.accounts.models import Account
from src.modules.installments.models import InstallmentPlan, InstallmentSchedule
from src.modules.loans.models import LoanPlan, LoanSchedule


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
    return db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_(transaction_types),
        Transaction.direction == direction_value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= dt_from,
        Transaction.occurred_at <= dt_to,
    ).order_by(Transaction.occurred_at.desc(), Transaction.created_at.desc()).all()


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
    """
    # === 收入: 只计算 income 类型 ===
    income = db.query(func.sum(Transaction.amount)).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.INCOME.value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max)
    ).scalar() or Decimal("0")

    # === 支出: expense + fee + installment_purchase (毛支出) ===
    expense_txns = db.query(func.sum(Transaction.amount)).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_([
            TransactionType.EXPENSE.value,
            TransactionType.FEE.value,
            TransactionType.INSTALLMENT_PURCHASE.value
        ]),
        Transaction.status == "confirmed",
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max)
    ).scalar() or Decimal("0")

    # === 退款冲减: 通过 related_transaction_id 关联 ===
    # 查找该期间内有退款关联的消费
    refunds = db.query(
        Transaction.related_transaction_id,
        func.sum(Transaction.amount).label('refund_amount')
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == TransactionType.REFUND.value,
        Transaction.status == "confirmed",
        Transaction.occurred_at >= datetime.combine(date_from, time.min),
        Transaction.occurred_at <= datetime.combine(date_to, time.max),
        Transaction.related_transaction_id.isnot(None)
    ).group_by(Transaction.related_transaction_id).all()

    refund_deduction = sum(r.refund_amount for r in refunds)

    # 净支出 = 毛支出 - 退款冲减
    net_expense = expense_txns - refund_deduction

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

    return {
        "period": {"date_from": date_from, "date_to": date_to},
        "income": income,
        "gross_expense": expense_txns,
        "refund_deduction": refund_deduction,
        "net_expense": net_expense,
        "net": income - net_expense,
        "total_assets": total_asset,
        "total_credit_debt": total_credit_debt,
        "total_loan_debt": total_loan_debt,
        "total_debt": total_credit_debt + total_loan_debt,
    }


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

        # 收入统计
        income = db.query(func.sum(Transaction.amount)).filter(
            Transaction.book_id == book_id,
            Transaction.transaction_type == TransactionType.INCOME.value,
            Transaction.status == "confirmed",
            Transaction.occurred_at >= datetime.combine(month_start, time.min),
            Transaction.occurred_at <= datetime.combine(month_end, time.max)
        ).scalar() or Decimal("0")

        # 支出统计（毛支出）
        expense_txns = db.query(func.sum(Transaction.amount)).filter(
            Transaction.book_id == book_id,
            Transaction.transaction_type.in_([
                TransactionType.EXPENSE.value,
                TransactionType.FEE.value,
                TransactionType.INSTALLMENT_PURCHASE.value
            ]),
            Transaction.status == "confirmed",
            Transaction.occurred_at >= datetime.combine(month_start, time.min),
            Transaction.occurred_at <= datetime.combine(month_end, time.max)
        ).scalar() or Decimal("0")

        # 退款冲减
        refunds = db.query(
            Transaction.related_transaction_id,
            func.sum(Transaction.amount).label('refund_amount')
        ).filter(
            Transaction.book_id == book_id,
            Transaction.transaction_type == TransactionType.REFUND.value,
            Transaction.status == "confirmed",
            Transaction.occurred_at >= datetime.combine(month_start, time.min),
            Transaction.occurred_at <= datetime.combine(month_end, time.max),
            Transaction.related_transaction_id.isnot(None)
        ).group_by(Transaction.related_transaction_id).all()

        refund_deduction = sum(r.refund_amount for r in refunds)
        net_expense = expense_txns - refund_deduction

        income_val = float(income)
        expense_val = float(net_expense)
        net_val = income_val - expense_val

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
