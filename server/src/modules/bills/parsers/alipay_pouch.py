import io
import re
import zipfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Sequence
from xml.etree import ElementTree as ET

from src.common.enums import TransactionDirection, TransactionType

from .base import BillParser, BillRecord


class AlipayPouchBillParser(BillParser):
    REQUIRED_HEADERS = {
        "订单号",
        "交易时间",
        "交易说明",
        "备注",
        "操作人昵称",
        "操作人姓名",
        "收入金额",
        "支出金额",
    }

    def parse(self, content: bytes) -> List[BillRecord]:
        try:
            return self._parse_xlsx(content)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"支付宝小荷包账单解析失败: {exc}") from exc

    def _parse_xlsx(self, content: bytes) -> List[BillRecord]:
        if not zipfile.is_zipfile(io.BytesIO(content)):
            raise ValueError("支付宝小荷包账单仅支持 XLSX 文件")

        sheet_rows = self._load_sheet_rows(content)
        header_row = self._find_header_row(sheet_rows)
        if header_row < 0:
            raise ValueError("未找到支付宝小荷包账单表头，请确认文件格式")

        headers = self._extract_headers(sheet_rows[header_row - 1])
        records: List[BillRecord] = []
        parsed_row_no = 1

        for row_values in sheet_rows[header_row:]:
            row_data: Dict[str, str] = {}
            for column_idx, header in enumerate(headers):
                if not header:
                    continue
                row_data[header] = row_values[column_idx] if column_idx < len(row_values) else ""

            if not any(row_data.values()):
                continue

            order_no = row_data.get("订单号", "")
            occurred_at_raw = row_data.get("交易时间", "")
            if not order_no or not occurred_at_raw:
                continue

            amount, direction, transaction_type, raw_direction = self._resolve_amount_direction(row_data)
            if amount is None or direction is None or transaction_type is None:
                continue

            records.append(
                BillRecord(
                    row_no=parsed_row_no,
                    occurred_at=self._parse_datetime(occurred_at_raw),
                    transaction_type=transaction_type,
                    direction=direction,
                    amount=amount,
                    counterparty=row_data.get("操作人昵称") or row_data.get("操作人姓名") or None,
                    counterparty_account=None,
                    description=row_data.get("交易说明") or None,
                    category=None,
                    in_out=raw_direction,
                    status="交易成功",
                    transaction_order_no=order_no,
                    merchant_order_no=None,
                    payment_method="支付宝小荷包",
                    note=row_data.get("备注") or None,
                    operator_nickname=row_data.get("操作人昵称") or None,
                    operator_name=row_data.get("操作人姓名") or None,
                )
            )
            parsed_row_no += 1

        if not records:
            raise ValueError("未解析到有效的支付宝小荷包账单记录，请确认文件内容")

        return records

    def _find_header_row(self, sheet_rows: Sequence[Sequence[str]]) -> int:
        for row_idx, row_values in enumerate(sheet_rows, start=1):
            if self._is_header_row(row_values):
                return row_idx
        return -1

    def _is_header_row(self, row_values: Sequence[str]) -> bool:
        return self.REQUIRED_HEADERS.issubset({value for value in row_values if value})

    def _extract_headers(self, row_values: Sequence[str]) -> List[str]:
        headers = [self._normalize_cell_value(value) for value in row_values]
        normalized = {value for value in headers if value}
        missing_headers = sorted(self.REQUIRED_HEADERS - normalized)
        if missing_headers:
            raise ValueError(f"支付宝小荷包账单表头缺少必要列: {', '.join(missing_headers)}")
        return headers

    def _normalize_cell_value(self, value) -> str:
        if value is None:
            return ""
        return str(value).replace("\ufeff", "").strip()

    def _load_sheet_rows(self, content: bytes) -> List[List[str]]:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            shared_strings = self._load_shared_strings(archive)
            sheet_path = self._resolve_first_sheet_path(archive)
            sheet_xml = archive.read(sheet_path)

        namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        root = ET.fromstring(sheet_xml)
        rows: List[List[str]] = []
        for row in root.findall(".//main:sheetData/main:row", namespace):
            values_by_index: Dict[int, str] = {}
            max_index = -1
            for cell in row.findall("main:c", namespace):
                cell_ref = cell.attrib.get("r", "")
                column_index = self._column_index_from_ref(cell_ref)
                if column_index < 0:
                    continue
                values_by_index[column_index] = self._extract_cell_value(cell, shared_strings, namespace)
                max_index = max(max_index, column_index)
            if max_index < 0:
                rows.append([])
                continue
            row_values = ["" for _ in range(max_index + 1)]
            for column_index, value in values_by_index.items():
                row_values[column_index] = self._normalize_cell_value(value)
            rows.append(row_values)
        return rows

    def _load_shared_strings(self, archive: zipfile.ZipFile) -> List[str]:
        path = "xl/sharedStrings.xml"
        if path not in archive.namelist():
            return []

        namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        root = ET.fromstring(archive.read(path))
        strings: List[str] = []
        for item in root.findall("main:si", namespace):
            parts = [node.text or "" for node in item.findall(".//main:t", namespace)]
            strings.append("".join(parts))
        return strings

    def _resolve_first_sheet_path(self, archive: zipfile.ZipFile) -> str:
        workbook_rels_path = "xl/_rels/workbook.xml.rels"
        if workbook_rels_path in archive.namelist():
            namespace = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
            root = ET.fromstring(archive.read(workbook_rels_path))
            for relation in root.findall("rel:Relationship", namespace):
                target = relation.attrib.get("Target", "")
                if "/worksheets/" in f"/{target}":
                    return target if target.startswith("xl/") else f"xl/{target.lstrip('/')}"

        default_sheet_path = "xl/worksheets/sheet1.xml"
        if default_sheet_path in archive.namelist():
            return default_sheet_path
        raise ValueError("支付宝小荷包账单缺少工作表数据")

    def _extract_cell_value(self, cell, shared_strings: Sequence[str], namespace) -> str:
        cell_type = cell.attrib.get("t")
        if cell_type == "inlineStr":
            return "".join(node.text or "" for node in cell.findall(".//main:t", namespace))

        raw_value = cell.findtext("main:v", default="", namespaces=namespace)
        if cell_type == "s":
            try:
                return shared_strings[int(raw_value)]
            except (IndexError, ValueError):
                return ""
        return raw_value or ""

    def _column_index_from_ref(self, cell_ref: str) -> int:
        letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
        if not letters:
            return -1
        index = 0
        for ch in letters:
            index = index * 26 + (ord(ch) - ord("A") + 1)
        return index - 1

    def _parse_datetime(self, value: str) -> datetime:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        raise ValueError(f"交易时间格式无效: {value}")

    def _parse_amount(self, value: str) -> Decimal:
        normalized = (
            value.replace(",", "")
            .replace("¥", "")
            .replace("￥", "")
            .replace("元", "")
            .strip()
        )
        if not normalized:
            return Decimal("0")
        normalized = re.sub(r"[^\d.\-+]", "", normalized)
        if normalized in {"", "+", "-", ".", "+.", "-."}:
            return Decimal("0")
        try:
            amount = Decimal(normalized)
        except (InvalidOperation, ValueError) as exc:
            raise ValueError(f"金额格式无效: {value}") from exc
        return abs(amount)

    def _resolve_amount_direction(self, row_data: Dict[str, str]):
        expense_amount = self._parse_amount(row_data.get("支出金额", ""))
        if expense_amount > 0:
            return (
                expense_amount,
                TransactionDirection.OUT,
                TransactionType.EXPENSE,
                "支出",
            )

        income_amount = self._parse_amount(row_data.get("收入金额", ""))
        if income_amount > 0:
            return (
                income_amount,
                TransactionDirection.IN,
                TransactionType.INCOME,
                "收入",
            )

        return None, None, None, ""
