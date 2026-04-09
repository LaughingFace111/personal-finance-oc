from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.modules.books.models import Book
from src.modules.tags.models import Tag
from src.modules.tags.schemas import TagCreate
from src.modules.tags.service import create_tag


def _make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    return session


def test_create_tag_rejects_duplicate_name_across_parents_and_soft_deleted_rows():
    session = _make_session()
    try:
        book = Book(
            id="book-001",
            user_id="user-001",
            name="Test Book",
            currency="CNY",
            is_default=True,
        )
        session.add(book)

        parent_a = Tag(
            id="parent-a",
            book_id=book.id,
            name="Parent A",
            color="#1677ff",
            is_active=True,
        )
        parent_b = Tag(
            id="parent-b",
            book_id=book.id,
            name="Parent B",
            color="#52c41a",
            is_active=True,
        )
        archived = Tag(
            id="archived-tag",
            book_id=book.id,
            name="Archived Tag",
            color="#fa8c16",
            is_active=False,
        )
        session.add_all([parent_a, parent_b, archived])
        session.commit()

        create_tag(
            session,
            book.id,
            TagCreate(name="Shared Name", parent_id=parent_a.id),
        )

        try:
            create_tag(
                session,
                book.id,
                TagCreate(name="Shared Name", parent_id=parent_b.id),
            )
        except ValueError as exc:
            assert str(exc) == "Tag name already exists (including deleted tags), global uniqueness enforced"
        else:
            raise AssertionError("Expected duplicate tag creation to be blocked across parents")

        try:
            create_tag(
                session,
                book.id,
                TagCreate(name="Archived Tag"),
            )
        except ValueError as exc:
            assert str(exc) == "Tag name already exists (including deleted tags), global uniqueness enforced"
        else:
            raise AssertionError("Expected duplicate tag creation to be blocked for soft-deleted rows")
    finally:
        session.close()
