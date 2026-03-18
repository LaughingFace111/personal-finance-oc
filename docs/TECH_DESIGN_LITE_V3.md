# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v3

---

## 1. 账户模型重构（最终版）

### 1.1 字段定义

```python
class Account(Base):
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    name = Column(String(100), nullable=False)
    account_type = Column(String(20), nullable=False)
    institution_name = Column(String(100))
    card_last4 = Column(String(4))

    # === 信用账户专用 ===
    credit_limit = Column(Numeric(15, 2), default=0)  # 信用额度（信用卡/花呗）
    billing_day = Column(Integer)  # 账单日 1-31
    repayment_day = Column(Integer)  # 还款日 1-31

    # === 资产/负债余额 ===
    # 仅适用于 cash/debit_card/ewallet/virtual 类型
    opening_balance = Column(Numeric(15, 2), default=0)  # 期初余额
    current_balance = Column(Numeric(15, 2), default=0)  # 当前余额

    # === 负债金额（仅适用于 credit_card/credit_line/loan 类型）===
    debt_amount = Column(Numeric(15, 2), default=0)  # 当前负债金额

    currency = Column(String(3), default="CNY")
    is_active = Column(Boolean, default=True)
    note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### 1.2 账户类型与字段对应

| account_type | opening_balance | current_balance | debt_amount | credit_limit |
|--------------|-----------------|-----------------|-------------|--------------|
| cash | ✅ 期初现金 | ✅ 当前余额 | - | - |
| debit_card | ✅ 期初余额 | ✅ 当前余额 | - | - |
| ewallet | ✅ 期初余额 | ✅ 当前余额 | - | - |
| virtual | ✅ 期初余额 | ✅ 当前余额 | - | - |
| credit_card | - | - | ✅ 欠款金额 | ✅ 额度 |
| credit_line | - | - | ✅ 欠款金额 | ✅ 额度 |
| loan | - | - | ✅ 剩余本金 | - |

### 1.3 字段语义

| 字段 | 适用类型 | 说明 |
|------|---------|------|
| opening_balance | 资产类 | 开户/期初余额，用于对账 |
| current_balance | 资产类 | 实时余额，由交易流水计算得出 |
| debt_amount | 负债类 | 信用欠款/贷款剩余本金，由交易流水计算得出 |
| credit_limit | 信用类 | 信用卡/花呗额度 |

---

## 2. transactions 统计口径修正

### 2.1 报表统计 vs 账户余额变化 - 分离说明

**报表统计口径**（用于报表展示）：

| 交易类型 | 计入支出 | 计入收入 | 计入现金流 | 说明 |
|---------|---------|---------|-----------|------|
| expense | ✅ | ❌ | ✅ | 现金流出 |
| income | ❌ | ✅ | ✅ | 现金流入 |
| installment_purchase | ✅ | ❌ | ❌ | 负债增加，无现金流 |
| fee | ✅ | ❌ | ✅ | 手续费 |
| transfer | ❌ | ❌ | ❌ | 内部转账 |
| repayment_credit_card | ❌ | ❌ | ❌ | 信用还款，无现金流 |
| repayment_loan | ❌ | ❌ | ❌ | 贷款还款，无现金流 |
| installment_repayment | ❌ | ❌ | ❌ | 分期还款，无现金流 |
| debt_borrow | ❌ | ❌ | ✅ | 借入，有现金流 |
| debt_lend | ❌ | ❌ | ✅ | 借出，有现金流 |
| debt_receive_back | ❌ | ❌ | ✅ | 收回借款，有现金流 |
| debt_pay_back | ❌ | ❌ | ✅ | 归还借款，有现金流 |
| refund | ❌ | ❌ | ❌ | 冲减原支出，不单独统计 |

**账户余额变化**（用于更新账户状态）：

| 交易类型 | 资产类账户 | 信用/负债类账户 | 说明 |
|---------|-----------|----------------|------|
| expense | current_balance -= amount | debt_amount += amount | 现金减少 / 负债增加 |
| income | current_balance += amount | - | 现金增加 |
| installment_purchase | - | debt_amount += amount | 负债增加 |
| fee | current_balance -= amount | - | 现金减少 |
| transfer | 转出-amount, 转入+amount | - | 一减一增 |
| repayment_credit_card | current_balance -= amount | debt_amount -= amount | 现金减少，负债减少 |
| repayment_loan | current_balance -= amount | debt_amount -= amount | 现金减少，负债减少 |
| installment_repayment | current_balance -= amount | debt_amount -= amount | 现金减少，负债减少 |
| debt_borrow | current_balance += amount | - | 现金增加 |
| debt_lend | current_balance -= amount | - | 现金减少 |
| debt_receive_back | current_balance += amount | - | 现金增加 |
| debt_pay_back | current_balance -= amount | - | 现金减少 |
| refund | current_balance += amount | debt_amount -= amount | 现金增加，负债减少（冲减原消费） |

### 2.2 收入报表 vs 现金流报表 - 区别定义

| 报表类型 | 口径 | 包含内容 |
|---------|------|---------|
| **收入报表** | 实际现金流入 | income（工资、兼职等） |
| **现金流报表** | 资金变动（含借贷款） | income + debt_borrow + debt_receive_back |

```python
# 收入报表
income_report = SUM(transactions WHERE transaction_type = 'income')

# 现金流报表
cashflow_report = SUM(transactions WHERE transaction_type IN
    ('income', 'expense', 'fee', 'debt_borrow', 'debt_lend', 'debt_receive_back', 'debt_pay_back'))
```

**区别**：
- 收入报表：反映经营/劳动所得
- 现金流报表：反映资金全貌（含借贷）

---

## 3. 分期统计口径修正

### 3.1 installment_purchase 修正

| 统计项 | 计入 | 说明 |
|--------|------|------|
| 支出 | ✅ | 消费发生时一次性计入 |
| 现金流 | ❌ | 无真实现金流出，只是负债增加 |

### 3.2 分期手续费统计

使用 installment_plans / installment_schedules 中的真实字段：

```python
def get_installment_summary(book_id: str) -> dict:
    """分期汇总 - 使用真实字段"""
    plans = db.query(InstallmentPlan).filter(
        InstallmentPlan.book_id == book_id,
        InstallmentPlan.status == 'active'
    ).all()

    total_principal = 0
    total_fee = 0
    total_repaid = 0
    total_remaining = 0

    for plan in plans:
        # 已计入支出的本金（来自 transaction）
        purchases = db.query(Transaction).filter(
            Transaction.business_key == f"installment:{plan.id}",
            Transaction.transaction_type == 'installment_purchase',
            Transaction.status == 'confirmed'
        ).all()
        principal = sum(t.amount for t in purchases)

        # 已还本金和手续费（来自 installment_schedules）
        schedules = db.query(InstallmentSchedule).filter(
            InstallmentSchedule.installment_plan_id == plan.id,
            InstallmentSchedule.status == 'paid'
        ).all()
        repaid = sum(s.total_due for s in schedules)

        total_principal += plan.total_amount
        total_fee += plan.total_fee
        total_repaid += repaid
        total_remaining += (plan.total_amount + plan.total_fee) - repaid

    return {
        "total_principal": total_principal,
        "total_fee": total_fee,
        "total_repaid": total_repaid,
        "total_remaining": total_remaining
    }
```

---

## 4. business_key 命名规则（最终版）

### 4.1 命名格式

```
business_key = "{entity_type}:{entity_id}:{sub_suffix}"
```

### 4.2 各类交易命名规则

| 交易类型 | business_key 格式 | 唯一性 | 说明 |
|---------|------------------|--------|------|
| installment_purchase | `installment:{plan_id}` | 必须唯一 | 每个分期计划对应一条 |
| installment_repayment | `installment:{plan_id}:p{period_no}` | 必须唯一 | 每期一条 |
| repayment_loan | `loan:{plan_id}:p{period_no}` | 必须唯一 | 每期一条 |
| refund | `refund:{original_txn_id}:{seq}` | 可重复 | 支持多次部分退款 |
| import | `import:{batch_id}:{row_no}` | 必须唯一 | 每条导入记录 |

### 4.3 幂等策略

```python
# 分期/贷款还款 - 必须唯一
def check_repayment_idempotency(db, business_key: str) -> bool:
    existing = db.query(Transaction).filter(
        Transaction.business_key == business_key,
        Transaction.status == 'confirmed'
    ).first()
    return existing is not None

# 退款 - 允许多次部分退款，总额不超过原交易
def check_refund_limit(db, original_transaction_id: str, new_refund_amount: Decimal) -> bool:
    original = db.query(Transaction).filter(
        Transaction.id == original_transaction_id
    ).first()

    refunded = db.query(func.sum(Transaction.amount)).filter(
        Transaction.related_transaction_id == original_transaction_id,
        Transaction.transaction_type == 'refund',
        Transaction.status == 'confirmed'
    ).scalar() or 0

    return (refunded + new_refund_amount) <= original.amount
```

---

## 5. 退款规则修正

### 5.1 允许多次部分退款

```python
# 退款逻辑
def create_refund(db, original_transaction_id: str, refund_amount: Decimal, account_id: str) -> Transaction:
    original = db.query(Transaction).filter(
        Transaction.id == original_transaction_id
    ).first()

    # 计算已退金额
    total_refunded = db.query(func.sum(Transaction.amount)).filter(
        Transaction.related_transaction_id == original_transaction_id,
        Transaction.transaction_type == 'refund',
        Transaction.status == 'confirmed'
    ).scalar() or 0

    # 检查不超过原金额
    if total_refunded + refund_amount > original.amount:
        raise ValueError(f"退款总额 {total_refunded + refund_amount} 超过原交易金额 {original.amount}")

    # 创建退款记录
    refund = Transaction(
        transaction_type='refund',
        direction='in',
        amount=refund_amount,
        account_id=account_id,
        related_transaction_id=original_transaction_id,
        business_key=f"refund:{original_transaction_id}:{int(time.time())}",
        status='confirmed'
    )

    # 更新原交易（可选：冲减支出）
    # original.include_in_expense = False  # 可选：不计入支出

    return refund
```

---

## 6. categories 唯一约束修正

### 6.1 修正后的唯一约束

```python
class Category(Base):
    __tablename__ = "categories"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    parent_id = Column(String(36), ForeignKey("categories.id"))
    name = Column(String(100), nullable=False)
    category_type = Column(String(20), nullable=False)  # expense/income/transfer/repayment/adjustment/refund
    icon = Column(String(50))
    color = Column(String(20))
    sort_order = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    keywords = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("book_id", "parent_id", "name", "category_type",
                         name="uix_category_book_parent_name_type"),
    )
```

**修正**：增加 `category_type` 到唯一约束，确保同一账本、同一父分类下、同一类型下分类名唯一。

---

## 7. 信用卡账单归属规则

### 7.1 账单归属字段优先级

```python
def get_transaction_billing_date(transaction: Transaction) -> date:
    """获取交易归属的账单日期"""
    # 优先使用 posted_at（入账时间）
    if transaction.posted_at:
        return transaction.posted_at.date()
    # 回退到 occurred_at（发生时间）
    return transaction.occurred_at.date()
```

### 7.2 账单周期计算

```python
def get_billing_cycle(billing_day: int, check_date: date) -> tuple:
    """获取账单周期（开始日期, 结束日期）"""
    # 账单日
    billing_day = int(billing_day)

    # 当前账期：如果检查日期 >= 账单日，则为当月；否则为上月
    if check_date.day >= billing_day:
        cycle_start = check_date.replace(day=1)
        # 下月第一天减一天
        if check_date.month == 12:
            cycle_end = check_date.replace(year=check_date.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            cycle_end = check_date.replace(month=check_date.month + 1, day=1) - timedelta(days=1)
    else:
        # 上月
        if check_date.month == 1:
            cycle_start = check_date.replace(year=check_date.year - 1, month=12, day=1)
        else:
            cycle_start = check_date.replace(month=check_date.month - 1, day=1)
        cycle_end = check_date.replace(day=1) - timedelta(days=1)

    return cycle_start, cycle_end
```

---

## 8. 唯一约束汇总（最终版）

### 8.1 表级唯一约束

| 表名 | 约束字段 | 约束名 |
|------|---------|--------|
| users | email | uix_users_email |
| books | (user_id, name) | uix_books_user_name |
| accounts | (book_id, name) | uix_accounts_book_name |
| categories | (book_id, parent_id, name, category_type) | uix_category_book_parent_name_type |
| installment_schedules | (installment_plan_id, period_no) | uix_installment_period |
| loan_schedules | (loan_plan_id, period_no) | uix_loan_period |
| import_rows | (batch_id, row_no) | uix_import_row_batch |

### 8.2 业务唯一约束

| 场景 | 约束方式 |
|------|---------|
| 分期还款 | business_key 唯一 |
| 贷款还款 | business_key 唯一 |
| 退款 | 总额不超过原交易金额 |

---

## 9. 交易类型对照表（最终版）

### 9.1 报表统计

| 类型 | 支出 | 收入 | 现金流 | 说明 |
|------|------|------|--------|------|
| expense | ✅ | ❌ | ✅ | 消费支出 |
| income | ❌ | ✅ | ✅ | 工资/兼职 |
| installment_purchase | ✅ | ❌ | ❌ | 分期消费（负债） |
| fee | ✅ | ❌ | ✅ | 手续费 |
| transfer | ❌ | ❌ | ❌ | 转账 |
| repayment_credit_card | ❌ | ❌ | ❌ | 信用还款 |
| repayment_loan | ❌ | ❌ | ❌ | 贷款还款 |
| installment_repayment | ❌ | ❌ | ❌ | 分期还款 |
| debt_borrow | ❌ | ❌ | ✅ | 借入 |
| debt_lend | ❌ | ❌ | ✅ | 借出 |
| debt_receive_back | ❌ | ❌ | ✅ | 收回 |
| debt_pay_back | ❌ | ❌ | ✅ | 归还 |
| refund | ❌ | ❌ | ❌ | 退款冲减 |

### 9.2 账户余额变化

| 类型 | 资产账户 | 信用/负债账户 |
|------|---------|-------------|
| expense | balance -= amount | debt += amount |
| income | balance += amount | - |
| installment_purchase | - | debt += amount |
| fee | balance -= amount | - |
| transfer | 转出-, 转入+ | - |
| repayment_credit_card | balance -= amount | debt -= amount |
| repayment_loan | balance -= amount | debt -= amount |
| installment_repayment | balance -= amount | debt -= amount |
| debt_borrow | balance += amount | - |
| debt_lend | balance -= amount | - |
| debt_receive_back | balance += amount | - |
| debt_pay_back | balance -= amount | - |
| refund | balance += amount | debt -= amount |

---

**文档版本**：v3.0  
**最后更新**：2026-03-18
