from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from src.core import generate_uuid
from src.modules.rules.models import CategoryRule
from src.modules.tags.models import Tag


DEFAULT_TAG_LIBRARY = [
    ("超市", "#52c41a", ["盒马", "永辉", "沃尔玛", "山姆", "物美", "大润发"]),
    ("餐馆", "#fa8c16", ["肯德基", "麦当劳", "必胜客", "海底捞", "西贝", "外婆家"]),
    ("奶茶", "#eb2f96", ["喜茶", "奈雪", "霸王茶姬", "沪上阿姨", "蜜雪冰城", "茶百道"]),
    ("咖啡", "#8c8c8c", ["星巴克", "瑞幸", "Manner", "库迪", "幸运咖"]),
    ("网购平台", "#1677ff", ["淘宝", "天猫", "拼多多", "京东", "唯品会", "抖音商城"]),
]


def _normalize_tag_name(name: Optional[str]) -> str:
    return (name or "").strip().lower()


def cleanup_default_tag_duplicates(db: Session, book_id: str) -> None:
    default_parent_names = {name for name, _, _ in DEFAULT_TAG_LIBRARY}
    default_child_names = {
        child_name
        for _, _, children in DEFAULT_TAG_LIBRARY
        for child_name in children
    }

    tags = db.query(Tag).filter(Tag.book_id == book_id, Tag.is_active == True).all()
    parent_groups: Dict[str, List[Tag]] = {}
    for tag in tags:
        if tag.parent_id is None and tag.name in default_parent_names:
            parent_groups.setdefault(tag.name, []).append(tag)

    canonical_parent_by_name: Dict[str, Tag] = {}
    changed = False
    for parent_name, group in parent_groups.items():
        canonical = sorted(group, key=lambda item: ((item.created_at or 0), item.id))[0]
        canonical_parent_by_name[parent_name] = canonical
        for duplicate in group:
            if duplicate.id == canonical.id:
                continue
            db.query(Tag).filter(
                Tag.book_id == book_id,
                Tag.parent_id == duplicate.id,
                Tag.is_active == True,
            ).update({"parent_id": canonical.id}, synchronize_session=False)
            db.query(CategoryRule).filter(
                CategoryRule.book_id == book_id,
                CategoryRule.target_tag_id == duplicate.id,
            ).update({"target_tag_id": canonical.id}, synchronize_session=False)
            duplicate.is_active = False
            changed = True

    if changed:
        db.flush()

    tags = db.query(Tag).filter(Tag.book_id == book_id, Tag.is_active == True).all()
    current_parents = {
        tag.name: tag
        for tag in tags
        if tag.parent_id is None and tag.name in default_parent_names
    }
    child_groups: Dict[tuple[str, str], List[Tag]] = {}
    for tag in tags:
        if tag.parent_id is None or tag.name not in default_child_names:
            continue
        parent = next((item for item in current_parents.values() if item.id == tag.parent_id), None)
        if not parent:
            continue
        child_groups.setdefault((parent.name, tag.name), []).append(tag)

    for (_, _), group in child_groups.items():
        canonical = sorted(group, key=lambda item: ((item.created_at or 0), item.id))[0]
        for duplicate in group:
            if duplicate.id == canonical.id:
                continue
            db.query(CategoryRule).filter(
                CategoryRule.book_id == book_id,
                CategoryRule.target_tag_id == duplicate.id,
            ).update({"target_tag_id": canonical.id}, synchronize_session=False)
            duplicate.is_active = False
            changed = True

    if changed:
        db.flush()


def ensure_default_tags(db: Session, book_id: str) -> Dict[str, Tag]:
    cleanup_default_tag_duplicates(db, book_id)
    tags = db.query(Tag).filter(Tag.book_id == book_id, Tag.is_active == True).all()
    by_parent_name = {tag.name: tag for tag in tags if not tag.parent_id}
    children_by_parent_id = {}
    for tag in tags:
        if tag.parent_id:
            children_by_parent_id.setdefault(tag.parent_id, {})[tag.name] = tag

    result: Dict[str, Tag] = {}
    changed = False
    for parent_name, color, children in DEFAULT_TAG_LIBRARY:
        parent = by_parent_name.get(parent_name)
        if not parent:
            parent = Tag(
                id=generate_uuid(),
                book_id=book_id,
                parent_id=None,
                name=parent_name,
                color=color,
                is_active=True,
            )
            db.add(parent)
            db.flush()
            changed = True
        result[parent_name] = parent

        existing_children = children_by_parent_id.get(parent.id, {})
        for child_name in children:
            if child_name in existing_children:
                continue
            db.add(
                Tag(
                    id=generate_uuid(),
                    book_id=book_id,
                    parent_id=parent.id,
                    name=child_name,
                    color=parent.color,
                    is_active=True,
                )
            )
            changed = True

    if changed:
        db.flush()
    return result


def build_default_tag_rules(tags_by_name: Dict[str, Tag]) -> List[dict]:
    rules: List[dict] = []
    for parent_name, _, children in DEFAULT_TAG_LIBRARY:
        parent = tags_by_name.get(parent_name)
        if not parent:
            continue
        rules.append(
            {
                "rule_name": f"{parent_name} -> {parent_name}",
                "match_field": "combined",
                "match_type": "contains",
                "match_value": parent_name,
                "target_type": "tag",
                "target_tag_id": parent.id,
                "priority": 80,
            }
        )
        for child_name in children:
            child = tags_by_name.get(child_name)
            if not child:
                continue
            rules.append(
                {
                    "rule_name": f"{child_name} -> {child_name}",
                    "match_field": "combined",
                    "match_type": "contains",
                    "match_value": child_name,
                    "target_type": "tag",
                    "target_tag_id": child.id,
                    "priority": 100,
                }
            )
    return rules


def ensure_default_rules(db: Session, book_id: str, default_parents: Optional[Dict[str, Tag]] = None) -> int:
    parents = default_parents or ensure_default_tags(db, book_id)
    tags_by_name = {
        tag.name: tag
        for tag in db.query(Tag).filter(Tag.book_id == book_id, Tag.is_active == True).all()
    }
    existing_rules = db.query(CategoryRule).filter(CategoryRule.book_id == book_id).all()
    existing_keys = {
        (
            rule.target_type,
            rule.match_field,
            rule.match_type,
            (rule.match_value or "").strip().lower(),
            rule.target_category_id,
            rule.target_account_id,
            rule.target_tag_id,
        )
        for rule in existing_rules
    }

    created = 0
    for rule_data in build_default_tag_rules(tags_by_name):
        key = (
            rule_data["target_type"],
            rule_data["match_field"],
            rule_data["match_type"],
            rule_data["match_value"].strip().lower(),
            rule_data.get("target_category_id"),
            rule_data.get("target_account_id"),
            rule_data.get("target_tag_id"),
        )
        if key in existing_keys:
            continue
        db.add(
            CategoryRule(
                id=generate_uuid(),
                book_id=book_id,
                rule_name=rule_data["rule_name"],
                match_field=rule_data["match_field"],
                match_type=rule_data["match_type"],
                match_value=rule_data["match_value"],
                target_type=rule_data["target_type"],
                target_category_id=rule_data.get("target_category_id"),
                target_account_id=rule_data.get("target_account_id"),
                target_tag_id=rule_data.get("target_tag_id"),
                priority=rule_data.get("priority", 0),
                is_active=True,
            )
        )
        existing_keys.add(key)
        created += 1

    return created
