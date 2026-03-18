from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from src.common.enums import CategoryType
from src.core import ErrorCode, AppException, generate_uuid, NotFoundException
from src.common import from_json

from .models import Category
from .schemas import CategoryCreate, CategoryUpdate


def create_category(db: Session, book_id: str, data: CategoryCreate) -> Category:
    """Create new category"""
    # Check parent exists
    if data.parent_id:
        parent = db.query(Category).filter(
            Category.id == data.parent_id,
            Category.book_id == book_id
        ).first()
        if not parent:
            raise AppException(status_code=400, code=40001, message="Parent category not found")

    # Check name uniqueness within parent
    query = db.query(Category).filter(
        Category.book_id == book_id,
        Category.name == data.name,
        Category.category_type == data.category_type.value
    )
    if data.parent_id:
        query = query.filter(Category.parent_id == data.parent_id)
    else:
        query = query.filter(Category.parent_id.is_(None))

    existing = query.first()
    if existing:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="Category name already exists")

    category = Category(
        id=generate_uuid(),
        book_id=book_id,
        parent_id=data.parent_id,
        name=data.name,
        category_type=data.category_type.value,
        icon=data.icon,
        color=data.color,
        sort_order=data.sort_order,
        keywords=data.keywords,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def get_categories(db: Session, book_id: str, category_type: Optional[str] = None, include_inactive: bool = False) -> List[Category]:
    """Get all categories for book"""
    query = db.query(Category).filter(Category.book_id == book_id)
    if category_type:
        query = query.filter(Category.category_type == category_type)
    if not include_inactive:
        query = query.filter(Category.is_active == True)
    return query.order_by(Category.sort_order, Category.name).all()


def get_category(db: Session, category_id: str, book_id: str) -> Optional[Category]:
    """Get category by ID"""
    return db.query(Category).filter(
        Category.id == category_id,
        Category.book_id == book_id
    ).first()


def get_category_tree(db: Session, book_id: str, category_type: Optional[str] = None) -> List[Dict]:
    """Get category tree"""
    categories = get_categories(db, book_id, category_type)

    # Build tree
    category_map = {c.id: {**c.__dict__, "children": []} for c in categories}
    roots = []

    for c in categories:
        if c.parent_id and c.parent_id in category_map:
            category_map[c.parent_id]["children"].append(category_map[c.id])
        else:
            roots.append(category_map[c.id])

    return roots


def update_category(db: Session, category_id: str, book_id: str, data: CategoryUpdate) -> Category:
    """Update category"""
    category = get_category(db, category_id, book_id)
    if not category:
        raise NotFoundException("Category not found")

    # Prevent modifying system categories
    if category.is_system:
        raise AppException(status_code=400, code=40001, message="Cannot modify system category")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: str, book_id: str) -> None:
    """Delete (deactivate) category"""
    from src.modules.transactions.models import Transaction
    
    category = get_category(db, category_id, book_id)
    if not category:
        raise NotFoundException("Category not found")

    if category.is_system:
        raise AppException(status_code=400, code=40001, message="Cannot delete system category")

    # Check if category is in use (显式查询)
    used_count = db.query(Transaction).filter(
        Transaction.category_id == category_id,
        Transaction.book_id == book_id,
        Transaction.status == "confirmed"
    ).count()

    if used_count > 0:
        # 有交易使用，软删除（只标记不显示）
        category.is_active = False
    else:
        # 无交易使用，可以完全删除
        db.delete(category)

    db.commit()


def get_default_categories() -> List[Dict]:
    """Get default categories for seeding"""
    return [
        # Expense categories
        {"name": "餐饮", "category_type": CategoryType.EXPENSE, "icon": "🍽️", "color": "#FF6B6B", "children": [
            {"name": "早饭", "category_type": CategoryType.EXPENSE, "icon": "🍳"},
            {"name": "午饭", "category_type": CategoryType.EXPENSE, "icon": "🍱"},
            {"name": "晚饭", "category_type": CategoryType.EXPENSE, "icon": "🍲"},
            {"name": "饮料", "category_type": CategoryType.EXPENSE, "icon": "🥤"},
            {"name": "零食", "category_type": CategoryType.EXPENSE, "icon": "🍪"},
            {"name": "外卖", "category_type": CategoryType.EXPENSE, "icon": "🛵"},
        ]},
        {"name": "交通", "category_type": CategoryType.EXPENSE, "icon": "🚗", "color": "#4ECDC4", "children": [
            {"name": "公交地铁", "category_type": CategoryType.EXPENSE, "icon": "🚌"},
            {"name": "打车", "category_type": CategoryType.EXPENSE, "icon": "🚕"},
            {"name": "油费", "category_type": CategoryType.EXPENSE, "icon": "⛽"},
        ]},
        {"name": "购物", "category_type": CategoryType.EXPENSE, "icon": "🛍️", "color": "#95E1D3", "children": [
            {"name": "日用品", "category_type": CategoryType.EXPENSE, "icon": "🧴"},
            {"name": "服饰鞋包", "category_type": CategoryType.EXPENSE, "icon": "👔"},
            {"name": "数码产品", "category_type": CategoryType.EXPENSE, "icon": "📱"},
        ]},
        # Income categories
        {"name": "工资收入", "category_type": CategoryType.INCOME, "icon": "💰", "color": "#45B7D1", "children": [
            {"name": "基本工资", "category_type": CategoryType.INCOME, "icon": "💵"},
            {"name": "奖金", "category_type": CategoryType.INCOME, "icon": "🎁"},
        ]},
        {"name": "副业收入", "category_type": CategoryType.INCOME, "icon": "💼", "color": "#96CEB4", "children": [
            {"name": "兼职", "category_type": CategoryType.INCOME, "icon": "📝"},
            {"name": "咨询", "category_type": CategoryType.INCOME, "icon": "🎯"},
        ]},
    ]
