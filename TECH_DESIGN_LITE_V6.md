# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v6（最终极简补丁版）

---

## 1. get_billing_period() 账期算法修正

### 1.1 修正后的安全算法

```python
import calendar
from dateutil.relativedelta import relativedelta


def get_billing_date(year: int, month: int, billing_day: int) -> date:
    """获取指定年月的账单日（安全处理 29/30/31）"""
    _, last_day = calendar.monthrange(year, month)
    day = min(billing_day, last_day)
    return date(year, month, day)


def get_billing_period(billing_day: int, check_date: date) -> tuple:
    """
    按账单日切分账期（修正版）
    返回: (period_start, period_end)

    规则：
    - period_end = 当前账期的账单日
    - period_start = 上一个账期的账单日 + 1天
    """
    billing_day = int(billing_day)

    # 计算当前账期的结束日（账单日）
    if check_date.day >= billing_day:
        # 当月账单日已过，当前账期结束日 = 当月账单日
        period_end = get_billing_date(check_date.year, check_date.month, billing_day)
    else:
        # 当月账单日未过，当前账期结束日 = 上月账单日
        prev_month = check_date - relativedelta(months=1)
        period_end = get_billing_date(prev_month.year, prev_month.month, billing_day)

    # 计算上一个账期的结束日
    prev_period_end = period_end - relativedelta(months=1)
    prev_period_end = get_billing_date(prev_period_end.year, prev_period_end.month, billing_day)

    # 周期开始日 = 上一个账期结束日 + 1天
    period_start = prev_period_end + relativedelta(days=1)

    return period_start, period_end
```

### 1.2 示例

```
billing_day = 31

check_date = 2026-03-18（账单日已过）
→ period_end = get_billing_date(2026, 3, 31) = 2026-03-31
→ prev_period_end = 2026-02-28（2月自动取最后一天）
→ period_start = 2026-02-28 + 1天 = 2026-03-01
→ 账期: 2026-03-01 ~ 2026-03-31

check_date = 2026-03-10（账单日未过）
→ period_end = get_billing_date(2026, 2, 31) = 2026-02-28
→ prev_period_end = 2026-01-31
→ period_start = 2026-02-01
→ 账期: 2026-02-01 ~ 2026-02-28
```

---

## 2. repayment_loan 表述修正

### 2.1 修正后的对照表

#### 报表统计

| 交易类型 | 计入支出 | 计入收入 | 说明 |
|---------|---------|---------|------|
| expense | ✅ | ❌ | 普通支出 |
| income | ❌ | ✅ | 工资/兼职 |
| installment_purchase | ✅ | ❌ | 分期消费 |
| fee | ✅ | ❌ | 手续费/贷款利息 |
| transfer | ❌ | ❌ | 转账 |
| repayment_credit_card | ❌ | ❌ | 信用卡还款 |
| repayment_loan | ❌ | ❌ | 贷款本金还款 |
| installment_repayment | ❌ | ❌ | 分期还款 |
| debt_borrow | ❌ | ❌ | 借入 |
| debt_lend | ❌ | ❌ | 借出 |
| debt_receive_back | ❌ | ❌ | 收回 |
| debt_pay_back | ❌ | ❌ | 归还 |
| refund | ❌ | ❌ | 冲减支出 |

#### 现金流统计

| 交易类型 | 计入现金流 | 资产账户变化 | 负债账户变化 |
|---------|-----------|-------------|-------------|
| expense | ✅ | balance -= | debt += |
| income | ✅ | balance += | - |
| installment_purchase | ❌ | - | debt += |
| fee | ✅ | balance -= | - |
| repayment_credit_card | ❌ | balance -= | debt -= |
| repayment_loan | ❌ | balance -= | debt -= |
| installment_repayment | ❌ | balance -= | debt -= |
| transfer | ❌ | 转出-/转入+ | - |
| debt_borrow | ✅ | balance += | - |
| debt_lend | ✅ | balance -= | - |
| debt_receive_back | ✅ | balance += | - |
| debt_pay_back | ✅ | balance -= | - |
| refund(资产入账) | ✅ | balance += | - |
| refund(信用入账) | ❌ | - | debt -= |

### 2.2 贷款还款完整示例

```python
# 贷款本金部分 - repayment_loan
principal_txn = Transaction(
    transaction_type="repayment_loan",
    amount=principal_amount,
    include_in_expense=False,  # 不计入支出
    include_in_cashflow=False,  # 不计入现金流
    # 账户变化：balance -= principal, debt -= principal
)

# 贷款利息部分 - fee
interest_txn = Transaction(
    transaction_type="fee",
    amount=interest_amount,
    include_in_expense=True,   # 计入支出
    include_in_cashflow=True,  # 计入现金流
    # 账户变化：balance -= interest
)
```

---

## 3. 现金流定义优化

### 3.1 修正后的定义

**现金流报表 = 排除内部转账和负债本金偿还后的经营/消费现金流**

- 包含：收入、支出（含利息支出）、借贷款项
- 排除：转账、信用还款、贷款本金还款、分期还款

### 3.2 口径说明

| 包含 | 排除 |
|------|------|
| income（工资/兼职） | transfer（转账） |
| expense（消费支出） | repayment_credit_card |
| fee（手续费/利息） | repayment_loan（本金） |
| debt_borrow / debt_lend | installment_repayment |
| debt_receive_back / debt_pay_back |  |

---

## 4. business_key 空值规则补充

### 4.1 空值规则

```python
class Transaction(Base):
    business_key = Column(String(100), nullable=True)  # 允许为空
    source_type = Column(String(20), default="manual")

    __table_args__ = (
        # 组合唯一约束：仅对非空 business_key 生效
        UniqueConstraint("book_id", "source_type", "business_key",
                       name="uix_transaction_business_key"),
    )
```

### 4.2 幂等检查逻辑

```python
def create_transaction(db: Session, data: CreateTransactionDTO) -> Transaction:
    """交易创建 - 幂等检查只对非空 business_key 生效"""

    # 只有非空的 business_key 才检查幂等
    if data.business_key:
        existing = db.query(Transaction).filter(
            Transaction.book_id == data.book_id,
            Transaction.source_type == data.source_type,
            Transaction.business_key == data.business_key
        ).first()

        if existing:
            raise IdempotencyError(f"业务键已存在: {data.business_key}")

    # 手工录入的交易 business_key 可以为空
    txn = Transaction(
        business_key=data.business_key,  # 允许为空
        source_type=data.source_type,
        # ...
    )
    return txn
```

### 4.3 规则总结

| source_type | business_key | 幂等检查 | 唯一约束 |
|------------|-------------|---------|---------|
| manual | 可为空 | ❌ 不检查 | ✅ 不生效 |
| import | 必须非空 | ✅ 检查 | ✅ 生效 |
| external | 必须非空 | ✅ 检查 | ✅ 生效 |
| system | 必须非空 | ✅ 检查 | ✅ 生效 |

---

## 5. 统一后的完整对照表（v6 最终版）

### 5.1 报表统计

| transaction_type | 支出 | 收入 | 说明 |
|-----------------|------|------|------|
| expense | ✅ | ❌ | 普通支出 |
| income | ❌ | ✅ | 工资/兼职 |
| installment_purchase | ✅ | ❌ | 分期消费 |
| fee | ✅ | ❌ | 手续费/贷款利息 |
| transfer | ❌ | ❌ | 转账 |
| repayment_credit_card | ❌ | ❌ | 信用卡还款 |
| repayment_loan | ❌ | ❌ | 贷款本金 |
| installment_repayment | ❌ | ❌ | 分期还款 |
| debt_borrow | ❌ | ❌ | 借入 |
| debt_lend | ❌ | ❌ | 借出 |
| debt_receive_back | ❌ | ❌ | 收回 |
| debt_pay_back | ❌ | ❌ | 归还 |
| refund | ❌ | ❌ | 冲减支出 |

### 5.2 现金流统计

| transaction_type | 现金流 | 资产变化 | 负债变化 |
|-----------------|--------|---------|---------|
| expense | ✅ | balance -= | debt += |
| income | ✅ | balance += | - |
| installment_purchase | ❌ | - | debt += |
| fee | ✅ | balance -= | - |
| repayment_credit_card | ❌ | balance -= | debt -= |
| repayment_loan | ❌ | balance -= | debt -= |
| installment_repayment | ❌ | balance -= | debt -= |
| transfer | ❌ | 转出-/转入+ | - |
| debt_borrow | ✅ | balance += | - |
| debt_lend | ✅ | balance -= | - |
| debt_receive_back | ✅ | balance += | - |
| debt_pay_back | ✅ | balance -= | - |
| refund(资产) | ✅ | balance += | - |
| refund(信用) | ❌ | - | debt -= |

---

**文档版本**：v6.0（最终极简补丁版）  
**最后更新**：2026-03-18
