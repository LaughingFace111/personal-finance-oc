from typing import List

from .base import BillParser, BillRecord


class StubBillParser(BillParser):
    def __init__(self, name: str):
        self.name = name

    def parse(self, content: bytes) -> List[BillRecord]:
        raise NotImplementedError(f"{self.name} 账单解析器暂未实现")
