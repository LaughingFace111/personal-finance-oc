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
        # Income categories
        {"name": "职业薪水", "category_type": CategoryType.INCOME, "icon": "💰", "color": "#52c41a", "children": [
            {"name": "基本工资", "category_type": CategoryType.INCOME, "icon": "💵"},
            {"name": "绩效奖金", "category_type": CategoryType.INCOME, "icon": "🎁"},
            {"name": "年终奖/分红", "category_type": CategoryType.INCOME, "icon": "🧧"},
            {"name": "兼职副业", "category_type": CategoryType.INCOME, "icon": "💼"},
        ]},
        {"name": "理财投资", "category_type": CategoryType.INCOME, "icon": "📈", "color": "#1890ff", "children": [
            {"name": "存款利息", "category_type": CategoryType.INCOME, "icon": "🏦"},
            {"name": "基金/股票收益", "category_type": CategoryType.INCOME, "icon": "📊"},
            {"name": "理财回款", "category_type": CategoryType.INCOME, "icon": "💳"},
        ]},
        {"name": "额外收入", "category_type": CategoryType.INCOME, "icon": "💎", "color": "#722ed1", "children": [
            {"name": "补贴报销", "category_type": CategoryType.INCOME, "icon": "📝"},
            {"name": "红包礼金", "category_type": CategoryType.INCOME, "icon": "🧧"},
            {"name": "二手变卖", "category_type": CategoryType.INCOME, "icon": "🔄"},
            {"name": "退款/意外所得", "category_type": CategoryType.INCOME, "icon": "✨"},
        ]},
        
        # Expense categories
        {"name": "餐饮美食", "category_type": CategoryType.EXPENSE, "icon": "🍽️", "color": "#FF6B6B", "children": [
            {"name": "日常三餐", "category_type": CategoryType.EXPENSE, "icon": "🍳"},
            {"name": "外卖快餐", "category_type": CategoryType.EXPENSE, "icon": "🛵"},
            {"name": "聚餐宴请", "category_type": CategoryType.EXPENSE, "icon": "🎉"},
            {"name": "茶叶/咖啡/饮品", "category_type": CategoryType.EXPENSE, "icon": "☕"},
            {"name": "零食水果", "category_type": CategoryType.EXPENSE, "icon": "🍎"},
        ]},
        {"name": "居家生活", "category_type": CategoryType.EXPENSE, "icon": "🏠", "color": "#8B5CF6", "children": [
            {"name": "房租房贷", "category_type": CategoryType.EXPENSE, "icon": "🏦"},
            {"name": "水电燃气", "category_type": CategoryType.EXPENSE, "icon": "💡"},
            {"name": "物业宽带", "category_type": CategoryType.EXPENSE, "icon": "📶"},
            {"name": "家居日用/耗材", "category_type": CategoryType.EXPENSE, "icon": "🧴"},
        ]},
        {"name": "交通出行", "category_type": CategoryType.EXPENSE, "icon": "🚗", "color": "#4ECDC4", "children": [
            {"name": "公共交通", "category_type": CategoryType.EXPENSE, "icon": "🚌"},
            {"name": "打车/网约车", "category_type": CategoryType.EXPENSE, "icon": "🚕"},
            {"name": "停车/高速费", "category_type": CategoryType.EXPENSE, "icon": "🅿️"},
            {"name": "爱车养车", "category_type": CategoryType.EXPENSE, "icon": "🔧"},
            {"name": "加油/充电", "category_type": "expense", "icon": "⛽"},
        ]},
        {"name": "数码与摄影", "category_type": CategoryType.EXPENSE, "icon": "📱", "color": "#0EA5E9", "children": [
            {"name": "电脑/硬件外设", "category_type": CategoryType.EXPENSE, "icon": "💻"},
            {"name": "摄影器材", "category_type": CategoryType.EXPENSE, "icon": "📷"},
            {"name": "手机及配件", "category_type": CategoryType.EXPENSE, "icon": "📱"},
            {"name": "维修保养", "category_type": CategoryType.EXPENSE, "icon": "🔧"},
        ]},
        {"name": "娱乐休闲", "category_type": CategoryType.EXPENSE, "icon": "🎮", "color": "#F97316", "children": [
            {"name": "游戏与内购", "category_type": CategoryType.EXPENSE, "icon": "🎮"},
            {"name": "影视/软件订阅", "category_type": CategoryType.EXPENSE, "icon": "🎬"},
            {"name": "旅游度假", "category_type": CategoryType.EXPENSE, "icon": "✈️"},
            {"name": "运动健身", "category_type": CategoryType.EXPENSE, "icon": "🏃"},
        ]},
        {"name": "宠物开销", "category_type": CategoryType.EXPENSE, "icon": "🐕", "color": "#EC4899", "children": [
            {"name": "宠物主粮", "category_type": CategoryType.EXPENSE, "icon": "🥩"},
            {"name": "零食玩具", "category_type": CategoryType.EXPENSE, "icon": "🎾"},
            {"name": "洗护美容", "category_type": CategoryType.EXPENSE, "icon": "✂️"},
            {"name": "宠物医疗", "category_type": CategoryType.EXPENSE, "icon": "🏥"},
        ]},
        {"name": "服饰美妆", "category_type": CategoryType.EXPENSE, "icon": "👗", "color": "#D946EF", "children": [
            {"name": "衣物鞋包", "category_type": CategoryType.EXPENSE, "icon": "👔"},
            {"name": "护肤彩妆", "category_type": CategoryType.EXPENSE, "icon": "💄"},
            {"name": "美发理容", "category_type": CategoryType.EXPENSE, "icon": "💇"},
            {"name": "饰品配饰", "category_type": CategoryType.EXPENSE, "icon": "💍"},
        ]},
        {"name": "医疗健康", "category_type": CategoryType.EXPENSE, "icon": "🏥", "color": "#EF4444", "children": [
            {"name": "药品/保健品", "category_type": CategoryType.EXPENSE, "icon": "💊"},
            {"name": "门诊体检", "category_type": CategoryType.EXPENSE, "icon": "🩺"},
            {"name": "牙科医美", "category_type": CategoryType.EXPENSE, "icon": "🦷"},
        ]},
        {"name": "家庭与人情", "category_type": CategoryType.EXPENSE, "icon": "👨‍👩‍👧", "color": "#F59E0B", "children": [
            {"name": "伴侣/礼物", "category_type": CategoryType.EXPENSE, "icon": "🎁"},
            {"name": "孝敬长辈", "category_type": CategoryType.EXPENSE, "icon": "🏮"},
            {"name": "红包份子钱", "category_type": CategoryType.EXPENSE, "icon": "🧧"},
            {"name": "请客送礼", "category_type": CategoryType.EXPENSE, "icon": "🎉"},
        ]},
        {"name": "学习教育", "category_type": CategoryType.EXPENSE, "icon": "📚", "color": "#3B82F6", "children": [
            {"name": "书籍文具", "category_type": CategoryType.EXPENSE, "icon": "📖"},
            {"name": "课程培训", "category_type": CategoryType.EXPENSE, "icon": "🎓"},
            {"name": "专业资料/考证", "category_type": CategoryType.EXPENSE, "icon": "📄"},
        ]},
        {"name": "金融与其他", "category_type": CategoryType.EXPENSE, "icon": "💰", "color": "#6B7280", "children": [
            {"name": "商业保险", "category_type": CategoryType.EXPENSE, "icon": "🛡️"},
            {"name": "社保公积金", "category_type": CategoryType.EXPENSE, "icon": "🏦"},
            {"name": "手续费/利息", "category_type": CategoryType.EXPENSE, "icon": "💳"},
            {"name": "不明杂项/漏记", "category_type": CategoryType.EXPENSE, "icon": "❓"},
        ]},
    ]
