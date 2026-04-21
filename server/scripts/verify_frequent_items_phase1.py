from src.core.database import SessionLocal, init_db
from src.modules.categories.service import get_frequent_categories
from src.modules.tags.service import get_frequent_tags


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        print("=== get_frequent_tags ===")
        tags = get_frequent_tags(db, "default", limit=5)
        for tag in tags:
            print(f"  {tag.get('name')}: {tag.get('usage_count')}")

        print("=== get_frequent_categories ===")
        categories = get_frequent_categories(db, "default", limit=5)
        for category in categories:
            print(f"  {category.get('name')}: {category.get('usage_count')}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
