import csv
import io
import re
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Sequence

from src.common.enums import TransactionDirection, TransactionType

from .base import BillParser, BillRecord


class WechatBillParser(BillParser):
    """微信支付账单解析器"""

    # 精确匹配：微信标准列头
    REQUIRED_HEADERS = {
        "交易时间",
        "交易类型",
        "交易对方",
        "商品",
        "收/支",
        "金额(元)",  # 注意：是 "金额(元)" 不是 "金额"
        "当前状态",
        "交易单号",
    }
    # 智能表头定位：只需这三列同时出现即认定是表头行
    KEY_HEADER_COLS = {"交易时间", "收/支", "金额(元)"}
    ENCODINGS = ("utf-8-sig", "gbk", "gb2312")

    ACCEPTED_STATUS = {
        "支付成功",
        "已收款",
        "已存入零钱",
        "转账成功",
        "收款成功",
        "对方已收钱",
        "对方已收款",
    }

    IGNORE_KEYWORDS = [
        "充值",
        "提现",
        "零钱转入",
        "零钱转出",
        "银行卡转入",
        "银行卡转出",
        "零钱充值",
        "提现到银行卡",
    ]

    INCOME_KEYWORDS = [
        "转账收入",
        "收款",
        "红包收入",
        "群收款",
    ]

    EXPENSE_KEYWORDS = [
        "消费",
        "支付",
        "扫码支付",
        "付款",
    ]

    def parse(self, content: bytes) -> List[BillRecord]:
        if self._looks_like_xlsx(content):
            return self._parse_xlsx(content)
        return self.parse_csv(content)

    def parse_csv(self, content: bytes) -> List[BillRecord]:
        try:
            text = self._decode_csv_content(content)
            lines = text.splitlines()
            header_index = self._find_csv_header_index(lines)
            if header_index < 0:
                raise ValueError("未找到微信账单表头，请确认导出的 CSV 文件格式")

            csv_payload = "\n".join(lines[header_index:])
            reader = csv.DictReader(io.StringIO(csv_payload))
            return self._parse_rows(reader)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"微信账单 CSV 解析失败: {exc}") from exc

    def _parse_xlsx(self, content: bytes) -> List[BillRecord]:
        try:
            import openpyxl
        except ImportError as exc:
            raise ValueError("缺少 openpyxl，暂时无法解析微信 xlsx 账单，请运行: pip install openpyxl") from exc

        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            ws = wb.active

            # ── 动态表头定位：跳过微信前 N 行元数据 ──
            # 微信 xlsx 前 17 行左右是账户统计元数据，真表头在第 17/18 行
            # 算法：逐行扫描，找到同时包含 "交易时间" + "收/支" + "金额(元)" 的行
            header_index = -1
            for row_idx in range(1, min(30, ws.max_row + 1)):
                row_values = [
                    self._normalize_cell_value(ws.cell(row_idx, col).value)
                    for col in range(1, 20)
                ]
                present = {v for v in row_values if v}
                if self.KEY_HEADER_COLS.issubset(present):
                    header_index = row_idx
                    break

            if header_index < 0:
                raise ValueError("未找到微信账单表头，请确认文件是从微信支付账单导出的")

            # ── 提取列头 ──
            headers = [
                self._normalize_cell_value(ws.cell(header_index, col).value)
                for col in range(1, ws.max_column + 1)
            ]

            # ── 逐行提取数据 ──
            rows: List[Dict[str, str]] = []
            for row_idx in range(header_index + 1, ws.max_row + 1):
                row_data: Dict[str, str] = {}
                has_data = False
                for col_idx, header in enumerate(headers, start=1):
                    if not header:
                        continue
                    cell_val = self._normalize_cell_value(ws.cell(row_idx, col_idx).value)
                    row_data[header] = cell_val
                    if cell_val:
                        has_data = True
                # 跳过空行
                if has_data:
                    rows.append(row_data)

            return self._parse_rows(rows)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"微信账单 xlsx 解析失败: {exc}") from exc

    def _parse_rows(self, rows: Sequence[Dict[str, str]]) -> List[BillRecord]:
        raw_records: List[BillRecord] = []
        row_num = 1

        for row_data in rows:
            if not row_data or not row_data.get("交易时间"):
                continue

            status = row_data.get("当前状态", "")
            if status not in self.ACCEPTED_STATUS:
                continue

            trade_type = row_data.get("交易类型", "")
            ignore_reason = self._check_ignore(trade_type, row_data)
            if ignore_reason:
                continue

            try:
                occurred_at = self._parse_datetime(row_data.get("交易时间", ""))
                amount = self._parse_amount(row_data.get("金额(元)", row_data.get("金额", "")))
                direction, tx_type = self._resolve_direction(
                    row_data.get("收/支", ""),
                    trade_type,
                    row_data.get("商品", ""),
                )

                raw_records.append(
                    BillRecord(
                        row_no=row_num,
                        occurred_at=occurred_at,
                        transaction_type=tx_type,
                        direction=direction,
                        amount=amount,
                        counterparty=row_data.get("交易对方") or None,
                        counterparty_account=None,
                        description=row_data.get("商品") or None,
                        category=None,
                        in_out=row_data.get("收/支", ""),
                        status=status,
                        transaction_order_no=row_data.get("交易单号", ""),
                        merchant_order_no=row_data.get("商户单号", "") or None,
                        payment_method=row_data.get("支付方式") or None,
                        note=row_data.get("备注") or None,
                    )
                )
                row_num += 1
            except Exception:
                continue

        if not raw_records:
            raise ValueError("未解析到有效的微信账单记录，请确认文件内容与账单类型")

        return raw_records

    def _find_sheet_header_index(self, ws) -> int:
        """兼容旧调用：KEY_HEADER_COLS 定位法覆盖更广"""
        for row_idx in range(1, min(30, ws.max_row + 1)):
            row_values = [
                self._normalize_cell_value(ws.cell(row_idx, col).value)
                for col in range(1, 20)
            ]
            present = {v for v in row_values if v}
            if self.KEY_HEADER_COLS.issubset(present):
                return row_idx
        return -1

    def _find_csv_header_index(self, lines: Sequence[str]) -> int:
        for idx, line in enumerate(lines[:25]):
            row_values = next(csv.reader([line]))
            normalized_row = [self._normalize_cell_value(value) for value in row_values]
            if self._is_header_row(normalized_row):
                return idx
        return -1

    def _is_header_row(self, row_values: Sequence[str]) -> bool:
        """兼容旧调用：使用 KEY_HEADER_COLS 快速判断"""
        normalized = {value for value in row_values if value}
        return self.KEY_HEADER_COLS.issubset(normalized)

    def _decode_csv_content(self, content: bytes) -> str:
        last_error = None
        for encoding in self.ENCODINGS:
            try:
                return content.decode(encoding)
            except UnicodeDecodeError as exc:
                last_error = exc
        raise ValueError("无法识别微信 CSV 编码，请使用 utf-8、gbk 或 gb2312 重新导出") from last_error

    def _looks_like_xlsx(self, content: bytes) -> bool:
        return content[:2] == b"PK"

    def _normalize_cell_value(self, value) -> str:
        if value is None:
            return ""
        return str(value).replace("\ufeff", "").strip()

    def _parse_datetime(self, value: str) -> datetime:
        if not value:
            raise ValueError("交易时间为空")
        value = str(value).strip()
        for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.0", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"]:
            try:
                dt = datetime.strptime(value, fmt)
                return datetime(dt.year, dt.month, dt.day)
            except ValueError:
                continue
        raise ValueError(f"无法解析日期: {value}")

    def _parse_amount(self, value) -> Decimal:
        """从各种格式的金额字段中提取数值：¥100.00、100.00、1,000.00 等"""
        if value is None:
            raise ValueError("金额为空")

        v = str(value).strip()
        # 剥离货币符号、全角符号、空格
        normalized = (
            v.replace("¥", "")
            .replace("￥", "")
            .replace("元", "")
            .replace(",", "")
            .replace(" ", "")
            .replace("\xa0", "")  # 不间断空格
            .strip()
        )
        if not normalized or normalized in {"+", "-"}:
            raise ValueError(f"金额为空或无效: {value!r}")

        # 去除所有非数字字符（保留小数点和正负号）
        normalized = re.sub(r"[^\d.\-+]", "", normalized)
        # 去掉尾部多余的点
        normalized = normalized.rstrip(".")
        if not normalized or normalized in {".", "+.", "-."}:
            raise ValueError(f"金额格式无效: {value!r}")

        try:
            amount = Decimal(normalized)
        except Exception:
            raise ValueError(f"金额转换失败: {value!r}")

        return abs(amount)  # 统一存正数，方向由 direction 字段控制

    def _resolve_direction(self, in_out: str, trade_type: str, description: str) -> tuple:
        """
        解析收支方向。
        - "收入" → IN
        - "支出" → OUT
        - "不计收支" / "/" / 空值 → 根据关键词兜底判断；都认不出来则抛异常由外层捕获跳过该行
        """
        in_out = (in_out or "").strip()

        if in_out == "收入":
            return TransactionDirection.IN, TransactionType.INCOME
        if in_out == "支出":
            return TransactionDirection.OUT, TransactionType.EXPENSE

        # "不计收支"、空白、"/" 等无法判断的情况，尝试关键词兜底
        text = f"{trade_type} {description}".lower()

        for keyword in self.INCOME_KEYWORDS:
            if keyword in text:
                return TransactionDirection.IN, TransactionType.INCOME

        for keyword in self.EXPENSE_KEYWORDS:
            if keyword in text:
                return TransactionDirection.OUT, TransactionType.EXPENSE

        if "退款" in trade_type or "退款" in description:
            return TransactionDirection.IN, TransactionType.INCOME

        # 仍然无法判断，抛异常让外层跳过该行（不抛 500）
        raise ValueError(f"无法识别收支方向：in_out={in_out!r}, trade_type={trade_type!r}")

    def _check_ignore(self, trade_type: str, row_data: Dict) -> str:
        text = f"{trade_type} {row_data.get('商品', '')} {row_data.get('交易对方', '')}"

        for keyword in self.IGNORE_KEYWORDS:
            if keyword in text:
                return f"不计收支: {keyword}"

        return ""
