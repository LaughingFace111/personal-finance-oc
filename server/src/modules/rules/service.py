import re
from typing import List, Optional

from sqlalchemy.orm import Session

from src.core import generate_uuid, NotFoundException

from .models import CategoryRule
from .schemas import CategoryRuleCreate, CategoryRuleUpdate


def create_rule(db: Session, book_id: str, data: CategoryRuleCreate) -> CategoryRule:
    """Create category rule"""
    rule = CategoryRule(
        id=generate_uuid(),
        book_id=book_id,
        rule_name=data.rule_name,
        match_field=data.match_field,
        match_type=data.match_type,
        match_value=data.match_value,
        target_category_id=data.target_category_id,
        target_account_id=data.target_account_id,
        priority=data.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def get_rules(db: Session, book_id: str, is_active: bool = None) -> List[CategoryRule]:
    """Get category rules"""
    query = db.query(CategoryRule).filter(CategoryRule.book_id == book_id)
    if is_active is not None:
        query = query.filter(CategoryRule.is_active == is_active)
    return query.order_by(CategoryRule.priority.desc()).all()


def get_rule(db: Session, rule_id: str, book_id: str) -> Optional[CategoryRule]:
    """Get rule by ID"""
    return db.query(CategoryRule).filter(
        CategoryRule.id == rule_id,
        CategoryRule.book_id == book_id
    ).first()


def update_rule(db: Session, rule_id: str, book_id: str, data: CategoryRuleUpdate) -> CategoryRule:
    """Update rule"""
    rule = get_rule(db, rule_id, book_id)
    if not rule:
        raise NotFoundException("Rule not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)

    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, rule_id: str, book_id: str) -> None:
    """Delete rule"""
    rule = get_rule(db, rule_id, book_id)
    if not rule:
        raise NotFoundException("Rule not found")

    db.delete(rule)
    db.commit()


def apply_rules(db: Session, book_id: str, merchant: str = "", description: str = "", counterparty: str = "") -> dict:
    """Apply rules to guess category/account"""
    rules = get_rules(db, book_id, is_active=True)

    text = f"{merchant} {description} {counterparty}".lower()

    for rule in rules:
        matched = False

        if rule.match_type == "exact":
            matched = text == rule.match_value.lower()
        elif rule.match_type == "contains":
            matched = rule.match_value.lower() in text
        elif rule.match_type == "regex":
            try:
                matched = bool(re.search(rule.match_value, text, re.IGNORECASE))
            except:
                pass

        if matched:
            return {
                "category_id": rule.target_category_id,
                "account_id": rule.target_account_id,
                "rule_id": rule.id,
                "confidence": 90  # High confidence for rule match
            }

    return {"category_id": None, "account_id": None, "rule_id": None, "confidence": 0}
