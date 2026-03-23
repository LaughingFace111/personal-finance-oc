import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from src.common.enums import CategoryType
from src.modules.accounts.models import Account
from src.modules.categories.models import Category


@dataclass
class AccountMatchResult:
    account_id: Optional[str]
    account_name: Optional[str]
    status: str
    warning: Optional[str] = None


@dataclass
class CategoryMatchResult:
    category_id: Optional[str]
    category_name: Optional[str]
    status: str
    warning: Optional[str] = None


class AccountMatcher:
    def __init__(self, db: Session, book_id: str):
        self.accounts: List[Account] = (
            db.query(Account)
            .filter(Account.book_id == book_id, Account.is_active == True)
            .all()
        )

    def match(self, raw_account_name: Optional[str]) -> AccountMatchResult:
        source = (raw_account_name or "").strip()
        if not source:
            return AccountMatchResult(None, None, "UNMATCHED", "缺少原始账户信息")

        lowered = source.lower()
        for account in self.accounts:
            if account.name and account.name.lower() == lowered:
                return AccountMatchResult(account.id, account.name, "MATCHED")

        digits = self._extract_digits(source)
        if digits:
            candidates: List[Account] = []
            for account in self.accounts:
                haystack = f"{account.name or ''} {account.card_last4 or ''} {account.institution_name or ''}"
                if digits in self._extract_digits(haystack):
                    candidates.append(account)
            if len(candidates) == 1:
                account = candidates[0]
                return AccountMatchResult(
                    account.id,
                    account.name,
                    "NEED_CONFIRM",
                    f"根据数字片段 {digits} 匹配到账户，请确认",
                )

        return AccountMatchResult(None, None, "UNMATCHED", f"无法匹配账户: {source}")

    def _extract_digits(self, text: str) -> str:
        found = re.findall(r"\d+", text)
        if not found:
            return ""
        combined = "".join(found)
        return combined[-4:] if len(combined) > 4 else combined


class CategoryMatcher:
    KEYWORDS = {
        "餐饮": ["餐饮", "外卖", "饭", "奶茶", "咖啡", "美食"],
        "交通": ["交通", "打车", "地铁", "公交", "滴滴", "出行", "油费", "停车"],
        "医疗": ["医疗", "医院", "药", "门诊", "体检", "挂号"],
        "购物": ["购物", "淘宝", "京东", "天猫", "超市", "便利店"],
        "工资": ["工资", "薪资", "奖金", "津贴"],
    }

    def __init__(self, db: Session, book_id: str):
        self.categories: List[Category] = (
            db.query(Category)
            .filter(Category.book_id == book_id, Category.is_active == True)
            .all()
        )

    def match(
        self,
        trade_category: Optional[str],
        item_desc: Optional[str],
        direction: str,
    ) -> CategoryMatchResult:
        category_type = CategoryType.EXPENSE.value if direction == "out" else CategoryType.INCOME.value
        typed_categories = [c for c in self.categories if c.category_type == category_type]
        text = f"{trade_category or ''} {item_desc or ''}".lower()

        if not text.strip():
            return CategoryMatchResult(None, None, "UNMATCHED", "缺少分类文本")

        for category in typed_categories:
            if category.name and category.name.lower() == (trade_category or "").strip().lower():
                return CategoryMatchResult(category.id, category.name, "MATCHED")

        matches: List[Tuple[Category, str]] = []
        for target_name, keywords in self.KEYWORDS.items():
            if not any(keyword in text for keyword in keywords):
                continue
            for category in typed_categories:
                if target_name in (category.name or ""):
                    matches.append((category, target_name))

        if len(matches) == 1:
            category, target_name = matches[0]
            return CategoryMatchResult(
                category.id,
                category.name,
                "NEED_CONFIRM",
                f"根据关键词 {target_name} 自动归类，请确认",
            )

        return CategoryMatchResult(None, None, "UNMATCHED", "无法自动归类")
