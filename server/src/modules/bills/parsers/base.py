from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from src.common.enums import TransactionDirection, TransactionType


@dataclass
class BillRecord:
    row_no: int
    occurred_at: datetime
    transaction_type: TransactionType
    direction: TransactionDirection
    amount: Decimal
    counterparty: Optional[str]
    counterparty_account: Optional[str]
    description: Optional[str]
    category: Optional[str]
    in_out: str
    status: str
    transaction_order_no: str
    merchant_order_no: Optional[str]
    payment_method: Optional[str]
    note: Optional[str]
    operator_nickname: Optional[str] = None
    operator_name: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


class BillParser(ABC):
    @abstractmethod
    def parse(self, content: bytes) -> List[BillRecord]:
        """Parse source bill file into normalized bill records"""
