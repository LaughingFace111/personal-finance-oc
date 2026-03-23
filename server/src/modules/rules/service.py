import re
from typing import Dict, List, Optional, Union

from sqlalchemy.orm import Session

from src.core import generate_uuid, NotFoundException
from src.modules.tags.models import Tag

from .models import CategoryRule
from .schemas import CategoryRuleCreate, CategoryRuleUpdate
from .defaults import ensure_default_rules, ensure_default_tags


VALID_TARGET_TYPES = {"account", "category", "tag"}


def _normalize_targets(payload: Dict) -> Dict:
    normalized = dict(payload)
    target_type = normalized.get("target_type")
    if target_type == "account":
        normalized["target_category_id"] = None
        normalized["target_tag_id"] = None
    elif target_type == "category":
        normalized["target_account_id"] = None
        normalized["target_tag_id"] = None
    elif target_type == "tag":
        normalized["target_account_id"] = None
        normalized["target_category_id"] = None
    return normalized


def _validate_rule_target(data: Union[CategoryRuleCreate, CategoryRuleUpdate]) -> None:
    payload = data.model_dump(exclude_unset=True)
    target_type = payload.get("target_type")
    if target_type and target_type not in VALID_TARGET_TYPES:
        raise ValueError("Invalid target_type")

    if not target_type:
        return

    target_fields = {
        "account": payload.get("target_account_id"),
        "category": payload.get("target_category_id"),
        "tag": payload.get("target_tag_id"),
    }
    if not target_fields[target_type]:
        raise ValueError(f"Missing target for {target_type} rule")


def create_rule(db: Session, book_id: str, data: CategoryRuleCreate) -> CategoryRule:
    """Create keyword rule"""
    _validate_rule_target(data)
    payload = _normalize_targets(data.model_dump())
    rule = CategoryRule(
        id=generate_uuid(),
        book_id=book_id,
        rule_name=payload.get("rule_name"),
        match_field=payload.get("match_field"),
        match_type=payload.get("match_type"),
        match_value=payload.get("match_value"),
        target_type=payload.get("target_type"),
        target_category_id=payload.get("target_category_id"),
        target_account_id=payload.get("target_account_id"),
        target_tag_id=payload.get("target_tag_id"),
        priority=payload.get("priority", 0),
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

    next_payload = _normalize_targets(data.model_dump(exclude_unset=True))
    target_type = next_payload.get("target_type", rule.target_type)
    if target_type not in VALID_TARGET_TYPES:
        raise ValueError("Invalid target_type")
    if target_type == "account" and not next_payload.get("target_account_id", rule.target_account_id):
        raise ValueError("Missing target for account rule")
    if target_type == "category" and not next_payload.get("target_category_id", rule.target_category_id):
        raise ValueError("Missing target for category rule")
    if target_type == "tag" and not next_payload.get("target_tag_id", rule.target_tag_id):
        raise ValueError("Missing target for tag rule")

    for key, value in next_payload.items():
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


def _get_rule_text(rule: CategoryRule, source: Dict[str, str]) -> str:
    if rule.match_field == "merchant":
        return source.get("merchant", "")
    if rule.match_field == "description":
        return source.get("description", "")
    if rule.match_field == "counterparty":
        return source.get("counterparty", "")
    if rule.match_field == "account":
        return source.get("account", "")
    return " ".join(
        filter(
            None,
            [
                source.get("merchant", ""),
                source.get("description", ""),
                source.get("counterparty", ""),
                source.get("account", ""),
                source.get("category", ""),
            ],
        )
    )


def _is_rule_matched(rule: CategoryRule, source: Dict[str, str]) -> bool:
    text = _get_rule_text(rule, source).lower()
    match_value = (rule.match_value or "").lower()
    if not text.strip() or not match_value.strip():
        return False
    if rule.match_type == "exact":
        return text == match_value
    if rule.match_type == "contains":
        return match_value in text
    if rule.match_type == "regex":
        try:
            return bool(re.search(rule.match_value, text, re.IGNORECASE))
        except re.error:
            return False
    return False


def apply_rules(
    db: Session,
    book_id: str,
    merchant: str = "",
    description: str = "",
    counterparty: str = "",
    account: str = "",
    category: str = "",
    target_type: Optional[str] = None,
) -> dict:
    """Apply keyword rules to account/category/tag"""
    rules = get_rules(db, book_id, is_active=True)
    source = {
        "merchant": merchant or "",
        "description": description or "",
        "counterparty": counterparty or "",
        "account": account or "",
        "category": category or "",
    }
    tag_map = {
        tag.id: tag.name
        for tag in db.query(Tag).filter(Tag.book_id == book_id, Tag.is_active == True).all()
    }

    result = {"category_id": None, "account_id": None, "tag_name": None, "rule_id": None, "confidence": 0}
    for rule in rules:
        if target_type and rule.target_type != target_type:
            continue
        if not _is_rule_matched(rule, source):
            continue
        if rule.target_type == "account":
            return {
                "category_id": None,
                "account_id": rule.target_account_id,
                "tag_name": None,
                "rule_id": rule.id,
                "confidence": 95,
            }
        if rule.target_type == "category":
            return {
                "category_id": rule.target_category_id,
                "account_id": None,
                "tag_name": None,
                "rule_id": rule.id,
                "confidence": 95,
            }
        if rule.target_type == "tag":
            return {
                "category_id": None,
                "account_id": None,
                "tag_name": tag_map.get(rule.target_tag_id),
                "rule_id": rule.id,
                "confidence": 95,
            }
    return result


def bootstrap_default_rule_assets(db: Session, book_id: str) -> dict:
    parents = ensure_default_tags(db, book_id)
    created_rules = ensure_default_rules(db, book_id, parents)
    db.commit()
    return {"created_rules": created_rules, "tag_groups": len(parents)}
