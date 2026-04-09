import uuid
from typing import List, Optional, Dict, Any
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from .models import Tag
from .schemas import TagCreate, TagUpdate

# 预设色板：用于一级标签自动分配默认颜色
DEFAULT_COLOR_PALETTE = [
    "#f5222d", "#fa541c", "#fa8c16", "#fadb14", "#52c41a",
    "#13c2c2", "#1677ff", "#722ed1", "#eb2f96", "#2f54eb",
    "#a0d911", "#faad14", "#ff4d4f", "#36cfc9", "#597ef7",
    "#b37feb", "#ff85c0", "#ffc53d", "#73d13d", "#40a9ff",
]


def _pick_default_color(db: Session, book_id: str) -> str:
    """从未使用的色板颜色中挑选一个，尽量避免重复"""
    existing_colors = set()
    for tag in db.query(Tag.color).filter(
        Tag.book_id == book_id,
        Tag.parent_id.is_(None),
        Tag.is_active == True,
        Tag.color.isnot(None)
    ).all():
        if tag[0]:
            existing_colors.add(tag[0].lower())

    for color in DEFAULT_COLOR_PALETTE:
        if color.lower() not in existing_colors:
            return color

    # 全部用完了，循环分配
    count = db.query(Tag).filter(
        Tag.book_id == book_id,
        Tag.parent_id.is_(None),
        Tag.is_active == True
    ).count()
    return DEFAULT_COLOR_PALETTE[count % len(DEFAULT_COLOR_PALETTE)]


def create_tag(db: Session, book_id: str, tag_data: TagCreate, is_system: bool = False) -> Tag:
    normalized_name = tag_data.name.strip()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Tag name cannot be empty")

    existing_tag = db.query(Tag.id).filter(
        Tag.book_id == book_id,
        func.lower(func.trim(Tag.name)) == normalized_name.lower()
    ).first()
    if existing_tag:
        raise HTTPException(status_code=400, detail="Tag name already exists (including deleted tags), global uniqueness enforced")

    # 校验：如果传了 parent_id，必须指向一个一级标签
    if tag_data.parent_id:
        parent = db.query(Tag).filter(
            Tag.id == tag_data.parent_id,
            ((Tag.book_id == book_id) | (Tag.is_system == True)),
            Tag.is_active == True
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="父标签不存在")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="不能将二级标签作为父标签，只支持两级结构")
        # 二级标签颜色继承父级
        color = parent.color
    else:
        # 一级标签：如果未指定颜色，自动分配
        color = tag_data.color or _pick_default_color(db, book_id)

    tag = Tag(
        id=str(uuid.uuid4()),
        book_id=book_id if not is_system else None,  # 🛡️ L: 系统标签无账本归属
        name=normalized_name,
        color=color,
        parent_id=tag_data.parent_id,
        is_system=is_system,  # 🛡️ L: 标记为系统标签
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def get_tags(db: Session, book_id: str, include_inactive: bool = False) -> List[Tag]:
    # 🛡️ L: 返回当前账本标签 + 系统级标签（所有账本共享）
    query = db.query(Tag).filter(
        (Tag.book_id == book_id) | (Tag.is_system == True)
    )
    if not include_inactive:
        query = query.filter(Tag.is_active == True)
    return query.order_by(Tag.is_system.desc(), Tag.parent_id.asc().nullsfirst(), Tag.name).all()


def get_first_level_tags(db: Session, book_id: str) -> List[Tag]:
    """只返回一级标签（parent_id 为 null），包含系统级标签"""
    return db.query(Tag).filter(
        ((Tag.book_id == book_id) | (Tag.is_system == True)),
        Tag.parent_id.is_(None),
        Tag.is_active == True
    ).order_by(Tag.is_system.desc(), Tag.name).all()


def get_tags_tree(db: Session, book_id: str) -> List[Dict[str, Any]]:
    """返回分组树形结构：一级标签 + children，包含系统级标签"""
    first_level = db.query(Tag).filter(
        ((Tag.book_id == book_id) | (Tag.is_system == True)),
        Tag.parent_id.is_(None),
        Tag.is_active == True
    ).order_by(Tag.is_system.desc(), Tag.name).all()

    second_level = db.query(Tag).filter(
        ((Tag.book_id == book_id) | (Tag.is_system == True)),
        Tag.parent_id.isnot(None),
        Tag.is_active == True
    ).order_by(Tag.name).all()

    # 按 parent_id 分组
    children_map: Dict[str, List[Tag]] = {}
    for tag in second_level:
        children_map.setdefault(tag.parent_id, []).append(tag)

    result = []
    for parent in first_level:
        parent_dict = {
            "id": parent.id,
            "book_id": parent.book_id,
            "name": parent.name,
            "color": parent.color,
            "parent_id": parent.parent_id,
            "is_active": parent.is_active,
            "created_at": parent.created_at,
            "updated_at": parent.updated_at,
            "children": [
                {
                    "id": child.id,
                    "book_id": child.book_id,
                    "name": child.name,
                    "color": parent.color,  # 颜色继承自父级
                    "parent_id": child.parent_id,
                    "is_active": child.is_active,
                    "created_at": child.created_at,
                    "updated_at": child.updated_at,
                }
                for child in children_map.get(parent.id, [])
            ]
        }
        result.append(parent_dict)

    return result


def get_tag(db: Session, tag_id: str, book_id: str = None) -> Optional[Tag]:
    query = db.query(Tag).filter(Tag.id == tag_id)
    if book_id:
        query = query.filter(Tag.book_id == book_id)
    return query.first()


def update_tag(db: Session, tag_id: str, book_id: str, tag_data: TagUpdate) -> Optional[Tag]:
    tag = get_tag(db, tag_id, book_id)
    if not tag:
        return None

    update_data = tag_data.model_dump(exclude_unset=True)

    # 校验 parent_id
    if "parent_id" in update_data and update_data["parent_id"] is not None:
        parent = db.query(Tag).filter(
            Tag.id == update_data["parent_id"],
            Tag.book_id == book_id,
            Tag.is_active == True
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="父标签不存在")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="不能将二级标签作为父标签，只支持两级结构")

    # 如果修改了一级标签颜色，同步其下所有二级标签
    if "color" in update_data and tag.parent_id is None:
        new_color = update_data["color"]
        if new_color:
            db.query(Tag).filter(
                Tag.parent_id == tag.id,
                Tag.book_id == book_id
            ).update({"color": new_color})

    for key, value in update_data.items():
        setattr(tag, key, value)

    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag_id: str, book_id: str = None) -> bool:
    tag = get_tag(db, tag_id, book_id)
    if not tag:
        return False
    # 软删除
    tag.is_active = False
    # 如果是一级标签，其下所有二级标签也软删除
    if tag.parent_id is None:
        db.query(Tag).filter(
            Tag.parent_id == tag.id,
            Tag.book_id == tag.book_id
        ).update({"is_active": False})
    db.commit()
    return True


# 🛡️ L: 系统级标签初始化（调用一次即可）
SYSTEM_TAGS = [
    # 一级标签
    {"name": "餐饮", "color": "#f5222d"},
    {"name": "交通", "color": "#1677ff"},
    {"name": "购物", "color": "#722ed1"},
    {"name": "住房", "color": "#52c41a"},
    {"name": "医疗", "color": "#13c2c2"},
    {"name": "教育", "color": "#fa8c16"},
    {"name": "娱乐", "color": "#eb2f96"},
    {"name": "通讯", "color": "#2f54eb"},
    # 二级标签（挂载到"购物"下）
    {"name": "日用", "color": "#722ed1", "parent": "购物"},
    {"name": "数码", "color": "#722ed1", "parent": "购物"},
    {"name": "服装", "color": "#722ed1", "parent": "购物"},
]


def init_system_tags(db: Session):
    """初始化系统级标签（幂等调用）"""
    # 检查是否已有系统标签
    existing = db.query(Tag).filter(Tag.is_system == True).first()
    if existing:
        return  # 已有系统标签，跳过
    
    # 创建系统标签
    parent_map = {}  # name -> id
    
    for tag_data in SYSTEM_TAGS:
        parent_name = tag_data.get("parent")
        
        if parent_name:
            # 二级标签
            parent_id = parent_map.get(parent_name)
            if not parent_id:
                continue  # 父标签不存在，跳过
            tag = Tag(
                id=str(uuid.uuid4()),
                book_id=None,  # 系统标签无账本
                name=tag_data["name"],
                color=tag_data.get("color"),
                parent_id=parent_id,
                is_system=True,
            )
        else:
            # 一级标签
            tag = Tag(
                id=str(uuid.uuid4()),
                book_id=None,
                name=tag_data["name"],
                color=tag_data.get("color"),
                is_system=True,
            )
            parent_map[tag_data["name"]] = tag.id
        
        db.add(tag)
    
    db.commit()
    return len(SYSTEM_TAGS)
