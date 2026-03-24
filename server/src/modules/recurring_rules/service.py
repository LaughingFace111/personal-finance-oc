from calendar import monthrange
from datetime import date, timedelta
from typing import List, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from src.core import NotFoundException, generate_uuid

from .models import RecurringRule
from .schemas import RecurringRuleCreate, RecurringRuleUpdate


VALID_SCHEDULE_TYPES = {"daily", "weekly", "monthly"}


def _align_month_day(value: date, day_of_month: Optional[int]) -> date:
    if not day_of_month:
        return value
    last_day = monthrange(value.year, value.month)[1]
    return value.replace(day=min(day_of_month, last_day))


def calculate_next_occurs_on(
    start_date: date,
    schedule_type: str,
    interval_value: int,
    day_of_month: Optional[int] = None,
    weekday: Optional[int] = None,
    after_date: Optional[date] = None,
) -> date:
    if schedule_type not in VALID_SCHEDULE_TYPES:
        raise ValueError("Unsupported schedule_type")

    next_date = start_date
    if schedule_type == "monthly":
        next_date = _align_month_day(next_date, day_of_month)
    elif schedule_type == "weekly" and weekday is not None:
        next_date = next_date + timedelta(days=(weekday - next_date.weekday()) % 7)

    boundary = after_date or start_date
    while next_date < boundary:
        if schedule_type == "daily":
            next_date = next_date + timedelta(days=interval_value)
        elif schedule_type == "weekly":
            next_date = next_date + timedelta(weeks=interval_value)
            if weekday is not None:
                next_date = next_date + timedelta(days=(weekday - next_date.weekday()) % 7)
        else:
            next_date = _align_month_day(next_date + relativedelta(months=interval_value), day_of_month)
    return next_date


def create_recurring_rule(db: Session, book_id: str, data: RecurringRuleCreate) -> RecurringRule:
    next_occurs_on = calculate_next_occurs_on(
        start_date=data.start_date,
        schedule_type=data.schedule_type,
        interval_value=data.interval_value,
        day_of_month=data.day_of_month,
        weekday=data.weekday,
    )
    rule = RecurringRule(
        id=generate_uuid(),
        book_id=book_id,
        next_occurs_on=next_occurs_on,
        **data.model_dump(mode="json"),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_recurring_rules(db: Session, book_id: str, is_active: bool = None) -> List[RecurringRule]:
    query = db.query(RecurringRule).filter(RecurringRule.book_id == book_id)
    if is_active is not None:
        query = query.filter(RecurringRule.is_active == is_active)
    return query.order_by(RecurringRule.next_occurs_on.asc(), RecurringRule.created_at.desc()).all()


def get_recurring_rule(db: Session, rule_id: str, book_id: str) -> Optional[RecurringRule]:
    return db.query(RecurringRule).filter(
        RecurringRule.id == rule_id,
        RecurringRule.book_id == book_id,
    ).first()


def update_recurring_rule(db: Session, rule_id: str, book_id: str, data: RecurringRuleUpdate) -> RecurringRule:
    rule = get_recurring_rule(db, rule_id, book_id)
    if not rule:
        raise NotFoundException("Recurring rule not found")

    payload = data.model_dump(exclude_unset=True, mode="json")
    for key, value in payload.items():
        setattr(rule, key, value)

    if {"start_date", "schedule_type", "interval_value", "day_of_month", "weekday"} & set(payload.keys()):
        rule.next_occurs_on = calculate_next_occurs_on(
            start_date=rule.start_date,
            schedule_type=rule.schedule_type,
            interval_value=rule.interval_value,
            day_of_month=rule.day_of_month,
            weekday=rule.weekday,
            after_date=max(rule.start_date, rule.last_generated_on or rule.start_date),
        )

    db.commit()
    db.refresh(rule)
    return rule


def delete_recurring_rule(db: Session, rule_id: str, book_id: str) -> None:
    rule = get_recurring_rule(db, rule_id, book_id)
    if not rule:
        raise NotFoundException("Recurring rule not found")
    db.delete(rule)
    db.commit()
