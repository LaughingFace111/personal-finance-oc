import csv
import io
import re
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Set

from src.common.enums import TransactionDirection, TransactionType

from .base import BillParser, BillRecord


class AlipayBillParser(BillParser):
    REQUIRED_HEADERS = [
        "交易时间",
        "交易分类",
        "交易对方",
        "对方账号",
        "商品说明",
        "收/支",
        "金额",
        "收/付款方式",
        "交易状态",
        "交易订单号",
        "商家订单号",
        "备注",
    ]

    ACCEPTED_STATUS = {"交易成功", "退款成功"}
    FIELD_ALIASES = {
        "occurred_at": ["交易时间"],
        "trade_category": ["交易分类"],
        "counterparty": ["交易对方"],
        "counterparty_account": ["对方账号"],
        "description": ["商品说明"],
        "in_out": ["收/支"],
        "amount": ["金额", "金额(元)", "金额（元）", "订单金额", "订单金额(元)", "订单金额（元）"],
        "payment_method": ["收/付款方式"],
        "status": ["交易状态"],
        "transaction_order_no": ["交易订单号"],
        "merchant_order_no": ["商家订单号"],
        "note": ["备注"],
    }

    def parse(self, content: bytes) -> List[BillRecord]:
        text = content.decode("gb18030")
        lines = text.splitlines()
        header_index = self._find_header_index(lines)
        if header_index < 0:
            raise ValueError("未找到支付宝账单表头，请确认文件格式")

        csv_payload = "\n".join(lines[header_index:])
        reader = csv.DictReader(io.StringIO(csv_payload))

        raw_records: List[BillRecord] = []
        for idx, row in enumerate(reader, start=1):
            clean_row = {
                self._normalize_header(k): (v or "").strip()
                for k, v in row.items()
                if k
            }
            if not clean_row:
                continue

            status = self._get_value(clean_row, "status")
            if status not in self.ACCEPTED_STATUS:
                continue

            transaction_order_no = self._get_value(clean_row, "transaction_order_no")
            if not transaction_order_no:
                continue

            in_out = self._get_value(clean_row, "in_out")
            trade_category = self._get_value(clean_row, "trade_category")
            description = self._get_value(clean_row, "description")

            tx_type, direction = self._resolve_type_direction(in_out, trade_category, description)
            occurred_at = self._parse_datetime(self._get_value(clean_row, "occurred_at"))
            amount = self._parse_amount(self._get_value(clean_row, "amount"))

            raw_records.append(
                BillRecord(
                    row_no=idx,
                    occurred_at=occurred_at,
                    transaction_type=tx_type,
                    direction=direction,
                    amount=amount,
                    counterparty=self._get_value(clean_row, "counterparty")
                    or self._get_value(clean_row, "counterparty_account")
                    or None,
                    counterparty_account=self._get_value(clean_row, "counterparty_account") or None,
                    description=description or None,
                    category=trade_category or None,
                    in_out=in_out,
                    status=status,
                    transaction_order_no=transaction_order_no,
                    merchant_order_no=self._get_value(clean_row, "merchant_order_no") or None,
                    payment_method=self._get_value(clean_row, "payment_method") or None,
                    note=self._get_value(clean_row, "note") or None,
                )
            )

        return self._apply_refund_pair_ignore(raw_records)

    def _find_header_index(self, lines: List[str]) -> int:
        for idx, line in enumerate(lines):
            if all(header in line for header in self.REQUIRED_HEADERS[:4]) and "交易订单号" in line:
                return idx
        return -1

    def _normalize_header(self, value: str) -> str:
        return value.replace("\ufeff", "").strip()

    def _get_value(self, row: Dict[str, str], field_name: str) -> str:
        aliases = self.FIELD_ALIASES[field_name]
        for alias in aliases:
            normalized_alias = self._normalize_header(alias)
            if normalized_alias in row:
                return row[normalized_alias]
        return ""

    def _parse_datetime(self, value: str) -> datetime:
        if not value:
            raise ValueError("交易时间为空")
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")

    def _parse_amount(self, value: str) -> Decimal:
        normalized = (
            value.replace(",", "")
            .replace("¥", "")
            .replace("￥", "")
            .replace("元", "")
            .strip()
        )
        if not normalized:
            raise ValueError("金额为空")
        normalized = re.sub(r"[^\d.\-+]", "", normalized)
        if normalized in {"", "+", "-", ".", "+.", "-."}:
            raise ValueError("金额格式无效")
        amount = Decimal(normalized)
        return abs(amount)

    def _resolve_type_direction(self, in_out: str, category: str, description: str):
        if in_out == "收入":
            return TransactionType.INCOME, TransactionDirection.IN
        if in_out == "支出":
            return TransactionType.EXPENSE, TransactionDirection.OUT

        text = f"{category} {description}".lower()
        income_keywords = ["退款", "返还", "红包", "收益", "工资", "奖金", "报销", "利息"]
        expense_keywords = ["消费", "付款", "购买", "充值", "缴费", "出行", "外卖", "打车"]

        if any(keyword in text for keyword in income_keywords):
            return TransactionType.INCOME, TransactionDirection.IN
        if any(keyword in text for keyword in expense_keywords):
            return TransactionType.EXPENSE, TransactionDirection.OUT

        # 支付宝“不计收支”兜底默认按支出处理，避免收入被高估
        return TransactionType.EXPENSE, TransactionDirection.OUT

    def _apply_refund_pair_ignore(self, records: List[BillRecord]) -> List[BillRecord]:
        refund_keys: Set[str] = set()
        for record in records:
            if record.status == "退款成功":
                key = record.merchant_order_no or record.transaction_order_no
                if key:
                    refund_keys.add(key)

        filtered: List[BillRecord] = []
        seen_trade_no: Dict[str, int] = {}

        for record in records:
            if record.transaction_order_no in seen_trade_no:
                continue

            pair_key = record.merchant_order_no or record.transaction_order_no
            refund_related = "退款" in (record.category or "") or "退款" in (record.description or "")
            if (
                pair_key
                and pair_key in refund_keys
                and record.status == "交易成功"
                and (record.in_out == "不计收支" or refund_related)
            ):
                continue

            seen_trade_no[record.transaction_order_no] = 1
            filtered.append(record)

        return filtered
