import csv
import io
import re
from datetime import datetime
from decimal import Decimal
from typing import Dict, List

from src.common.enums import TransactionDirection, TransactionType

from .base import BillParser, BillRecord


class JdBillParser(BillParser):
    """京东交易流水解析器"""
    
    # 有效状态
    ACCEPTED_STATUS = {
        "已完成",
        "交易成功",
    }
    
    # 忽略状态
    IGNORE_STATUS = {
        "已取消",
        "已关闭",
        "未支付",
        "待支付",
    }
    
    # 忽略关键词
    IGNORE_KEYWORDS = [
        "退款到余额",
        "京东余额充值",
        "提现",
    ]
    
    # 收入关键词
    INCOME_KEYWORDS = [
        "退款",
        "返",
    ]
    
    # 支出关键词
    EXPENSE_KEYWORDS = [
        "购物",
        "消费",
        "订单",
    ]

    def parse(self, content: bytes) -> List[BillRecord]:
        # 尝试多种编码
        for encoding in ["utf-8", "gbk", "gb18030", "utf-8-sig"]:
            try:
                text = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("无法识别文件编码")
        
        lines = text.splitlines()
        
        # 找到表头行
        header_index = self._find_header_index(lines)
        if header_index < 0:
            raise ValueError("未找到京东账单表头，请确认文件格式")
        
        csv_payload = "\n".join(lines[header_index:])
        
        # 尝试不同分隔符
        for delimiter in [",", "\t", ";"]:
            try:
                reader = csv.DictReader(io.StringIO(csv_payload), delimiter=delimiter)
                break
            except csv.Error:
                continue
        else:
            raise ValueError("无法解析CSV格式")
        
        raw_records: List[BillRecord] = []
        row_num = 1
        
        for idx, row in enumerate(reader, start=1):
            clean_row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
            if not clean_row:
                continue
            
            status = clean_row.get("交易状态", clean_row.get("状态", ""))
            
            # 跳过忽略状态
            if status in self.IGNORE_STATUS:
                continue
            
            # 只保留有效状态
            if status not in self.ACCEPTED_STATUS:
                continue
            
            # 检查是否需要忽略
            trade_type = clean_row.get("交易类型", "")
            # 优先使用交易说明作为描述，fallback到商品名称
            item_desc = clean_row.get("交易说明") or clean_row.get("商品名称", clean_row.get("商品", ""))
            ignore_reason = self._check_ignore(trade_type, item_desc, clean_row)
            if ignore_reason:
                continue
            
            # 解析字段
            occurred_at = self._parse_datetime(clean_row.get("交易时间", ""))
            amount = self._parse_amount(clean_row.get("金额", ""))
            direction, tx_type = self._resolve_direction(
                clean_row.get("收支", clean_row.get("收/支", "")),
                trade_type,
                item_desc
            )
            
            raw_records.append(
                BillRecord(
                    row_no=row_num,
                    occurred_at=occurred_at,
                    transaction_type=tx_type,
                    direction=direction,
                    amount=amount,
                    counterparty=clean_row.get("商户名称", clean_row.get("商家", "")) or None,
                    counterparty_account=None,
                    description=item_desc or None,
                    category=None,
                    in_out=clean_row.get("收支", clean_row.get("收/支", "")),
                    status=status,
                    transaction_order_no=clean_row.get("订单号", clean_row.get("交易订单号", "")),
                    merchant_order_no=None,
                    payment_method=clean_row.get("收/付款方式", clean_row.get("支付方式", "")) or None,
                    note=None,
                )
            )
            row_num += 1
        
        return raw_records

    def _find_header_index(self, lines: List[str]) -> int:
        """查找表头行"""
        for idx, line in enumerate(lines):
            if "交易时间" in line and ("金额" in line or "收支" in line):
                return idx
        return -1

    def _parse_datetime(self, value: str) -> datetime:
        """解析日期，截断到日"""
        if not value:
            raise ValueError("交易时间为空")
        value = value.strip()
        
        # 尝试多种日期格式
        for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.0", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"]:
            try:
                dt = datetime.strptime(value, fmt)
                return datetime(dt.year, dt.month, dt.day)  # 截断到日
            except ValueError:
                continue
        raise ValueError(f"无法解析日期: {value}")

    def _parse_amount(self, value: str) -> Decimal:
        """解析金额"""
        if not value:
            raise ValueError("金额为空")
        
        value = value.strip()
        normalized = (
            value.replace(",", "")
            .replace("¥", "")
            .replace("￥", "")
            .replace("元", "")
            .replace(" ", "")
            .strip()
        )
        
        if not normalized:
            raise ValueError("金额为空")
        
        # 去除非数字字符（保留负号表示支出）
        normalized = re.sub(r"[^\d.\-+]", "", normalized)
        if normalized in {"", "+", "-", ".", "+.", "-."}:
            raise ValueError("金额格式无效")
        
        amount = Decimal(normalized)
        return abs(amount)  # 存正数

    def _resolve_direction(self, in_out: str, trade_type: str, description: str) -> tuple:
        """解析收支方向"""
        in_out = in_out.strip() if in_out else ""
        
        # 直接使用收支字段
        if "收入" in in_out or "入" in in_out:
            return TransactionDirection.IN, TransactionType.INCOME
        if "支出" in in_out or "出" in in_out:
            return TransactionDirection.OUT, TransactionType.EXPENSE
        
        # 根据交易类型判断
        text = f"{trade_type} {description}".lower()
        
        # 退款处理：退款记为收入
        if "退款" in text:
            return TransactionDirection.IN, TransactionType.INCOME
        
        for keyword in self.INCOME_KEYWORDS:
            if keyword in text:
                return TransactionDirection.IN, TransactionType.INCOME
        
        for keyword in self.EXPENSE_KEYWORDS:
            if keyword in text:
                return TransactionDirection.OUT, TransactionType.EXPENSE
        
        # 未知类型默认支出
        return TransactionDirection.OUT, TransactionType.EXPENSE

    def _check_ignore(self, trade_type: str, item_desc: str, row_data: Dict) -> str:
        """检查是否需要忽略"""
        text = f"{trade_type} {item_desc}"
        
        for keyword in self.IGNORE_KEYWORDS:
            if keyword in text:
                return f"忽略: {keyword}"
        
        return ""
