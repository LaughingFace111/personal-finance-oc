"""
L 的标签系统重构脚本
1. 数据清洗 - 清空 tags 表，清理 transactions 中的旧标签
2. 新标签体系初始化 - 插入新的父子层级标签
"""
import uuid
from datetime import datetime

# 全新标签数据字典
NEW_TAGS = {
    "消费属性": [
        "冲动消费", "必要开支", "生活品质提升", "意外损耗", "日常囤货"
    ],
    "家庭与对象": [
        "老婆大人", "长辈亲友"
    ],
    "项目与事件": [
        "26年清明出游"
    ],
    "兴趣与爱好": [
        "电脑硬件", "Steam与游戏"
    ],
    "网购与外卖平台": [
        "京东", "淘宝/天猫", "拼多多", "闲鱼", "美团", "饿了么"
    ],
    "超市与生鲜": [
        "山姆", "盒马", "沃尔玛", "大润发", "永辉", "叮咚买菜", "便利店"
    ],
    "饮品品牌": [
        "霸王茶姬", "瑞幸咖啡", "星巴克", "喜茶", "奈雪的茶", "蜜雪冰城", 
        "茶百道", "益禾堂", "古茗", "沪上阿姨", "一点点", "CoCo都可", 
        "茶颜悦色", "库迪咖啡", "书亦烧仙草"
    ],
    "餐厅品牌": [
        "麦当劳", "肯德基", "汉堡王", "塔斯汀", "海底捞", "呷哺呷哺", 
        "萨莉亚", "潇湘阁", "鱼酷", "西贝莜面村", "外婆家", "太二酸菜鱼", 
        "半天妖", "费大厨", "老乡鸡"
    ]
}

# 颜色配置 - 同色系不同亮度
COLOR_PALETTES = {
    "消费属性": "#FF6B6B",      # 珊瑚红
    "家庭与对象": "#4ECDC4",    # 青绿
    "项目与事件": "#45B7D1",    # 天蓝
    "兴趣与爱好": "#96CEB4",    # 草绿
    "网购与外卖平台": "#FFEAA7", # 柠檬黄
    "超市与生鲜": "#DDA0DD",    # 梅红
    "饮品品牌": "#98D8C8",      # 薄荷绿
    "餐厅品牌": "#F7DC6F",      # 金黄
}

def get_sub_color(base_color, index, total):
    """生成同色系不同亮度的颜色"""
    import colorsys
    # 解析 hex
    h = int(base_color[1:3], 16) / 255
    s = int(base_color[3:5], 16) / 255
    v = int(base_color[5:7], 16) / 255
    
    # 调整亮度 - 从亮到暗
    v = 0.9 - (index * 0.15 / max(total - 1, 1))
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"


def run_migration(db):
    """执行数据清洗和新标签注入"""
    from src.modules.books.models import Book
    
    print("=" * 60)
    print("L 的标签系统重构 - 开始执行")
    print("=" * 60)
    
    # Step 1: 数据清洗 - 获取所有账本
    books = db.query(Book).all()
    print(f"\n[Step 1] 发现 {len(books)} 个账本需要清洗")
    
    # Step 2: 清理 transactions 中的 tags 字段
    from src.modules.transactions.models import Transaction
    for book in books:
        tx_count = db.query(Transaction).filter(Transaction.book_id == book.id).count()
        if tx_count > 0:
            print(f"  - 账本 {book.id}: 清空 {tx_count} 条交易的 tags 字段")
            db.query(Transaction).filter(Transaction.book_id == book.id).update({"tags": "[]"})
    
    # Step 3: 清空 tags 表
    from src.modules.tags.models import Tag
    deleted_count = db.query(Tag).delete()
    print(f"\n[Step 2] 已删除 {deleted_count} 条旧标签")
    
    # Step 4: 注入新标签
    print(f"\n[Step 3] 开始注入新标签体系...")
    parent_ids = {}
    
    for parent_name, sub_names in NEW_TAGS.items():
        parent_id = str(uuid.uuid4())
        parent_ids[parent_name] = parent_id
        
        # 插入父标签
        parent_tag = Tag(
            id=parent_id,
            book_id=None,  # 系统级标签
            parent_id=None,
            name=parent_name,
            color=COLOR_PALETTES.get(parent_name, "#888888"),
            is_active=True,
            is_system=True
        )
        db.add(parent_tag)
        
        # 插入子标签
        for idx, sub_name in enumerate(sub_names):
            sub_color = get_sub_color(COLOR_PALETTES.get(parent_name, "#888888"), idx, len(sub_names))
            sub_tag = Tag(
                id=str(uuid.uuid4()),
                book_id=None,
                parent_id=parent_id,
                name=sub_name,
                color=sub_color,
                is_active=True,
                is_system=True
            )
            db.add(sub_tag)
        
        print(f"  ✓ {parent_name} ({len(sub_names)} 个子标签)")
    
    db.commit()
    print("\n" + "=" * 60)
    print("标签系统重构完成!")
    print("=" * 60)


if __name__ == "__main__":
    from src.core.database import SessionLocal
    db = SessionLocal()
    try:
        run_migration(db)
    finally:
        db.close()