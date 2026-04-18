import io
from decimal import Decimal
from unittest.mock import patch
from xml.sax.saxutils import escape
import zipfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from src.core import AppException, NotFoundException
from src.core.database import Base
from src.modules.accounts.models import Account  # noqa: F401
from src.modules.auth.models import User
from src.modules.bills.parsers.alipay_pouch import AlipayPouchBillParser
from src.modules.bills.parsers.wechat import WechatBillParser
from src.modules.bills.service import confirm_import, parse_bill_file
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


@pytest.fixture
def test_book(db_session):
    user = User(
        id="test-user",
        email="test@example.com",
        password_hash="hashed",
        username="tester",
    )
    book = Book(
        id="test-book",
        user_id=user.id,
        name="默认账本",
        currency="CNY",
        is_default=True,
    )
    db_session.add_all([user, book])
    db_session.commit()
    return book


@pytest.fixture
def import_account_and_categories(db_session, test_book):
    account = Account(
        id="acc-pouch",
        book_id=test_book.id,
        name="支付宝小荷包",
        account_type="ewallet",
        opening_balance=Decimal("0"),
        current_balance=Decimal("0"),
        is_active=True,
    )
    expense_category = Category(
        id="cat-shopping",
        book_id=test_book.id,
        name="购物",
        category_type="expense",
        is_active=True,
    )
    income_category = Category(
        id="cat-salary",
        book_id=test_book.id,
        name="工资",
        category_type="income",
        is_active=True,
    )
    db_session.add_all([account, expense_category, income_category])
    db_session.commit()
    return account, expense_category, income_category


def build_alipay_pouch_xlsx_bytes(rows):
    preamble_rows = [
        ["支付宝小荷包账单"],
        ["以下为说明文字"],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
    ]
    headers = ["订单号", "交易时间", "交易说明", "备注", "操作人昵称", "操作人姓名", "收入金额", "支出金额"]
    all_rows = [*preamble_rows, headers, *rows]

    def column_name(index: int) -> str:
        name = ""
        current = index + 1
        while current > 0:
            current, remainder = divmod(current - 1, 26)
            name = chr(ord("A") + remainder) + name
        return name

    sheet_rows = []
    for row_idx, row in enumerate(all_rows, start=1):
        cells = []
        for col_idx, value in enumerate(row):
            if value in (None, ""):
                continue
            cell_ref = f"{column_name(col_idx)}{row_idx}"
            value_text = str(value)
            if isinstance(value, (int, float)) or value_text.replace(".", "", 1).isdigit():
                cells.append(f'<c r="{cell_ref}"><v>{escape(value_text)}</v></c>')
            else:
                cells.append(
                    f'<c r="{cell_ref}" t="inlineStr"><is><t>{escape(value_text)}</t></is></c>'
                )
        sheet_rows.append(f'<row r="{row_idx}">{"".join(cells)}</row>')

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetData>'
        f'{"".join(sheet_rows)}'
        '</sheetData>'
        '</worksheet>'
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '</Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>',
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
            '</workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '</Relationships>',
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buffer.getvalue()


def build_wechat_xlsx_bytes(rows):
    """
    构建微信账单 xlsx 格式的字节内容。
    rows: 列表，每行是一个 list，包含字段顺序：
    交易时间, 交易类型, 交易对方, 商品, 收/支, 金额(元), 当前状态, 交易单号, 商户单号, 支付方式, 备注
    """
    # 微信账单表头
    headers = [
        "交易时间", "交易类型", "交易对方", "商品", "收/支", "金额(元)",
        "当前状态", "交易单号", "商户单号", "支付方式", "备注",
    ]
    all_rows = [headers] + rows

    def column_name(index: int) -> str:
        name = ""
        current = index + 1
        while current > 0:
            current, remainder = divmod(current - 1, 26)
            name = chr(ord("A") + remainder) + name
        return name

    sheet_rows = []
    for row_idx, row in enumerate(all_rows, start=1):
        cells = []
        for col_idx, value in enumerate(row):
            if value is None or value == "":
                continue
            cell_ref = column_name(col_idx) + str(row_idx)
            value_text = str(value)
            if isinstance(value, (int, float)) or value_text.replace(".", "", 1).isdigit():
                cells.append('<c r="' + cell_ref + '"><v>' + escape(value_text) + '</v></c>')
            else:
                cells.append(
                    '<c r="' + cell_ref + '" t="inlineStr"><is><t>' + escape(value_text) + '</t></is></c>'
                )
        row_content = "".join(cells)
        sheet_rows.append("<row r=\"" + str(row_idx) + "\">" + row_content + "</row>")

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
        + "".join(sheet_rows)
        + "</sheetData>"
        + "</worksheet>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
            "</workbook>",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>",
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buffer.getvalue()

def test_wechat_xlsx_does_not_filter_rows_by_status():
    """验证微信账单解析器不再按状态白名单过滤记录"""
    parser = WechatBillParser()
    content = build_wechat_xlsx_bytes([
        ["2026-04-01 10:00:00", "转账", "张三", "转账给张三", "收入", "100.00", "已转账", "WX20260401001", "", "零钱", ""],
        ["2026-04-02 11:00:00", "收款", "李四", "收到李四转账", "收入", "200.00", "已到账", "WX20260402001", "", "零钱", ""],
        ["2026-04-03 12:00:00", "消费", "便利店", "购买零食", "支出", "38.50", "支付成功", "WX20260403001", "", "零钱", ""],
        ["2026-04-04 13:00:00", "还款", "银行", "信用卡还款", "支出", "500.00", "已存入零钱", "WX20260404001", "", "零钱", ""],
        ["2026-04-05 14:00:00", "转账", "王五", "转账给王五", "支出", "300.00", "对方已收钱", "WX20260405001", "", "零钱", ""],
        ["2026-04-06 15:00:00", "微信红包", "群红包", "红包", "收入", "10.00", "已全额退款", "WX20260406001", "", "零钱", ""],
    ])

    records = parser.parse(content)

    assert len(records) >= 5, f"期望至少5条记录，实际解析出 {len(records)} 条"
    statuses = {r.status for r in records}
    # 验证非 ACCEPTED_STATUS 中的状态也出现了
    assert "已转账" in statuses, f"期望 '已转账' 在结果中，实际状态集合: {statuses}"
    assert "已到账" in statuses, f"期望 '已到账' 在结果中，实际状态集合: {statuses}"


def test_wechat_xlsx_keeps_full_refund_rows_with_warning():
    """验证'已全额退款'状态的记录被保留且带有 warning"""
    parser = WechatBillParser()
    content = build_wechat_xlsx_bytes([
        ["2026-04-06 15:00:00", "微信红包", "群红包", "红包", "/", "10.00", "已全额退款", "WX20260406001", "", "零钱", ""],
    ])

    records = parser.parse(content)

    assert len(records) == 1, f"期望1条记录，实际解析出 {len(records)} 条"
    record = records[0]
    assert record.status == "已全额退款"
    assert len(record.warnings) > 0, f"期望有 warnings，实际: {record.warnings}"
    assert any("已全额退款" in w for w in record.warnings), f"期望 warnings 包含 '已全额退款'，实际: {record.warnings}"


def test_wechat_xlsx_multiple_statuses_all_preserved():
    """验证包含多种不同状态的记录都能被解析，不被过滤"""
    parser = WechatBillParser()
    content = build_wechat_xlsx_bytes([
        ["2026-04-01 10:00:00", "转账", "用户A", "转账", "收入", "100.00", "已转账", "WX001", "", "零钱", ""],
        ["2026-04-02 11:00:00", "转账", "用户B", "转账", "收入", "200.00", "已到账", "WX002", "", "零钱", ""],
        ["2026-04-03 12:00:00", "消费", "商店", "购物", "支出", "50.00", "支付成功", "WX003", "", "零钱", ""],
        ["2026-04-04 13:00:00", "转账", "用户C", "转账", "收入", "88.88", "已存入零钱", "WX004", "", "零钱", ""],
        ["2026-04-05 14:00:00", "微信红包", "群", "红包", "收入", "5.00", "对方已收钱", "WX005", "", "零钱", ""],
    ])

    records = parser.parse(content)

    assert len(records) == 5, f"期望5条记录，实际解析出 {len(records)} 条"
    statuses = {r.status for r in records}
    expected_statuses = {"已转账", "已到账", "支付成功", "已存入零钱", "对方已收钱"}
    assert statuses == expected_statuses, f"期望状态集合 {expected_statuses}，实际: {statuses}"


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
    content = build_alipay_pouch_xlsx_bytes([["单号1", "2026-04-01 09:30:00", "说明", "", "昵称", "姓名", "", "10"]])

    real_import = __import__

    def fake_import(name, *args, **kwargs):
        if name == "openpyxl":
            raise ImportError("No module named 'openpyxl'")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=fake_import):
        with pytest.raises(ValueError) as exc_info:
            parser.parse(content)

    assert str(exc_info.value) == "当前环境未安装 openpyxl"


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


def test_alipay_pouch_parser_parses_xlsx_rows():
    parser = AlipayPouchBillParser()
    content = build_alipay_pouch_xlsx_bytes(
        [
            ["202604150001", "2026-04-01 09:30:00", "淘宝购物", "早餐", "小石", "石帅", "", "18.50"],
            ["202604150002", "2026-04-02 10:00:00", "工资入账", "", "小张", "", "3000", ""],
        ]
    )

    records = parser.parse(content)

    assert len(records) == 2
    assert records[0].transaction_order_no == "202604150001"
    assert records[0].description == "淘宝购物"
    assert records[0].operator_nickname == "小石"
    assert records[0].operator_name == "石帅"
    assert records[0].note == "早餐"
    assert records[1].operator_nickname == "小张"
    assert records[1].operator_name is None


def test_alipay_pouch_parser_maps_income_and_expense_correctly():
    parser = AlipayPouchBillParser()
    content = build_alipay_pouch_xlsx_bytes(
        [
            ["202604150011", "2026-04-03 11:30:00", "午餐消费", "", "小石", "石帅", "", "25.00"],
            ["202604150012", "2026-04-03 18:00:00", "工资入账", "", "小张", "张瑶", "5000.00", ""],
            ["202604150013", "2026-04-03 20:00:00", "空金额行", "", "小王", "王明", "", ""],
        ]
    )

    records = parser.parse(content)

    assert len(records) == 2
    assert records[0].direction.value == "out"
    assert records[0].transaction_type.value == "expense"
    assert records[0].amount == Decimal("25.00")
    assert records[1].direction.value == "in"
    assert records[1].transaction_type.value == "income"
    assert records[1].amount == Decimal("5000.00")


def test_parse_bill_file_returns_available_operator_names_for_alipay_pouch(
    db_session,
    test_book,
    import_account_and_categories,
):
    content = build_alipay_pouch_xlsx_bytes(
        [
            ["202604150021", "2026-04-04 09:30:00", "淘宝购物", "", "小石", "石帅", "", "18.50"],
            ["202604150022", "2026-04-04 10:30:00", "工资入账", "", "小张", "张瑶", "5000", ""],
            ["202604150023", "2026-04-04 11:30:00", "朋友转账", "", "小李", "", "200", ""],
        ]
    )

    result = parse_bill_file(
        db=db_session,
        user_id=test_book.user_id,
        bill_type="alipay_pouch",
        filename="alipay_pouch.xlsx",
        content=content,
    )

    assert result.metadata.availableOperatorNames == ["张瑶", "石帅"]
    assert len(result.items) == 3
    rows = (
        db_session.query(ImportRow)
        .filter(ImportRow.batch_id == result.parseId)
        .order_by(ImportRow.row_no.asc())
        .all()
    )
    assert len(rows) == 3
    assert "operatorName" in (rows[0].normalized_data or "")


def test_confirm_import_skips_excluded_operator_names_for_alipay_pouch(
    db_session,
    test_book,
    import_account_and_categories,
    monkeypatch,
):
    account, expense_category, _ = import_account_and_categories
    content = build_alipay_pouch_xlsx_bytes(
        [
            ["202604150031", "2026-04-05 09:30:00", "淘宝购物", "", "小石", "石帅", "", "18.50"],
            ["202604150032", "2026-04-05 10:00:00", "淘宝购物", "", "小张", "张瑶", "", "20.00"],
        ]
    )
    parsed = parse_bill_file(
        db=db_session,
        user_id=test_book.user_id,
        bill_type="alipay_pouch",
        filename="alipay_pouch.xlsx",
        content=content,
    )

    confirmed_items = []
    for item in parsed.items:
        item.matchedAccountId = account.id
        item.matchedAccountName = account.name
        item.accountMatchStatus = "MATCHED"
        item.categoryId = expense_category.id
        item.categoryName = expense_category.name
        item.categoryMatchStatus = "MATCHED"
        item.unresolvedReason = None
        confirmed_items.append(item)

    created_order_nos = []

    def fake_create_transaction(db, book_id, txn_data):
        created_order_nos.append(txn_data.external_ref)
        return object()

    monkeypatch.setattr("src.modules.bills.service.create_transaction", fake_create_transaction)

    result = confirm_import(
        db=db_session,
        user_id=test_book.user_id,
        parse_id=parsed.parseId,
        confirmed_items=confirmed_items,
        excluded_operator_names=["石帅"],
    )

    assert result.importedRows == 1
    assert result.skippedRows == 1
    assert created_order_nos == ["202604150032"]

    skipped_row = (
        db_session.query(ImportRow)
        .filter(ImportRow.batch_id == parsed.parseId, ImportRow.row_no == 1)
        .first()
    )
    confirmed_row = (
        db_session.query(ImportRow)
        .filter(ImportRow.batch_id == parsed.parseId, ImportRow.row_no == 2)
        .first()
    )
    assert skipped_row.confirm_status == "skipped"
    assert skipped_row.error_message == "操作人姓名 石帅 已排除"
    assert confirmed_row.confirm_status == "confirmed"
