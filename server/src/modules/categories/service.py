from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.common.enums import CategoryType
from src.core import ErrorCode, AppException, generate_uuid, NotFoundException
from src.common import from_json
from src.modules.transactions.models import Transaction

from .models import Category
from .schemas import CategoryCreate, CategoryUpdate


def _normalize_category_type(category_type) -> str:
    return category_type.value if hasattr(category_type, "value") else category_type


def create_category(db: Session, book_id: str, data: CategoryCreate) -> Category:
    """Create new category"""
    # Check parent exists
    if data.parent_id:
        parent = db.query(Category).filter(
            Category.id == data.parent_id,
            Category.book_id == book_id,
            Category.is_deleted == False
        ).first()
        if not parent:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="父级分类不存在")
        if parent.category_type != _normalize_category_type(data.category_type):
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="父级分类与当前分类类型不一致，拒绝创建/修改")

    existing = db.query(Category).filter(
        Category.book_id == book_id,
        Category.name == data.name,
        Category.category_type == _normalize_category_type(data.category_type),
        Category.is_deleted == False
    ).first()
    if existing:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="该分类名称已存在（包含已停用分类）")

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
    query = db.query(Category).filter(
        Category.book_id == book_id,
        Category.is_deleted == False
    )
    if category_type:
        query = query.filter(Category.category_type == category_type)
    if not include_inactive:
        query = query.filter(Category.is_active == True)
    return query.order_by(Category.sort_order, Category.name).all()


def get_category(db: Session, category_id: str, book_id: str) -> Optional[Category]:
    """Get category by ID"""
    return db.query(Category).filter(
        Category.id == category_id,
        Category.book_id == book_id,
        Category.is_deleted == False
    ).first()


def get_frequent_categories(db: Session, book_id: str, limit: int = 10) -> List[Dict]:
    """Get categories ranked by usage in the last 90 days"""
    cutoff = datetime.utcnow() - timedelta(days=90)
    rows = db.query(
        Category,
        func.count(Transaction.id).label("usage_count")
    ).join(
        Transaction,
        Transaction.category_id == Category.id
    ).filter(
        Category.book_id == book_id,
        Category.is_deleted == False,
        Transaction.book_id == book_id,
        Transaction.occurred_at >= cutoff,
        Transaction.category_id.isnot(None)
    ).group_by(Category.id).order_by(
        func.count(Transaction.id).desc(),
        Category.name.asc()
    ).limit(limit).all()

    return [
        {
            "id": category.id,
            "book_id": category.book_id,
            "name": category.name,
            "category_type": category.category_type,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "color": category.color,
            "sort_order": category.sort_order,
            "keywords": category.keywords,
            "usage_count": usage_count,
            "is_system": category.is_system,
            "is_active": category.is_active,
            "is_deleted": category.is_deleted,
            "created_at": category.created_at,
            "updated_at": category.updated_at,
        }
        for category, usage_count in rows
    ]


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

    updates = data.model_dump(exclude_unset=True)
    next_type = _normalize_category_type(updates.get("category_type", category.category_type))
    next_parent_id = updates.get("parent_id", category.parent_id)

    if next_parent_id:
        parent = db.query(Category).filter(
            Category.id == next_parent_id,
            Category.book_id == book_id,
            Category.is_deleted == False
        ).first()
        if not parent:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="父级分类不存在")
        if parent.id == category.id:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="父级分类不能是自己")
        if parent.category_type != next_type:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="父级分类与当前分类类型不一致，拒绝创建/修改")

    if next_type != category.category_type:
        child_exists = db.query(Category).filter(
            Category.parent_id == category.id,
            Category.book_id == book_id,
            Category.is_deleted == False
        ).first()
        if child_exists:
            raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="当前分类存在子分类，不能直接修改分类类型")

    next_name = updates.get("name", category.name)
    duplicate = db.query(Category).filter(
        Category.book_id == book_id,
        Category.name == next_name,
        Category.category_type == next_type,
        Category.is_deleted == False,
        Category.id != category.id
    ).first()
    if duplicate:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="该分类名称已存在（包含已停用分类）")

    for key, value in updates.items():
        if key == "category_type":
            value = next_type
        setattr(category, key, value)

    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, category_id: str, book_id: str) -> None:
    """Soft delete category after integrity checks"""
    from src.modules.transactions.models import Transaction

    category = get_category(db, category_id, book_id)
    if not category:
        raise NotFoundException("Category not found")

    if category.is_system:
        raise AppException(status_code=400, code=40001, message="Cannot delete system category")

    child_exists = db.query(Category).filter(
        Category.parent_id == category_id,
        Category.book_id == book_id,
        Category.is_deleted == False
    ).first()
    if child_exists:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="该分类下仍有子分类，无法删除")

    transaction_exists = db.query(Transaction).filter(
        Transaction.category_id == category_id,
        Transaction.book_id == book_id
    ).first()
    if transaction_exists:
        raise AppException(status_code=400, code=ErrorCode.INVALID_PARAMS, message="该分类已被交易记录使用，无法删除")

    category.is_deleted = True

    db.commit()


def get_default_categories() -> List[Dict]:
    """Get default categories for seeding"""
    return [
        # Expense categories
        {"name": "餐饮食品", "category_type": CategoryType.EXPENSE, "icon": "🍜", "children": [
            {"name": "早餐", "category_type": CategoryType.EXPENSE, "icon": "🍜"},
            {"name": "午餐", "category_type": CategoryType.EXPENSE, "icon": "🍜"},
            {"name": "晚餐", "category_type": CategoryType.EXPENSE, "icon": "🍜"},
            {"name": "夜宵", "category_type": CategoryType.EXPENSE, "icon": "🍜"},
            {"name": "咖啡", "category_type": CategoryType.EXPENSE, "icon": "☕"},
            {"name": "奶茶", "category_type": CategoryType.EXPENSE, "icon": "🧋"},
            {"name": "酒水", "category_type": CategoryType.EXPENSE, "icon": "🍺"},
            {"name": "零食", "category_type": CategoryType.EXPENSE, "icon": "🍪"},
            {"name": "水果", "category_type": CategoryType.EXPENSE, "icon": "🍎"},
            {"name": "买菜", "category_type": CategoryType.EXPENSE, "icon": "🥬"},
            {"name": "烘焙甜品", "category_type": CategoryType.EXPENSE, "icon": "🍰"},
            {"name": "预制食品", "category_type": CategoryType.EXPENSE, "icon": "🥡"},
        ]},
        {"name": "居住住房", "category_type": CategoryType.EXPENSE, "icon": "🏠", "children": [
            {"name": "房租", "category_type": CategoryType.EXPENSE, "icon": "🏠"},
            {"name": "物业费", "category_type": CategoryType.EXPENSE, "icon": "🏢"},
            {"name": "水费", "category_type": CategoryType.EXPENSE, "icon": "💧"},
            {"name": "电费", "category_type": CategoryType.EXPENSE, "icon": "💡"},
            {"name": "燃气费", "category_type": CategoryType.EXPENSE, "icon": "🔥"},
            {"name": "取暖费", "category_type": CategoryType.EXPENSE, "icon": "♨️"},
            {"name": "宽带费", "category_type": CategoryType.EXPENSE, "icon": "📶"},
            {"name": "房屋维修", "category_type": CategoryType.EXPENSE, "icon": "🔧"},
            {"name": "搬家费", "category_type": CategoryType.EXPENSE, "icon": "📦"},
            {"name": "房屋中介费", "category_type": CategoryType.EXPENSE, "icon": "🧾"},
        ]},
        {"name": "家居日用", "category_type": CategoryType.EXPENSE, "icon": "🧴", "children": [
            {"name": "纸品", "category_type": CategoryType.EXPENSE, "icon": "🧻"},
            {"name": "清洁剂", "category_type": CategoryType.EXPENSE, "icon": "🧼"},
            {"name": "洗衣用品", "category_type": CategoryType.EXPENSE, "icon": "🫧"},
            {"name": "厨房耗材", "category_type": CategoryType.EXPENSE, "icon": "🍽️"},
            {"name": "餐具", "category_type": CategoryType.EXPENSE, "icon": "🍴"},
            {"name": "收纳用品", "category_type": CategoryType.EXPENSE, "icon": "🧺"},
            {"name": "床上用品", "category_type": CategoryType.EXPENSE, "icon": "🛏️"},
            {"name": "毛巾浴巾", "category_type": CategoryType.EXPENSE, "icon": "🧽"},
            {"name": "家具", "category_type": CategoryType.EXPENSE, "icon": "🪑"},
            {"name": "灯具", "category_type": CategoryType.EXPENSE, "icon": "🛋️"},
            {"name": "小型家居配件", "category_type": CategoryType.EXPENSE, "icon": "🪴"},
        ]},
        {"name": "通讯网络", "category_type": CategoryType.EXPENSE, "icon": "📱", "children": [
            {"name": "手机话费", "category_type": CategoryType.EXPENSE, "icon": "📞"},
            {"name": "云存储订阅", "category_type": CategoryType.EXPENSE, "icon": "☁️"},
            {"name": "网络工具订阅", "category_type": CategoryType.EXPENSE, "icon": "🌐"},
        ]},
        {"name": "日常通勤", "category_type": CategoryType.EXPENSE, "icon": "🚌", "children": [
            {"name": "公交", "category_type": CategoryType.EXPENSE, "icon": "🚌"},
            {"name": "地铁", "category_type": CategoryType.EXPENSE, "icon": "🚇"},
            {"name": "打车", "category_type": CategoryType.EXPENSE, "icon": "🚕"},
            {"name": "网约车", "category_type": CategoryType.EXPENSE, "icon": "🚘"},
            {"name": "共享单车", "category_type": CategoryType.EXPENSE, "icon": "🚲"},
            {"name": "共享电单车", "category_type": CategoryType.EXPENSE, "icon": "🛵"},
            {"name": "通勤火车", "category_type": CategoryType.EXPENSE, "icon": "🚆"},
            {"name": "通勤轮渡", "category_type": CategoryType.EXPENSE, "icon": "⛴️"},
        ]},
        {"name": "车辆使用", "category_type": CategoryType.EXPENSE, "icon": "🚗", "children": [
            {"name": "加油费", "category_type": CategoryType.EXPENSE, "icon": "⛽"},
            {"name": "充电费", "category_type": CategoryType.EXPENSE, "icon": "🔋"},
            {"name": "停车费", "category_type": CategoryType.EXPENSE, "icon": "🅿️"},
            {"name": "过路费", "category_type": CategoryType.EXPENSE, "icon": "🛣️"},
            {"name": "洗车", "category_type": CategoryType.EXPENSE, "icon": "🧽"},
            {"name": "保养", "category_type": CategoryType.EXPENSE, "icon": "🛠️"},
            {"name": "维修", "category_type": CategoryType.EXPENSE, "icon": "🔧"},
            {"name": "年检", "category_type": CategoryType.EXPENSE, "icon": "📋"},
            {"name": "车险", "category_type": CategoryType.EXPENSE, "icon": "🛡️"},
            {"name": "违章罚款", "category_type": CategoryType.EXPENSE, "icon": "🚨"},
            {"name": "车品配件", "category_type": CategoryType.EXPENSE, "icon": "🧰"},
        ]},
        {"name": "服饰鞋包", "category_type": CategoryType.EXPENSE, "icon": "👗", "children": [
            {"name": "上衣", "category_type": CategoryType.EXPENSE, "icon": "👕"},
            {"name": "裤装", "category_type": CategoryType.EXPENSE, "icon": "👖"},
            {"name": "裙装", "category_type": CategoryType.EXPENSE, "icon": "👗"},
            {"name": "内衣", "category_type": CategoryType.EXPENSE, "icon": "🩲"},
            {"name": "睡衣", "category_type": CategoryType.EXPENSE, "icon": "🛌"},
            {"name": "鞋子", "category_type": CategoryType.EXPENSE, "icon": "👟"},
            {"name": "包", "category_type": CategoryType.EXPENSE, "icon": "👜"},
            {"name": "帽子", "category_type": CategoryType.EXPENSE, "icon": "🧢"},
            {"name": "围巾", "category_type": CategoryType.EXPENSE, "icon": "🧣"},
            {"name": "首饰配件", "category_type": CategoryType.EXPENSE, "icon": "💍"},
            {"name": "眼镜", "category_type": CategoryType.EXPENSE, "icon": "👓"},
        ]},
        {"name": "美妆护理", "category_type": CategoryType.EXPENSE, "icon": "💄", "children": [
            {"name": "护肤品", "category_type": CategoryType.EXPENSE, "icon": "🧴"},
            {"name": "彩妆", "category_type": CategoryType.EXPENSE, "icon": "💄"},
            {"name": "卸妆清洁", "category_type": CategoryType.EXPENSE, "icon": "🫧"},
            {"name": "洗发护发", "category_type": CategoryType.EXPENSE, "icon": "🧼"},
            {"name": "身体护理", "category_type": CategoryType.EXPENSE, "icon": "🛁"},
            {"name": "口腔护理", "category_type": CategoryType.EXPENSE, "icon": "🪥"},
            {"name": "理发", "category_type": CategoryType.EXPENSE, "icon": "✂️"},
            {"name": "美甲", "category_type": CategoryType.EXPENSE, "icon": "💅"},
            {"name": "美容", "category_type": CategoryType.EXPENSE, "icon": "✨"},
            {"name": "香水", "category_type": CategoryType.EXPENSE, "icon": "🌸"},
        ]},
        {"name": "医疗健康", "category_type": CategoryType.EXPENSE, "icon": "🏥", "children": [
            {"name": "挂号", "category_type": CategoryType.EXPENSE, "icon": "📝"},
            {"name": "门诊", "category_type": CategoryType.EXPENSE, "icon": "🩺"},
            {"name": "住院", "category_type": CategoryType.EXPENSE, "icon": "🛏️"},
            {"name": "药品", "category_type": CategoryType.EXPENSE, "icon": "💊"},
            {"name": "检查检验", "category_type": CategoryType.EXPENSE, "icon": "🔬"},
            {"name": "体检", "category_type": CategoryType.EXPENSE, "icon": "📋"},
            {"name": "疫苗", "category_type": CategoryType.EXPENSE, "icon": "💉"},
            {"name": "牙科", "category_type": CategoryType.EXPENSE, "icon": "🦷"},
            {"name": "中医调理", "category_type": CategoryType.EXPENSE, "icon": "🌿"},
            {"name": "保健品", "category_type": CategoryType.EXPENSE, "icon": "🍵"},
            {"name": "医疗器械", "category_type": CategoryType.EXPENSE, "icon": "🩹"},
        ]},
        {"name": "运动健身", "category_type": CategoryType.EXPENSE, "icon": "🏃", "children": [
            {"name": "健身房会籍", "category_type": CategoryType.EXPENSE, "icon": "🏋️"},
            {"name": "私教课程", "category_type": CategoryType.EXPENSE, "icon": "🎯"},
            {"name": "团课", "category_type": CategoryType.EXPENSE, "icon": "👥"},
            {"name": "跑步装备", "category_type": CategoryType.EXPENSE, "icon": "👟"},
            {"name": "球类装备", "category_type": CategoryType.EXPENSE, "icon": "🏀"},
            {"name": "户外装备", "category_type": CategoryType.EXPENSE, "icon": "🎒"},
            {"name": "运动服", "category_type": CategoryType.EXPENSE, "icon": "👕"},
            {"name": "运动鞋", "category_type": CategoryType.EXPENSE, "icon": "👟"},
            {"name": "赛事报名", "category_type": CategoryType.EXPENSE, "icon": "🏅"},
            {"name": "泳池门票", "category_type": CategoryType.EXPENSE, "icon": "🏊"},
        ]},
        {"name": "学习成长", "category_type": CategoryType.EXPENSE, "icon": "📚", "children": [
            {"name": "书籍", "category_type": CategoryType.EXPENSE, "icon": "📚"},
            {"name": "电子书", "category_type": CategoryType.EXPENSE, "icon": "📖"},
        ]},
        {"name": "数码设备", "category_type": CategoryType.EXPENSE, "icon": "📱", "children": [
            {"name": "手机", "category_type": CategoryType.EXPENSE, "icon": "📱"},
            {"name": "电脑", "category_type": CategoryType.EXPENSE, "icon": "💻"},
            {"name": "平板", "category_type": CategoryType.EXPENSE, "icon": "📟"},
            {"name": "相机", "category_type": CategoryType.EXPENSE, "icon": "📷"},
            {"name": "耳机", "category_type": CategoryType.EXPENSE, "icon": "🎧"},
            {"name": "智能手表", "category_type": CategoryType.EXPENSE, "icon": "⌚"},
            {"name": "显示器", "category_type": CategoryType.EXPENSE, "icon": "🖥️"},
            {"name": "键盘", "category_type": CategoryType.EXPENSE, "icon": "⌨️"},
            {"name": "鼠标", "category_type": CategoryType.EXPENSE, "icon": "🖱️"},
            {"name": "硬盘", "category_type": CategoryType.EXPENSE, "icon": "💾"},
            {"name": "数据线", "category_type": CategoryType.EXPENSE, "icon": "🔌"},
            {"name": "充电器", "category_type": CategoryType.EXPENSE, "icon": "🔋"},
            {"name": "数码维修", "category_type": CategoryType.EXPENSE, "icon": "🛠️"},
            {"name": "软件购买", "category_type": CategoryType.EXPENSE, "icon": "🧩"},
        ]},
        {"name": "家用电器", "category_type": CategoryType.EXPENSE, "icon": "🏠", "children": [
            {"name": "冰箱", "category_type": CategoryType.EXPENSE, "icon": "🧊"},
            {"name": "洗衣机", "category_type": CategoryType.EXPENSE, "icon": "🧺"},
            {"name": "空调", "category_type": CategoryType.EXPENSE, "icon": "❄️"},
            {"name": "热水器", "category_type": CategoryType.EXPENSE, "icon": "🚿"},
            {"name": "吸尘器", "category_type": CategoryType.EXPENSE, "icon": "🧹"},
            {"name": "电饭煲", "category_type": CategoryType.EXPENSE, "icon": "🍚"},
            {"name": "微波炉", "category_type": CategoryType.EXPENSE, "icon": "📻"},
            {"name": "空气炸锅", "category_type": CategoryType.EXPENSE, "icon": "🍟"},
            {"name": "电风扇", "category_type": CategoryType.EXPENSE, "icon": "🌀"},
            {"name": "净水器", "category_type": CategoryType.EXPENSE, "icon": "🚰"},
            {"name": "小家电维修", "category_type": CategoryType.EXPENSE, "icon": "🔧"},
        ]},
        {"name": "娱乐休闲", "category_type": CategoryType.EXPENSE, "icon": "🎮", "children": [
            {"name": "电影", "category_type": CategoryType.EXPENSE, "icon": "🎬"},
            {"name": "演出", "category_type": CategoryType.EXPENSE, "icon": "🎭"},
            {"name": "展览", "category_type": CategoryType.EXPENSE, "icon": "🖼️"},
            {"name": "KTV", "category_type": CategoryType.EXPENSE, "icon": "🎤"},
            {"name": "密室", "category_type": CategoryType.EXPENSE, "icon": "🗝️"},
            {"name": "桌游", "category_type": CategoryType.EXPENSE, "icon": "🎲"},
            {"name": "游戏充值", "category_type": CategoryType.EXPENSE, "icon": "🕹️"},
            {"name": "游戏购买", "category_type": CategoryType.EXPENSE, "icon": "🎮"},
            {"name": "直播打赏", "category_type": CategoryType.EXPENSE, "icon": "📺"},
            {"name": "视频会员", "category_type": CategoryType.EXPENSE, "icon": "🎞️"},
            {"name": "音乐会员", "category_type": CategoryType.EXPENSE, "icon": "🎵"},
            {"name": "阅读会员", "category_type": CategoryType.EXPENSE, "icon": "📚"},
        ]},
        {"name": "旅行度假", "category_type": CategoryType.EXPENSE, "icon": "✈️", "children": [
            {"name": "机票", "category_type": CategoryType.EXPENSE, "icon": "✈️"},
            {"name": "高铁票", "category_type": CategoryType.EXPENSE, "icon": "🚄"},
            {"name": "火车票", "category_type": CategoryType.EXPENSE, "icon": "🚆"},
            {"name": "酒店", "category_type": CategoryType.EXPENSE, "icon": "🏨"},
            {"name": "民宿", "category_type": CategoryType.EXPENSE, "icon": "🏡"},
            {"name": "景点门票", "category_type": CategoryType.EXPENSE, "icon": "🎫"},
            {"name": "签证", "category_type": CategoryType.EXPENSE, "icon": "🛂"},
            {"name": "旅行保险", "category_type": CategoryType.EXPENSE, "icon": "🛡️"},
            {"name": "当地交通", "category_type": CategoryType.EXPENSE, "icon": "🚕"},
            {"name": "行李额", "category_type": CategoryType.EXPENSE, "icon": "🧳"},
            {"name": "境外通讯", "category_type": CategoryType.EXPENSE, "icon": "📡"},
            {"name": "旅行购物", "category_type": CategoryType.EXPENSE, "icon": "🛍️"},
        ]},
        {"name": "人情社交", "category_type": CategoryType.EXPENSE, "icon": "🎁", "children": [
            {"name": "生日礼物", "category_type": CategoryType.EXPENSE, "icon": "🎂"},
            {"name": "节日礼物", "category_type": CategoryType.EXPENSE, "icon": "🎁"},
            {"name": "婚礼礼金", "category_type": CategoryType.EXPENSE, "icon": "💒"},
            {"name": "满月礼金", "category_type": CategoryType.EXPENSE, "icon": "👶"},
            {"name": "探望礼品", "category_type": CategoryType.EXPENSE, "icon": "🧺"},
            {"name": "请客吃饭", "category_type": CategoryType.EXPENSE, "icon": "🍽️"},
            {"name": "聚会分摊", "category_type": CategoryType.EXPENSE, "icon": "🥂"},
            {"name": "红包支出", "category_type": CategoryType.EXPENSE, "icon": "🧧"},
            {"name": "人情往来快递", "category_type": CategoryType.EXPENSE, "icon": "📦"},
        ]},
        {"name": "宠物", "category_type": CategoryType.EXPENSE, "icon": "🐕", "children": [
            {"name": "宠物主粮", "category_type": CategoryType.EXPENSE, "icon": "🥣"},
            {"name": "宠物零食", "category_type": CategoryType.EXPENSE, "icon": "🦴"},
            {"name": "宠物用品", "category_type": CategoryType.EXPENSE, "icon": "🪀"},
            {"name": "宠物洗护", "category_type": CategoryType.EXPENSE, "icon": "🛁"},
            {"name": "宠物医疗", "category_type": CategoryType.EXPENSE, "icon": "🏥"},
            {"name": "宠物疫苗", "category_type": CategoryType.EXPENSE, "icon": "💉"},
            {"name": "宠物寄养", "category_type": CategoryType.EXPENSE, "icon": "🏠"},
            {"name": "宠物训练", "category_type": CategoryType.EXPENSE, "icon": "🦮"},
        ]},
        {"name": "保险保障", "category_type": CategoryType.EXPENSE, "icon": "🛡️", "children": [
            {"name": "医疗险", "category_type": CategoryType.EXPENSE, "icon": "🏥"},
            {"name": "重疾险", "category_type": CategoryType.EXPENSE, "icon": "❤️"},
            {"name": "意外险", "category_type": CategoryType.EXPENSE, "icon": "⚠️"},
            {"name": "寿险", "category_type": CategoryType.EXPENSE, "icon": "👪"},
            {"name": "家财险", "category_type": CategoryType.EXPENSE, "icon": "🏠"},
            {"name": "宠物险", "category_type": CategoryType.EXPENSE, "icon": "🐾"},
            {"name": "出行险", "category_type": CategoryType.EXPENSE, "icon": "✈️"},
        ]},
        {"name": "金融税费", "category_type": CategoryType.EXPENSE, "icon": "💰", "children": [
            {"name": "银行手续费", "category_type": CategoryType.EXPENSE, "icon": "🏦"},
            {"name": "信用卡年费", "category_type": CategoryType.EXPENSE, "icon": "💳"},
            {"name": "汇款手续费", "category_type": CategoryType.EXPENSE, "icon": "💸"},
            {"name": "提现手续费", "category_type": CategoryType.EXPENSE, "icon": "🏧"},
            {"name": "账户管理费", "category_type": CategoryType.EXPENSE, "icon": "📒"},
            {"name": "滞纳金", "category_type": CategoryType.EXPENSE, "icon": "⏰"},
            {"name": "违约金", "category_type": CategoryType.EXPENSE, "icon": "📄"},
        ]},
        {"name": "公共服务", "category_type": CategoryType.EXPENSE, "icon": "📝", "children": [
            {"name": "行政办事费", "category_type": CategoryType.EXPENSE, "icon": "🏛️"},
            {"name": "证件办理费", "category_type": CategoryType.EXPENSE, "icon": "🪪"},
            {"name": "公证费", "category_type": CategoryType.EXPENSE, "icon": "📑"},
            {"name": "快递费", "category_type": CategoryType.EXPENSE, "icon": "📦"},
            {"name": "邮费", "category_type": CategoryType.EXPENSE, "icon": "✉️"},
            {"name": "打印费", "category_type": CategoryType.EXPENSE, "icon": "🖨️"},
            {"name": "复印费", "category_type": CategoryType.EXPENSE, "icon": "📄"},
        ]},
        {"name": "公益捐赠", "category_type": CategoryType.EXPENSE, "icon": "❤️", "children": [
            {"name": "公益捐款", "category_type": CategoryType.EXPENSE, "icon": "❤️"},
            {"name": "宗教捐赠", "category_type": CategoryType.EXPENSE, "icon": "🛕"},
            {"name": "平台捐助", "category_type": CategoryType.EXPENSE, "icon": "🤝"},
            {"name": "物资捐赠", "category_type": CategoryType.EXPENSE, "icon": "📦"},
        ]},

        # Income categories
        {"name": "工资薪酬", "category_type": CategoryType.INCOME, "icon": "💰", "children": [
            {"name": "基本工资", "category_type": CategoryType.INCOME, "icon": "💵"},
            {"name": "绩效奖金", "category_type": CategoryType.INCOME, "icon": "🎁"},
            {"name": "年终奖", "category_type": CategoryType.INCOME, "icon": "🧧"},
            {"name": "加班费", "category_type": CategoryType.INCOME, "icon": "🕒"},
            {"name": "津贴", "category_type": CategoryType.INCOME, "icon": "🏷️"},
            {"name": "餐补", "category_type": CategoryType.INCOME, "icon": "🍱"},
            {"name": "交通补助", "category_type": CategoryType.INCOME, "icon": "🚌"},
            {"name": "通讯补助", "category_type": CategoryType.INCOME, "icon": "📱"},
            {"name": "高温补贴", "category_type": CategoryType.INCOME, "icon": "🌞"},
            {"name": "节日补贴", "category_type": CategoryType.INCOME, "icon": "🎉"},
        ]},
        {"name": "兼职副业", "category_type": CategoryType.INCOME, "icon": "💼", "children": [
            {"name": "稿费", "category_type": CategoryType.INCOME, "icon": "✍️"},
            {"name": "咨询费", "category_type": CategoryType.INCOME, "icon": "🧠"},
            {"name": "设计收入", "category_type": CategoryType.INCOME, "icon": "🎨"},
            {"name": "开发收入", "category_type": CategoryType.INCOME, "icon": "💻"},
            {"name": "授课收入", "category_type": CategoryType.INCOME, "icon": "🎓"},
            {"name": "摄影收入", "category_type": CategoryType.INCOME, "icon": "📷"},
            {"name": "剪辑收入", "category_type": CategoryType.INCOME, "icon": "🎬"},
            {"name": "代运营收入", "category_type": CategoryType.INCOME, "icon": "📊"},
            {"name": "翻译收入", "category_type": CategoryType.INCOME, "icon": "🌐"},
            {"name": "佣金收入", "category_type": CategoryType.INCOME, "icon": "💸"},
        ]},
        {"name": "经营收入", "category_type": CategoryType.INCOME, "icon": "🏪", "children": [
            {"name": "商品销售", "category_type": CategoryType.INCOME, "icon": "🛍️"},
            {"name": "服务收费", "category_type": CategoryType.INCOME, "icon": "🧾"},
            {"name": "项目回款", "category_type": CategoryType.INCOME, "icon": "📥"},
            {"name": "代理分成", "category_type": CategoryType.INCOME, "icon": "🤝"},
            {"name": "渠道返佣", "category_type": CategoryType.INCOME, "icon": "🔁"},
            {"name": "线下收款", "category_type": CategoryType.INCOME, "icon": "🏬"},
        ]},
        {"name": "投资收益", "category_type": CategoryType.INCOME, "icon": "📈", "children": [
            {"name": "活期利息", "category_type": CategoryType.INCOME, "icon": "🏦"},
            {"name": "定期利息", "category_type": CategoryType.INCOME, "icon": "🏦"},
            {"name": "货币基金收益", "category_type": CategoryType.INCOME, "icon": "💹"},
            {"name": "基金分红", "category_type": CategoryType.INCOME, "icon": "🎁"},
            {"name": "股票分红", "category_type": CategoryType.INCOME, "icon": "📊"},
            {"name": "债券利息", "category_type": CategoryType.INCOME, "icon": "📜"},
            {"name": "理财收益", "category_type": CategoryType.INCOME, "icon": "💳"},
            {"name": "国债收益", "category_type": CategoryType.INCOME, "icon": "🏛️"},
            {"name": "黄金收益", "category_type": CategoryType.INCOME, "icon": "🥇"},
        ]},
        {"name": "资产处置", "category_type": CategoryType.INCOME, "icon": "🔄", "children": [
            {"name": "二手出售", "category_type": CategoryType.INCOME, "icon": "♻️"},
            {"name": "手机转卖", "category_type": CategoryType.INCOME, "icon": "📱"},
            {"name": "电脑转卖", "category_type": CategoryType.INCOME, "icon": "💻"},
            {"name": "家电转卖", "category_type": CategoryType.INCOME, "icon": "🏠"},
            {"name": "家具转卖", "category_type": CategoryType.INCOME, "icon": "🪑"},
            {"name": "书籍转卖", "category_type": CategoryType.INCOME, "icon": "📚"},
            {"name": "闲置饰品出售", "category_type": CategoryType.INCOME, "icon": "💎"},
            {"name": "设备回收", "category_type": CategoryType.INCOME, "icon": "🛠️"},
        ]},
        {"name": "报销补偿", "category_type": CategoryType.INCOME, "icon": "📝", "children": [
            {"name": "差旅报销", "category_type": CategoryType.INCOME, "icon": "✈️"},
            {"name": "餐饮报销", "category_type": CategoryType.INCOME, "icon": "🍽️"},
            {"name": "办公报销", "category_type": CategoryType.INCOME, "icon": "🖨️"},
            {"name": "医疗报销", "category_type": CategoryType.INCOME, "icon": "🏥"},
            {"name": "运费补偿", "category_type": CategoryType.INCOME, "icon": "🚚"},
            {"name": "售后补偿", "category_type": CategoryType.INCOME, "icon": "🧰"},
            {"name": "平台补偿", "category_type": CategoryType.INCOME, "icon": "🪙"},
        ]},
        {"name": "奖励补贴", "category_type": CategoryType.INCOME, "icon": "🎁", "children": [
            {"name": "政府补贴", "category_type": CategoryType.INCOME, "icon": "🏛️"},
            {"name": "平台奖励", "category_type": CategoryType.INCOME, "icon": "🏅"},
            {"name": "活动奖金", "category_type": CategoryType.INCOME, "icon": "🎉"},
            {"name": "比赛奖金", "category_type": CategoryType.INCOME, "icon": "🏆"},
            {"name": "推荐奖励", "category_type": CategoryType.INCOME, "icon": "🤝"},
            {"name": "签到奖励", "category_type": CategoryType.INCOME, "icon": "📆"},
        ]},
        {"name": "礼金红包", "category_type": CategoryType.INCOME, "icon": "🧧", "children": [
            {"name": "生日红包", "category_type": CategoryType.INCOME, "icon": "🎂"},
            {"name": "节日红包", "category_type": CategoryType.INCOME, "icon": "🎁"},
            {"name": "婚礼礼金", "category_type": CategoryType.INCOME, "icon": "💒"},
            {"name": "满月礼金", "category_type": CategoryType.INCOME, "icon": "👶"},
            {"name": "长辈给付", "category_type": CategoryType.INCOME, "icon": "👨‍👩‍👧"},
            {"name": "亲友转账", "category_type": CategoryType.INCOME, "icon": "💌"},
        ]},
        {"name": "保险理赔", "category_type": CategoryType.INCOME, "icon": "🏥", "children": [
            {"name": "医疗理赔", "category_type": CategoryType.INCOME, "icon": "🩺"},
            {"name": "意外理赔", "category_type": CategoryType.INCOME, "icon": "⚠️"},
            {"name": "车险理赔", "category_type": CategoryType.INCOME, "icon": "🚗"},
            {"name": "航班延误赔付", "category_type": CategoryType.INCOME, "icon": "✈️"},
            {"name": "运费险赔付", "category_type": CategoryType.INCOME, "icon": "📦"},
        ]},
        {"name": "其他入账", "category_type": CategoryType.INCOME, "icon": "💎", "children": [
            {"name": "公积金提取", "category_type": CategoryType.INCOME, "icon": "🏦"},
            {"name": "退押金", "category_type": CategoryType.INCOME, "icon": "🔓"},
            {"name": "违约赔付", "category_type": CategoryType.INCOME, "icon": "📄"},
            {"name": "奖学金", "category_type": CategoryType.INCOME, "icon": "🎓"},
            {"name": "助学金", "category_type": CategoryType.INCOME, "icon": "📘"},
        ]},
    ]
