#!/usr/bin/env python3
"""
L 的标签系统重构脚本 - 独立运行版
"""
import sqlite3
import uuid
import colorsys
import os

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'app.db')

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

# 颜色配置
COLOR_PALETTES = {
    "消费属性": "#FF6B6B",
    "家庭与对象": "#4ECDC4",
    "项目与事件": "#45B7D1",
    "兴趣与爱好": "#96CEB4",
    "网购与外卖平台": "#FFEAA7",
    "超市与生鲜": "#DDA0DD",
    "饮品品牌": "#98D8C8",
    "餐厅品牌": "#F7DC6F",
}

def get_sub_color(base_color, index, total):
    """生成同色系不同亮度的颜色"""
    h = int(base_color[1:3], 16) / 255
    s = int(base_color[3:5], 16) / 255
    v = int(base_color[5:7], 16) / 255
    v = 0.85 - (index * 0.12 / max(total - 1, 1))
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"

def run_migration():
    print("=" * 60)
    print("L 的标签系统重构 - 开始执行")
    print("=" * 60)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Step 1: 清洗交易记录中的旧标签
    print("\n[Step 1] 清洗交易记录中的标签...")
    cursor.execute("SELECT COUNT(*) FROM transactions")
    tx_count = cursor.fetchone()[0]
    print(f"  发现 {tx_count} 条交易记录")
    cursor.execute("UPDATE transactions SET tags = '[]'")
    print(f"  ✓ 已清空所有交易的 tags 字段")
    
    # Step 2: 清空 tags 表
    print("\n[Step 2] 清空现有标签表...")
    cursor.execute("SELECT COUNT(*) FROM tags")
    old_count = cursor.fetchone()[0]
    print(f"  发现 {old_count} 条旧标签")
    cursor.execute("DELETE FROM tags")
    print(f"  ✓ 已删除所有旧标签")
    
    # Step 3: 注入新标签
    print("\n[Step 3] 注入新标签体系...")
    parent_ids = {}
    import datetime
    
    for parent_name, sub_names in NEW_TAGS.items():
        parent_id = str(uuid.uuid4())
        parent_ids[parent_name] = parent_id
        base_color = COLOR_PALETTES.get(parent_name, "#888888")
        
        # 插入父标签
        cursor.execute("""
            INSERT INTO tags (id, book_id, parent_id, name, color, is_active, is_system, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (parent_id, None, None, parent_name, base_color, 1, 1, 
              datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()))
        
        # 插入子标签
        for idx, sub_name in enumerate(sub_names):
            sub_color = get_sub_color(base_color, idx, len(sub_names))
            cursor.execute("""
                INSERT INTO tags (id, book_id, parent_id, name, color, is_active, is_system, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (str(uuid.uuid4()), None, parent_id, sub_name, sub_color, 1, 1,
                  datetime.datetime.now().isoformat(), datetime.datetime.now().isoformat()))
        
        print(f"  ✓ {parent_name} ({len(sub_names)} 个子标签)")
    
    conn.commit()
    
    # 验证
    cursor.execute("SELECT COUNT(*) FROM tags")
    new_count = cursor.fetchone()[0]
    print(f"\n[验证] 当前标签总数: {new_count}")
    
    cursor.execute("SELECT COUNT(*) FROM tags WHERE parent_id IS NULL")
    parent_count = cursor.fetchone()[0]
    print(f"[验证] 父标签数量: {parent_count}")
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("标签系统重构完成!")
    print("=" * 60)

if __name__ == "__main__":
    run_migration()