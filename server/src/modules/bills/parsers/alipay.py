import csv
import io
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from src.common.enums import TransactionDirection, TransactionType

from .base import BillParser, BillRecord


class AlipayBillParser(BillParser):
    ORPHAN_REFUND_WARNING = "⚠️ 该订单疑似退款订单/已退款订单，请分辨"

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

    ACCEPTED_STATUS = {"交易成功", "退款成功", "交易关闭"}
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

    @dataclass(frozen=True)
    class TradeFeature:
        kind: str
        original_order_no: Optional[str] = None
        refund_order_no: Optional[str] = None

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
            feature = self._classify_trade(
                in_out=in_out,
                status=status,
                transaction_order_no=transaction_order_no,
            )

            tx_type, direction = self._resolve_type_direction(
                in_out,
                trade_category,
                description,
                feature,
            )
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

    def _classify_trade(
        self,
        in_out: str,
        status: str,
        transaction_order_no: str,
    ) -> "AlipayBillParser.TradeFeature":
        if in_out == "不计收支" and "_" in transaction_order_no:
            original_order_no, refund_order_no = transaction_order_no.split("_", 1)
            if original_order_no and refund_order_no:
                return self.TradeFeature(
                    kind="A",
                    original_order_no=original_order_no,
                    refund_order_no=refund_order_no,
                )

        if in_out == "支出" and status == "交易关闭":
            return self.TradeFeature(kind="B", original_order_no=transaction_order_no)

        if in_out == "不计收支":
            return self.TradeFeature(kind="C")

        return self.TradeFeature(kind="OTHER")

    def _resolve_type_direction(
        self,
        in_out: str,
        category: str,
        description: str,
        feature: "AlipayBillParser.TradeFeature",
    ):
        if feature.kind == "A":
            return TransactionType.INCOME, TransactionDirection.IN

        if in_out == "收入":
            return TransactionType.INCOME, TransactionDirection.IN
        if in_out == "支出":
            return TransactionType.EXPENSE, TransactionDirection.OUT

        text = f"{category} {description}".lower()
        refund_keywords = ["退款", "退回", "返还", "退还", "售后"]
        income_keywords = ["退款", "返还", "红包", "收益", "工资", "奖金", "报销", "利息"]
        expense_keywords = ["消费", "付款", "购买", "充值", "缴费", "出行", "外卖", "打车"]

        if feature.kind == "C" and not any(keyword in text for keyword in refund_keywords):
            return TransactionType.EXPENSE, TransactionDirection.OUT

        if any(keyword in text for keyword in income_keywords):
            return TransactionType.INCOME, TransactionDirection.IN
        if any(keyword in text for keyword in expense_keywords):
            return TransactionType.EXPENSE, TransactionDirection.OUT

        # 支付宝“不计收支”兜底默认按支出处理，避免收入被高估
        return TransactionType.EXPENSE, TransactionDirection.OUT

    def _extract_feature(self, record: BillRecord) -> "AlipayBillParser.TradeFeature":
        transaction_order_no = record.transaction_order_no or ""
        if record.in_out == "不计收支" and "_" in transaction_order_no:
            original_order_no, refund_order_no = transaction_order_no.split("_", 1)
            if original_order_no and refund_order_no:
                return self.TradeFeature(
                    kind="A",
                    original_order_no=original_order_no,
                    refund_order_no=refund_order_no,
                )

        if record.in_out == "支出" and record.status == "交易关闭":
            return self.TradeFeature(kind="B", original_order_no=transaction_order_no)

        if record.in_out == "不计收支":
            return self.TradeFeature(kind="C")

        return self.TradeFeature(kind="OTHER")

    def _apply_refund_pair_ignore(self, records: List[BillRecord]) -> List[BillRecord]:
        refund_map: Dict[str, str] = {}
        refund_records_by_original: Dict[str, List[BillRecord]] = {}
        closed_records_by_original: Dict[str, List[BillRecord]] = {}

        for record in records:
            feature = self._extract_feature(record)
            if feature.kind == "A" and feature.original_order_no and feature.refund_order_no:
                refund_map[feature.refund_order_no] = feature.original_order_no
                refund_records_by_original.setdefault(feature.original_order_no, []).append(record)
            elif feature.kind == "B" and feature.original_order_no:
                closed_records_by_original.setdefault(feature.original_order_no, []).append(record)

        closed_map: Dict[str, str] = {}
        for original_order_no in closed_records_by_original:
            refund_records = refund_records_by_original.get(original_order_no, [])
            if refund_records:
                feature = self._extract_feature(refund_records[0])
                if feature.refund_order_no:
                    closed_map[original_order_no] = feature.refund_order_no

        ignored_ids = {
            id(record)
            for original_order_no in closed_map
            for record in refund_records_by_original.get(original_order_no, []) + closed_records_by_original.get(original_order_no, [])
        }

        filtered: List[BillRecord] = []
        for record in records:
            if id(record) in ignored_ids:
                continue

            feature = self._extract_feature(record)
            if feature.kind == "A" and feature.original_order_no:
                if feature.original_order_no not in closed_map:
                    record.warnings.append(self.ORPHAN_REFUND_WARNING)
            elif feature.kind == "B" and feature.original_order_no:
                if feature.original_order_no not in closed_map:
                    record.warnings.append(self.ORPHAN_REFUND_WARNING)

            filtered.append(record)

        return filtered
