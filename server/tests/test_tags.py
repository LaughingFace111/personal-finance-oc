import json
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.modules.accounts.models import Account
from src.modules.auth.models import User
from src.modules.books.models import Book
from src.modules.tags.models import Tag
from src.modules.tags.schemas import TagCreate
from src.modules.tags.service import create_tag, permanent_delete_tag, restore_tag
from src.modules.transactions.models import Transaction


def _make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    return session


def _seed_book_graph(session):
    user = User(
        id="user-001",
        email="user@example.com",
        username="user",
        password_hash="hashed",
    )
    book = Book(
        id="book-001",
        user_id=user.id,
        name="Test Book",
        currency="CNY",
        is_default=True,
    )
    account = Account(
        id="account-001",
        book_id=book.id,
        name="Cash",
        account_type="cash",
        current_balance=Decimal("100.00"),
    )
    session.add_all([user, book, account])
    session.commit()
    return book, account


def test_create_tag_rejects_duplicate_name_across_parents_and_soft_deleted_rows():
    session = _make_session()
    try:
        book, _ = _seed_book_graph(session)

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
        except HTTPException as exc:
            assert exc.status_code == 400
            assert exc.detail == "Tag name already exists"
        else:
            raise AssertionError("Expected duplicate tag creation to be blocked across parents")

        try:
            create_tag(
                session,
                book.id,
                TagCreate(name="Archived Tag"),
            )
        except HTTPException as exc:
            assert exc.status_code == 400
            assert exc.detail == "Tag name already exists"
        else:
            raise AssertionError("Expected duplicate tag creation to be blocked for soft-deleted rows")
    finally:
        session.close()


def test_permanent_delete_removes_transaction_associations_and_allows_recreate():
    session = _make_session()
    try:
        book, account = _seed_book_graph(session)
        parent = Tag(
            id="tag-parent",
            book_id=book.id,
            name="Travel",
            color="#1677ff",
            is_active=False,
        )
        child = Tag(
            id="tag-child",
            book_id=book.id,
            parent_id=parent.id,
            name="Flights",
            color="#1677ff",
            is_active=False,
        )
        transaction = Transaction(
            id="tx-001",
            book_id=book.id,
            occurred_at=datetime(2026, 4, 9, 0, 0, 0),
            transaction_type="expense",
            direction="out",
            amount=Decimal("20.00"),
            account_id=account.id,
            tags=json.dumps(["Travel", "Flights", "Other"], ensure_ascii=False),
        )
        session.add_all([parent, child, transaction])
        session.commit()

        assert permanent_delete_tag(session, parent.id, book.id) is True

        remaining = session.query(Tag).filter(Tag.book_id == book.id).all()
        assert remaining == []

        refreshed_transaction = session.query(Transaction).filter(Transaction.id == transaction.id).one()
        assert json.loads(refreshed_transaction.tags) == ["Other"]

        recreated = create_tag(session, book.id, TagCreate(name="Travel", color="#123456"))
        assert recreated.name == "Travel"
    finally:
        session.close()


def test_restore_parent_restores_children_with_original_color_and_parent():
    session = _make_session()
    try:
        book, _ = _seed_book_graph(session)
        parent = Tag(
            id="restore-parent",
            book_id=book.id,
            name="Projects",
            color="#445566",
            is_active=False,
        )
        child = Tag(
            id="restore-child",
            book_id=book.id,
            parent_id=parent.id,
            name="Side Hustle",
            color="#445566",
            is_active=False,
        )
        session.add_all([parent, child])
        session.commit()

        restored = restore_tag(session, parent.id, book.id)
        assert restored is not None
        assert restored.is_active is True
        assert restored.color == "#445566"

        restored_child = session.query(Tag).filter(Tag.id == child.id).one()
        assert restored_child.is_active is True
        assert restored_child.parent_id == parent.id
        assert restored_child.color == "#445566"
    finally:
        session.close()
