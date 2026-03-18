# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v5（最终补丁版）

---

## 1. refund 账户影响逻辑修正

### 1.1 修正后的规则

**refund 只对实际退款入账账户做一次影响**，不再对原交易账户做重复调整：

```python
def apply_refund_effects(refund: Transaction, original: Transaction, refund_account: Account):
    """
    refund 只作用于实际入账账户，不重复调整原交易账户
    """
    # refund 进入资产账户
    if refund_account.account_type in ['cash', 'debit_card', 'ewallet', 'virtual']:
        refund_account.current_balance += refund.amount
        # 现金流：计入
        refund.include_in_cashflow = True

    # refund 进入信用账户（退到信用卡/花呗）
    elif refund_account.account_type in ['credit_card', 'credit_line']:
        refund_account.debt_amount -= refund.amount
        # 现金流：不计入（只是负债减少，无真实现金流入）
        refund.include_in_cashflow = False
```

**关键修正**：
- `related_transaction_id` 仅用于业务关联和统计冲减
- **不再**根据 `related_transaction_id` 重复调整原交易账户的余额/负债
- 避免双重记账

---

## 2. 现金流口径统一

### 2.1 现金流报表定义

**现金流报表 = 真实资金流（包含所有现金收支）**

| 交易类型 | 计入现金流 | 说明 |
|---------|-----------|------|
| income | ✅ | 现金流入 |
| expense | ✅ | 现金流出 |
| fee | ✅ | 现金流出 |
| installment_purchase | ❌ | 负债增加，无现金流 |
| transfer | ❌ | 内部转账，一减一增不影响净现金流 |
| repayment_credit_card | ❌ | 还信用卡，无净现金流（现金减少=负债减少） |
| repayment_loan | ❌ | 还贷款，无净现金流（现金减少=负债减少） |
| installment_repayment | ❌ | 还分期，无净现金流 |
| debt_borrow | ✅ | 现金流入 |
| debt_lend | ✅ | 现金流出 |
| debt_receive_back | ✅ | 现金流入 |
| debt_pay_back | ✅ | 现金流出 |
| refund | **根据入账账户** | 见下文 |

### 2.2 修正后的统计对照表

#### 报表统计（支出/收入）

| 类型 | 计入支出 | 计入收入 |
|------|---------|---------|
| expense | ✅ | ❌ |
| income | ❌ | ✅ |
| installment_purchase | ✅ | ❌ |
| fee | ✅ | ❌ |
| repayment_loan(利息) | ✅ | ❌ |
| debt_borrow | ❌ | ❌ |
| debt_receive_back | ❌ | ❌ |
| refund | ❌ | ❌（冲减支出） |

#### 现金流统计

| 类型 | 计入现金流 | 资产账户变化 | 负债账户变化 |
|------|-----------|-------------|-------------|
| expense | ✅ | balance -= | debt += |
| income | ✅ | balance += | - |
| installment_purchase | ❌ | - | debt += |
| fee | ✅ | balance -= | - |
| transfer | ❌ | 转出-/转入+ | - |
| repayment_credit_card | ❌ | balance -= | debt -= |
| repayment_loan | ❌ | balance -= | debt -= |
| installment_repayment | ❌ | balance -= | debt -= |
| debt_borrow | ✅ | balance += | - |
| debt_lend | ✅ | balance -= | - |
| debt_receive_back | ✅ | balance += | - |
| debt_pay_back | ✅ | balance -= | - |
| refund (入账资产) | ✅ | balance += | - |
| refund (入账信用) | ❌ | - | debt -= |

---

## 3. refund 现金流规则修正

### 3.1 根据入账账户决定

```python
def determine_refund_cashflow(refund_account: Account) -> bool:
    """根据退款入账账户类型决定是否计入现金流"""
    if refund_account.account_type in ['cash', 'debit_card', 'ewallet', 'virtual']:
        # 进入资产账户 = 有真实现金流入
        return True
    else:
        # 进入信用账户 = 只是负债减少，无现金流入
        return False
```

### 3.2 示例

| 场景 | 入账账户 | 计入现金流 | 账户影响 |
|------|---------|-----------|---------|
| 退货退款到银行卡 | debit_card | ✅ | 余额增加 |
| 退货退款到信用卡 | credit_card | ❌ | 负债减少 |
| 花呗退款 | credit_line | ❌ | 负债减少 |

---

## 4. billing_day 边界算法修正

### 4.1 安全日期计算

```python
import calendar
from dateutil.relativedelta import relativedelta

def get_billing_date(year: int, month: int, billing_day: int) -> date:
    """
    获取指定年月的账单日（安全处理 29/30/31）
    """
    # 获取该月最后一天
    _, last_day = calendar.monthrange(year, month)

    # 取 billing_day 和该月最后一天的较小值
    day = min(billing_day, last_day)

    return date(year, month, day)


def get_billing_period(billing_day: int, check_date: date) -> tuple:
    """
    按账单日切分账期（安全版）
    """
    billing_day = int(billing_day)

    # 计算当前账期的结束日
    if check_date.day >= billing_day:
        # 当月账单日已过，当前账期 = 当月账单日
        period_end = get_billing_date(check_date.year, check_date.month, billing_day)
    else:
        # 当月账单日未过，当前账期 = 上月账单日
        prev_month = check_date - relativedelta(months=1)
        period_end = get_billing_date(prev_month.year, prev_month.month, billing_day)

    # 周期开始日 = 上期结束日 + 1天
    period_start = period_end + relativedelta(days=1)

    # 处理跨年
    if period_start.month == 12 and period_end.month == 1:
        # 跨年情况，重新计算
        pass

    return period_start, period_end
```

### 4.2 示例

```
billing_day = 31

2026-01 查询：
- get_billing_date(2026, 1, 31) = 2026-01-31（1月有31天）

2026-02 查询：
- get_billing_date(2026, 2, 31) = 2026-02-28（2月只有28天，自动取最后一天）

2026-03 查询：
- get_billing_date(2026, 3, 31) = 2026-03-31（3月有31天）
```

---

## 5. business_key 唯一约束优化

### 5.1 组合唯一约束

**不对 business_key 做全局唯一约束**，改为按业务组合约束：

```python
class Transaction(Base):
    __tablename__ = "transactions"

    # ... 其他字段 ...

    business_key = Column(String(100))  # 可为空（手工录入时）
    source_type = Column(String(20), default="manual")  # manual/import/system/external

    __table_args__ = (
        # 组合唯一约束：同一账本内、同一业务来源，business_key 必须唯一
        # 手工录入的交易 business_key 为空，不受约束
        UniqueConstraint("book_id", "source_type", "business_key",
                        name="uix_transaction_business_key"),
    )
```

### 5.2 约束说明

| source_type | business_key 唯一性 | 示例 |
|------------|-------------------|------|
| manual | 可为空，不检查 | 手工录入 |
| import | 必须唯一 | `import:{batch_id}:{row_no}` |
| system | 必须唯一 | 系统生成 |
| external | 必须唯一 | `external:{account_id}:{external_txn_id}` |

### 5.3 手工录入处理

```python
def create_manual_transaction(data: CreateTransactionDTO) -> Transaction:
    """手工录入交易"""
    txn = Transaction(
        # business_key 为空，不需要唯一性检查
        source_type="manual",
        business_key=None,
        # ... 其他字段
    )
    return txn


def create_import_transaction(data: ImportTransactionDTO) -> Transaction:
    """导入交易 - 需要幂等检查"""
    business_key = f"import:{data.batch_id}:{data.row_no}"

    # 检查是否存在
    existing = db.query(Transaction).filter(
        Transaction.book_id == data.book_id,
        Transaction.source_type == "import",
        Transaction.business_key == business_key
    ).first()

    if existing:
        raise IdempotencyError(f"导入记录已存在: {business_key}")

    txn = Transaction(
        source_type="import",
        business_key=business_key,
        # ...
    )
    return txn
```

---

## 6. 统一后的完整对照表

### 6.1 报表统计

| 交易类型 | 计入支出 | 计入收入 | 说明 |
|---------|---------|---------|------|
| expense | ✅ | ❌ | 普通支出 |
| income | ❌ | ✅ | 工资/兼职 |
| installment_purchase | ✅ | ❌ | 分期消费 |
| fee | ✅ | ❌ | 手续费/利息 |
| repayment_loan(利息) | ✅ | ❌ | 贷款利息 |
| transfer | ❌ | ❌ | 转账 |
| repayment_credit_card | ❌ | ❌ | 信用还款 |
| repayment_loan(本金) | ❌ | ❌ | 贷款本金 |
| installment_repayment | ❌ | ❌ | 分期还款 |
| debt_borrow | ❌ | ❌ | 借入 |
| debt_lend | ❌ | ❌ | 借出 |
| debt_receive_back | ❌ | ❌ | 收回 |
| debt_pay_back | ❌ | ❌ | 归还 |
| refund | ❌ | ❌ | 冲减支出 |

### 6.2 现金流统计

| 交易类型 | 计入现金流 | 资产账户 | 负债账户 |
|---------|-----------|---------|---------|
| expense | ✅ | balance -= | debt += |
| income | ✅ | balance += | - |
| installment_purchase | ❌ | - | debt += |
| fee | ✅ | balance -= | - |
| repayment_credit_card | ❌ | balance -= | debt -= |
| repayment_loan(本金) | ❌ | balance -= | debt -= |
| repayment_loan(利息) | ✅ | balance -= | - |
| installment_repayment | ❌ | balance -= | debt -= |
| transfer | ❌ | 转出-/转入+ | - |
| debt_borrow | ✅ | balance += | - |
| debt_lend | ✅ | balance -= | - |
| debt_receive_back | ✅ | balance += | - |
| debt_pay_back | ✅ | balance -= | - |
| refund(资产入账) | ✅ | balance += | - |
| refund(信用入账) | ❌ | - | debt -= |

### 6.3 账户余额变化

| 交易类型 | 资产账户变化 | 负债账户变化 |
|---------|-------------|-------------|
| expense | balance -= amount | debt += amount |
| income | balance += amount | - |
| installment_purchase | - | debt += amount |
| fee | balance -= amount | - |
| repayment_credit_card | balance -= amount | debt -= amount |
| repayment_loan | balance -= amount | debt -= amount |
| installment_repayment | balance -= amount | debt -= amount |
| transfer | 转出-amount, 转入+amount | - |
| debt_borrow | balance += amount | - |
| debt_lend | balance -= amount | - |
| debt_receive_back | balance += amount | - |
| debt_pay_back | balance -= amount | - |
| refund(资产入账) | balance += amount | - |
| refund(信用入账) | - | debt -= amount |

---

**文档版本**：v5.0（最终补丁版）  
**最后更新**：2026-03-18
