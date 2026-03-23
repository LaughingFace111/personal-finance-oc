import io
import re
from datetime import datetime
from decimal import Decimal
from typing import Dict, List

from src.common.enums import TransactionDirection, TransactionType

from .base import BillParser, BillRecord


class WechatBillParser(BillParser):
    """微信支付账单解析器"""
    
    # 有效状态
    ACCEPTED_STATUS = {
        "支付成功",
        "已收款", 
        "已存入零钱",
        "转账成功",
        "收款成功",
        "对方已收钱",
        "对方已收款",
    }
    
    # 忽略关键词
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
    
    # 收入关键词
    INCOME_KEYWORDS = [
        "转账收入",
        "收款",
        "红包收入",
        "群收款",
    ]
    
    # 支出关键词
    EXPENSE_KEYWORDS = [
        "消费",
        "支付",
        "扫码支付",
        "付款",
    ]

    def parse(self, content: bytes) -> List[BillRecord]:
        # 尝试使用 openpyxl 读取 xlsx 文件
        try:
            import openpyxl
        except ImportError:
            raise ImportError("需要安装 openpyxl 库来解析微信 xlsx 文件: pip install openpyxl")
        
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
        
        # 找到表头行
        header_index = self._find_header_index(ws)
        if header_index < 0:
            raise ValueError("未找到微信账单表头，请确认文件格式")
        
        # 获取表头
        headers = [cell.value for cell in ws[header_index]]
        
        # 解析数据行
        raw_records: List[BillRecord] = []
        row_num = 1
        
        for row_idx in range(header_index + 1, ws.max_row + 1):
            row_data = {}
            for col_idx, header in enumerate(headers, start=1):
                if header:
                    cell_value = ws.cell(row_idx, col_idx).value
                    row_data[header] = cell_value
            
            if not row_data.get("交易时间"):
                continue
            
            status = row_data.get("当前状态", "")
            if status not in self.ACCEPTED_STATUS:
                # 跳过非有效状态
                continue
            
            # 检查是否需要忽略
            trade_type = row_data.get("交易类型", "")
            ignore_reason = self._check_ignore(trade_type, row_data)
            if ignore_reason:
                continue
            
            # 解析字段
            occurred_at = self._parse_datetime(row_data.get("交易时间", ""))
            amount = self._parse_amount(row_data.get("金额(元)", row_data.get("金额", "")))
            direction, tx_type = self._resolve_direction(
                row_data.get("收/支", ""),
                trade_type,
                row_data.get("商品", "")
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
        
        return raw_records

    def _find_header_index(self, ws) -> int:
        """查找表头行"""
        # 微信账单前几行是说明，找到包含"交易时间"的行
        for row_idx in range(1, min(25, ws.max_row + 1)):
            row_values = [ws.cell(row_idx, col).value for col in range(1, 15)]
            if any("交易时间" in str(v) for v in row_values):
                return row_idx
        return -1

    def _parse_datetime(self, value: str) -> datetime:
        """解析日期，截断到日"""
        if not value:
            raise ValueError("交易时间为空")
        value = str(value).strip()
        # 尝试多种日期格式
        for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.0", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"]:
            try:
                dt = datetime.strptime(value, fmt)
                return datetime(dt.year, dt.month, dt.day)  # 截断到日
            except ValueError:
                continue
        raise ValueError(f"无法解析日期: {value}")

    def _parse_amount(self, value) -> Decimal:
        """解析金额"""
        if value is None:
            raise ValueError("金额为空")
        
        # 转换为字符串并清理
        value = str(value).strip()
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
        
        # 去除非数字字符
        normalized = re.sub(r"[^\d.\-+]", "", normalized)
        if normalized in {"", "+", "-", ".", "+.", "-."}:
            raise ValueError("金额格式无效")
        
        amount = Decimal(normalized)
        return abs(amount)  # 存正数

    def _resolve_direction(self, in_out: str, trade_type: str, description: str) -> tuple:
        """解析收支方向"""
        in_out = in_out.strip() if in_out else ""
        
        # 优先使用收/支字段
        if in_out == "收入":
            return TransactionDirection.IN, TransactionType.INCOME
        if in_out == "支出":
            return TransactionDirection.OUT, TransactionType.EXPENSE
        
        # 根据交易类型判断
        text = f"{trade_type} {description}".lower()
        
        for keyword in self.INCOME_KEYWORDS:
            if keyword in text:
                return TransactionDirection.IN, TransactionType.INCOME
        
        for keyword in self.EXPENSE_KEYWORDS:
            if keyword in text:
                return TransactionDirection.OUT, TransactionType.EXPENSE
        
        # 微信退款处理：退款记为收入
        if "退款" in trade_type or "退款" in description:
            return TransactionDirection.IN, TransactionType.INCOME
        
        # 未知类型默认支出
        return TransactionDirection.OUT, TransactionType.EXPENSE

    def _check_ignore(self, trade_type: str, row_data: Dict) -> str:
        """检查是否需要忽略"""
        text = f"{trade_type} {row_data.get('商品', '')} {row_data.get('交易对方', '')}"
        
        for keyword in self.IGNORE_KEYWORDS:
            if keyword in text:
                return f"不计收支: {keyword}"
        
        return ""
