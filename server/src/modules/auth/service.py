from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from src.core import (
    ErrorCode,
    generate_uuid,
    get_password_hash,
    verify_password,
    create_access_token,
    AppException,
    NotFoundException,
    UnauthorizedException,
)
from src.core.config import settings
from .models import User
from .schemas import UserCreate, UserUpdate, UserResponse


def create_user(db: Session, data: UserCreate) -> User:
    """Create new user with default book and categories"""
    # Check if email exists
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise AppException(status_code=400, code=ErrorCode.CONFLICT, message="Email already registered")

    user = User(
        id=generate_uuid(),
        email=data.email,
        password_hash=get_password_hash(data.password),
        nickname=data.nickname,
    )
    db.add(user)
    db.flush()  # Get user ID

    # Create default book
    from src.modules.books.models import Book
    default_book = Book(
        id=generate_uuid(),
        user_id=user.id,
        name="默认账本",
        description="自动创建的默认账本",
        currency="CNY",
        is_default=True,
    )
    db.add(default_book)
    db.flush()

    # Create default categories
    from src.modules.categories.models import Category
    from src.common.enums import CategoryType as CatType
    
    default_categories = [
        # 支出分类
        {"name": "餐饮", "category_type": CatType.EXPENSE, "icon": "🍽️", "color": "#FF6B6B", "children": [
            {"name": "早饭", "category_type": CatType.EXPENSE, "icon": "🍳"},
            {"name": "午饭", "category_type": CatType.EXPENSE, "icon": "🍱"},
            {"name": "晚饭", "category_type": CatType.EXPENSE, "icon": "🍲"},
            {"name": "饮料", "category_type": CatType.EXPENSE, "icon": "🥤"},
            {"name": "零食", "category_type": CatType.EXPENSE, "icon": "🍪"},
            {"name": "外卖", "category_type": CatType.EXPENSE, "icon": "🛵"},
        ]},
        {"name": "交通", "category_type": CatType.EXPENSE, "icon": "🚗", "color": "#4ECDC4", "children": [
            {"name": "公交地铁", "category_type": CatType.EXPENSE, "icon": "🚌"},
            {"name": "打车", "category_type": CatType.EXPENSE, "icon": "🚕"},
            {"name": "油费", "category_type": CatType.EXPENSE, "icon": "⛽"},
        ]},
        {"name": "购物", "category_type": CatType.EXPENSE, "icon": "🛍️", "color": "#95E1D3", "children": [
            {"name": "日用品", "category_type": CatType.EXPENSE, "icon": "🧴"},
            {"name": "服饰鞋包", "category_type": CatType.EXPENSE, "icon": "👔"},
            {"name": "数码产品", "category_type": CatType.EXPENSE, "icon": "📱"},
        ]},
        # 收入分类
        {"name": "工资收入", "category_type": CatType.INCOME, "icon": "💰", "color": "#45B7D1", "children": [
            {"name": "基本工资", "category_type": CatType.INCOME, "icon": "💵"},
            {"name": "奖金", "category_type": CatType.INCOME, "icon": "🎁"},
        ]},
        {"name": "副业收入", "category_type": CatType.INCOME, "icon": "💼", "color": "#96CEB4", "children": [
            {"name": "兼职", "category_type": CatType.INCOME, "icon": "📝"},
            {"name": "咨询", "category_type": CatType.INCOME, "icon": "🎯"},
        ]},
    ]

    parent_ids = {}
    for cat in default_categories:
        parent = Category(
            id=generate_uuid(),
            book_id=default_book.id,
            name=cat["name"],
            category_type=cat["category_type"].value,
            icon=cat.get("icon"),
            color=cat.get("color"),
            is_system=True,
            is_active=True,
        )
        db.add(parent)
        db.flush()
        parent_ids[cat["name"]] = parent.id

        # Create children
        for child in cat.get("children", []):
            child_cat = Category(
                id=generate_uuid(),
                book_id=default_book.id,
                parent_id=parent.id,
                name=child["name"],
                category_type=child["category_type"].value,
                icon=child.get("icon"),
                is_system=True,
                is_active=True,
            )
            db.add(child_cat)

    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    """Authenticate user with email and password"""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise UnauthorizedException("Invalid email or password")

    if not verify_password(password, user.password_hash):
        raise UnauthorizedException("Invalid email or password")

    return user


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def update_user(db: Session, user_id: str, data: UserUpdate) -> User:
    """Update user"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise NotFoundException("User not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    return user


def create_token(user: User) -> str:
    """Create JWT access token"""
    token_data = {"sub": user.id, "email": user.email}
    return create_access_token(token_data)
