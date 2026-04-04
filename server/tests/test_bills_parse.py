from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from src.core import AppException, NotFoundException
from src.core.database import Base
from src.modules.accounts.models import Account  # noqa: F401
from src.modules.bills.parsers.wechat import WechatBillParser
from src.modules.bills.service import parse_bill_file
from src.modules.books.models import Book  # noqa: F401
from src.modules.categories.models import Category  # noqa: F401
from src.modules.imports.models import ImportBatch, ImportRow  # noqa: F401


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_parse_bill_file_raises_not_found_when_default_book_missing(db_session):
    with pytest.raises(NotFoundException) as exc_info:
        parse_bill_file(
            db=db_session,
            user_id="missing-user",
            bill_type="wechat",
            filename="wechat.xlsx",
            content=b"PK",
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "未找到默认账本"


def test_wechat_xlsx_reports_missing_openpyxl_dependency():
    parser = WechatBillParser()

    real_import = __import__

    def fake_import(name, *args, **kwargs):
        if name == "openpyxl":
            raise ImportError("No module named 'openpyxl'")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=fake_import):
        with pytest.raises(ValueError) as exc_info:
            parser.parse(b"PKfake-xlsx")

    assert str(exc_info.value) == "缺少 openpyxl 依赖，无法解析微信 XLSX 账单"


def test_parse_bill_file_converts_database_failures_to_503(db_session, monkeypatch):
    def raise_db_error(db, user_id):
        raise SQLAlchemyError("db unavailable")

    monkeypatch.setattr("src.modules.bills.service.get_default_book", raise_db_error)

    with pytest.raises(AppException) as exc_info:
        parse_bill_file(
            db=db_session,
            user_id="test-user",
            bill_type="wechat",
            filename="wechat.csv",
            content=b"",
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "账单解析服务暂时不可用，请稍后重试"
