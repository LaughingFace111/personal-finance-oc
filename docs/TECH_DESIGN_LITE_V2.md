# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v2

---

## 1. 账户模型重构

### 1.1 问题分析

原方案中 `accounts.current_balance` 语义混乱：
- 现金/借记卡：表示余额
- 信用卡：表示已用额度（欠款）
- 贷款账户：表示剩余本金

**问题**：一个字段同时表示"资产余额"和"负债金额"，导致报表计算复杂。

### 1.2 修订后的账户设计

```python
class Account(Base):
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    name = Column(String(100), nullable=False)
    account_type = Column(String(20), nullable=False)  # cash/debit_card/ewallet/credit_card/credit_line/loan/virtual
    institution_name = Column(String(100))
    card_last4 = Column(String(4))

    # === 信用账户专用 ===
    credit_limit = Column(Numeric(15, 2), default=0)  # 信用额度（信用卡/花呗）
    billing_day = Column(Integer)  # 账单日 1-31
    repayment_day = Column(Integer)  # 还款日 1-31

    # === 通用余额字段 ===
    opening_balance = Column(Numeric(15, 2), default=0)  # 开户/期初余额
    current_balance = Column(Numeric(15, 2), default=0)  # 当前余额（资产为正，负债为负）

    currency = Column(String(3), default="CNY")
    is_active = Column(Boolean, default=True)
    note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### 1.3 账户类型语义明确

| account_type | opening_balance | current_balance | credit_limit | 说明 |
|--------------|-----------------|-----------------|--------------|------|
| cash | 期初现金 | 当前现金余额 | - | 正数表示资产 |
| debit_card | 期初余额 | 当前余额 | - | 储蓄卡余额 |
| ewallet | 期初余额 | 当前余额 | - | 支付宝/微信 |
| credit_card | 0 | **已用额度（负数）** | 总额度 | 负数表示负债 |
| credit_line | 0 | **已用额度（负数）** | 总额度 | 花呗/白条 |
| loan | 贷款总额 | **剩余本金（正数）** | - | 正数表示负债 |
| virtual | 0 | 当前余额 | - | 中转账户 |

### 1.4 删除冗余字段

**从 accounts 表删除以下字段**（与 loan_plans 重复）：

| 删除字段 | 原因 |
|----------|------|
| loan_principal | 冗余，贷款本金信息在 loan_plans.principal_total |
| loan_interest_rate | 冗余，利率信息在 loan_plans.annual_interest_rate |

**贷款信息统一在 loan_plans 表管理**，accounts 只保留账户基本信息和余额。

---

## 2. transactions 统计口径修订

### 2.1 交易类型枚举

| transaction_type | direction | 计入支出 | 计入收入 | 计入现金流 | 账户余额变化 |
|-----------------|-----------|---------|---------|-----------|-------------|
| expense | out | ✅ | ❌ | ✅ | 主账户余额减少 |
| income | in | ❌ | ✅ | ✅ | 主账户余额增加 |
| transfer | internal | ❌ | ❌ | ❌ | 转出减少，转入增加 |
| repayment_credit_card | internal | ❌ | ❌ | ❌ | 转出减少，信用卡负债减少 |
| repayment_loan | internal | ❌ | ❌ | ❌ | 转出减少，贷款本金减少 |
| refund | in | ❌ | ❌ | ❌ | 余额增加（冲减原支出） |
| fee | out | ✅ | ❌ | ✅ | 主账户余额减少 |
| adjustment | internal | ❌ | ❌ | ❌ | 直接调整余额 |
| installment_purchase | out | ✅ | ❌ | ✅ | 信用卡负债增加 |
| installment_repayment | internal | ❌ | ❌ | ❌ | 负债减少 |
| debt_borrow | in | ❌ | ❌ | ✅ | 余额增加 |
| debt_lend | out | ❌ | ❌ | ✅ | 余额减少 |
| debt_receive_back | in | ❌ | ❌ | ✅ | 余额增加 |
| debt_pay_back | out | ❌ | ❌ | ✅ | 余额减少 |

### 2.2 支出统计口径

```
支出 = SUM(transactions WHERE transaction_type IN ('expense', 'fee') AND status = 'confirmed')
    + SUM(transactions WHERE transaction_type = 'installment_purchase' AND status = 'confirmed')
```

### 2.3 收入统计口径

```
收入 = SUM(transactions WHERE transaction_type = 'income' AND status = 'confirmed')
    + SUM(transactions WHERE transaction_type = 'debt_borrow' AND status = 'confirmed')
    + SUM(transactions WHERE transaction_type = 'debt_receive_back' AND status = 'confirmed')
```

**注意**：`refund` 默认不计入收入！

### 2.4 现金流统计口径

```
现金流(资产变动) = SUM(transactions WHERE include_in_cashflow = True AND status = 'confirmed')

排除项：
- transfer（内部转账，不影响净现金流）
- repayment_credit_card（信用还款不计入净现金流）
- repayment_loan（贷款还款不计入净现金流）
- installment_repayment（分期还款不计入净现金流）
```

### 2.5 退款冲减规则

**默认策略**：退款不计入收入，而是冲减原支出

```python
def calculate_expense_with_refund(book_id: str, date_from: date, date_to: date) -> dict:
    # 原始支出
    expenses = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_(['expense', 'fee', 'installment_purchase']),
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    # 关联退款的冲减
    refunds = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'refund',
        Transaction.related_transaction_id.isnot(None),
        Transaction.status == 'confirmed'
    ).all()

    refund_amounts = {t.related_transaction_id: t.amount for t in refunds}

    total_expense = 0
    for e in expenses:
        if e.id in refund_amounts:
            total_expense += e.amount - refund_amounts[e.id]
        else:
            total_expense += e.amount

    return {
        "gross_expense": sum(e.amount for e in expenses),
        "refund_deducted": sum(refund_amounts.values()),
        "net_expense": total_expense
    }
```

---

## 3. 分期统计口径

### 3.1 分期消费统计

| 阶段 | 统计口径 | 账户变化 |
|------|---------|---------|
| 消费发生时 | ✅ 一次性计入支出 | 信用卡负债增加 |
| 每期还款时 | ❌ 不重复计入支出 | 信用卡负债减少 |

### 3.2 分期手续费统计

**两种可选方案**：

| 方案 | 描述 | 推荐 |
|------|------|------|
| A：一次性计入 | 消费发生时，手续费 + 本金合计计入支出 | ✅ 推荐 |
| B：分摊计入 | 每期还款时，手续费分摊计入支出 | 复杂度高 |

**本方案采用方案 A**：

```python
# 分期消费发生时
transaction = Transaction(
    transaction_type="installment_purchase",
    account_id=credit_card_id,
    amount=total_amount + total_fee,  # 本金 + 手续费
    include_in_expense=True,  # 一次性计入支出
    business_key=installment_plan_id,
    # 分期计划中记录本金和手续费明细
)

# 分期计划
installment_plan = InstallmentPlan(
    principal_total=total_amount,
    fee_per_period=fee_per_period,
    total_fee=total_fee,  # 总手续费
)

# 每期还款
installment_repayment = Transaction(
    transaction_type="installment_repayment",
    amount=principal_per_period + fee_per_period,
    include_in_expense=False,  # 不重复计入支出
)
```

### 3.3 分期统计 SQL

```python
def get_installment_summary(book_id: str) -> dict:
    # 已完成分期消费（计入支出的部分）
    purchases = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'installment_purchase',
        Transaction.status == 'confirmed'
    ).all()

    # 已还分期（不重复计入）
    repayments = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'installment_repayment',
        Transaction.status == 'confirmed'
    ).all()

    return {
        "total_principal": sum(t.amount for t in purchases),  # 已计入支出本金
        "total_fee": sum(t.amount for t in purchases) * 0.05,  # 估算手续费
        "total_repaid": sum(t.amount for t in repayments),
        "remaining": sum(t.amount for t in purchases) - sum(t.amount for t in repayments)
    }
```

---

## 4. 现金流口径修订

### 4.1 总现金流报表（不包含转账类）

```python
def get_net_cashflow(book_id: str, date_from: date, date_to: date) -> dict:
    """净现金流：收入 - 支出（不含转账）"""
    transactions = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    income = sum(t.amount for t in transactions
                 if t.transaction_type in ['income', 'debt_borrow', 'debt_receive_back'])
    expense = sum(t.amount for t in transactions
                  if t.transaction_type in ['expense', 'fee', 'installment_purchase'])

    # 扣除退款冲减
    refunds = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'refund',
        Transaction.related_transaction_id.isnot(None)
    ).all()
    refund_map = {t.related_transaction_id: t.amount for t in refunds}

    adjusted_expense = 0
    for t in transactions:
        if t.transaction_type in ['expense', 'fee', 'installment_purchase']:
            if t.id in refund_map:
                adjusted_expense += t.amount - refund_map[t.id]
            else:
                adjusted_expense += t.amount

    return {
        "income": income,
        "expense": adjusted_expense,
        "net_cashflow": income - adjusted_expense
    }
```

### 4.2 账户余额变动表（包含所有变动）

```python
def get_account_balance_changes(book_id: str, date_from: date, date_to: date) -> list:
    """账户余额变动明细（包含转账）"""
    transactions = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    changes = {}
    for t in transactions:
        if t.account_id not in changes:
            changes[t.account_id] = 0
        if t.direction == 'in':
            changes[t.account_id] += t.amount
        elif t.direction == 'out':
            changes[t.account_id] -= t.amount
        # internal 不变

    return changes
```

---

## 5. business_key 规则

### 5.1 命名规则

```python
BUSSINESS_KEY_FORMAT = "{entity_type}:{entity_id}"

# 示例
# 分期计划: "installment:uuid-xxxx"
# 贷款计划: "loan:uuid-xxxx"
# 关联交易: "refund:uuid-xxxx"
```

### 5.2 用途边界

| business_key 场景 | 用途 | 幂等策略 |
|-------------------|------|---------|
| installment_purchase | 关联分期计划 | 每个分期计划对应一条 purchase |
| installment_repayment | 关联分期计划期次 | 每期一条，不可重复创建 |
| repayment_credit_card | 关联信用卡账户 | 可重复还款，支持部分还款 |
| repayment_loan | 关联贷款计划 | 每期一条，按期次检查 |
| refund | 关联原交易 | 只能退款一次，重复退款报错 |

### 5.3 幂等策略实现

```python
def create_transaction_with_idempotency(db: Session, data: CreateTransactionDTO) -> Transaction:
    # 分期还款幂等
    if data.transaction_type == 'installment_repayment':
        existing = db.query(Transaction).filter(
            Transaction.business_key == f"installment:{data.business_key}",
            Transaction.status == 'confirmed'
        ).first()
        if existing:
            raise IdempotencyError("此期分期还款已存在")

    # 退款幂等
    if data.transaction_type == 'refund' and data.related_transaction_id:
        existing = db.query(Transaction).filter(
            Transaction.related_transaction_id == data.related_transaction_id,
            Transaction.transaction_type == 'refund',
            Transaction.status == 'confirmed'
        ).first()
        if existing:
            raise IdempotencyError("此交易已存在退款")

    # 创建交易
    txn = Transaction(**data.dict())
    db.add(txn)
    db.commit()
    return txn
```

---

## 6. 修正后的 ER 关系

```
┌─────────────┐       ┌─────────────┐
│    User    │       │    Book     │
├─────────────┤       ├─────────────┤
│ id (PK)    │──1:N──│ id (PK)     │
│ email       │       │ user_id (FK)│
│ ...         │       │ name        │
└─────────────┘       └──────┬──────┘
                            │
                            │ 1:N
                            ▼
┌─────────────┐       ┌─────────────┐
│  Category   │       │   Account   │
├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │
│ book_id(FK) │       │ book_id(FK) │
│ parent_id   │       │ account_type│
│ name        │       │ current_bal │
│ category_type       │ credit_limit│
│ is_system   │       └──────┬──────┘
└──────┬──────┘              │
       │                     │ 1:N
       │ 1:N                 ▼
       ▼              ┌─────────────┐
┌─────────────┐       │ Transaction │
├─────────────┤       ├─────────────┤
│CategoryRule│       │ id (PK)     │
├─────────────┤       │ book_id(FK) │
│ book_id(FK) │       │ account_id  │
│ category_id │       │ category_id │
│ account_id  │       │ counterparty│
└─────────────┘       │ business_key│
                      │ related_txn │
                      └──────┬──────┘
                             │
                             │ N:1
                             ▼
┌─────────────┐       ┌─────────────┐
│  LoanPlan   │       │Installment  │
├─────────────┤       │   Plan      │
│ id (PK)     │       ├─────────────┤
│ account_id  │       │ id (PK)     │
│ principal   │       │ account_id  │
│ ...         │       │ transaction │
└──────┬──────┘       └──────┬──────┘
       │                     │
       │ 1:N                 │ 1:N
       ▼                     ▼
┌─────────────┐       ┌─────────────┐
│LoanSchedule │       │Installment  │
├─────────────┤       │ Schedule    │
│ loan_plan_id│       │ plan_id     │
│ period_no   │       │ period_no   │
└─────────────┘       └─────────────┘

┌─────────────┐       ┌─────────────┐
│ImportBatch  │       │ ImportRow   │
├─────────────┤       ├─────────────┤
│ id (PK)     │──1:N──│ id (PK)     │
│ book_id(FK) │       │ batch_id(FK)│
│ status      │       │ row_no      │
└─────────────┘       └─────────────┘
```

---

## 7. 唯一约束设计

### 7.1 表级唯一约束

| 表名 | 约束字段 | 约束名 | 说明 |
|------|---------|--------|------|
| users | email | uix_users_email | 邮箱唯一 |
| books | (user_id, name) | uix_books_user_name | 用户内账本名唯一 |
| accounts | (book_id, name) | uix_accounts_book_name | 账本内账户名唯一 |
| categories | (book_id, parent_id, name) | uix_categories_book_parent_name | 分类名同级唯一 |
| installment_schedules | (installment_plan_id, period_no) | uix_installment_period | 分期期次唯一 |
| loan_schedules | (loan_plan_id, period_no) | uix_loan_period | 贷款期次唯一 |
| import_rows | (batch_id, row_no) | uix_import_row_batch | 导入批次内行号唯一 |

### 7.2 业务唯一约束

| 场景 | 约束方式 | 实现 |
|------|---------|------|
| 分期还款重复 | 检查 business_key 存在 | 幂等检查 |
| 退款重复 | 检查 related_transaction_id | 幂等检查 |
| 导入行重复 | import_hash + batch_id 联合索引 | 去重哈希 |
| 分类重名 | (book_id, parent_id, name) 唯一约束 | 数据库约束 |

### 7.3 索引设计

```python
# transactions 索引
Index("ix_transactions_book_id", Transaction.book_id)
Index("ix_transactions_occurred_at", Transaction.occurred_at)
Index("ix_transactions_account_id", Transaction.account_id)
Index("ix_transactions_category_id", Transaction.category_id)
Index("ix_transactions_import_hash", Transaction.import_hash)
Index("ix_transactions_status", Transaction.status)
Index("ix_transactions_business_key", Transaction.business_key)
Index("ix_transactions_related_transaction_id", Transaction.related_transaction_id)

# import_rows 索引
Index("ix_import_rows_batch_id", ImportRow.batch_id)
Index("ix_import_rows_confirm_status", ImportRow.confirm_status)
Index("ix_import_rows_batch_rowno", ImportRow.batch_id, ImportRow.row_no)  # 唯一

# accounts 索引
Index("ix_accounts_book_id", Account.book_id)
Index("ix_accounts_type", Account.account_type)

# categories 索引
Index("ix_categories_book_id", Category.book_id)
Index("ix_categories_parent_id", Category.parent_id)

# loan_schedules 索引
Index("ix_loan_schedules_plan_id", LoanSchedule.loan_plan_id)
Index("ix_loan_schedules_due_date", LoanSchedule.due_date)

# installment_schedules 索引
Index("ix_installment_schedules_plan_id", InstallmentSchedule.installment_plan_id)
Index("ix_installment_schedules_due_date", InstallmentSchedule.due_date)
```

---

## 8. 交易类型对照表（最终版）

### 8.1 支出类

| 类型 | 账户余额 | 负债变化 | 计入支出 | 计入现金流 | 关联业务 |
|------|---------|---------|---------|-----------|---------|
| expense | 减少 | - | ✅ | ✅ | - |
| fee | 减少 | - | ✅ | ✅ | - |
| installment_purchase | - | 增加 | ✅ | ✅ | installment_plans |
| debt_lend | 减少 | - | ❌ | ✅ | - |

### 8.2 收入类

| 类型 | 账户余额 | 负债变化 | 计入收入 | 计入现金流 | 关联业务 |
|------|---------|---------|---------|-----------|---------|
| income | 增加 | - | ✅ | ✅ | - |
| debt_borrow | 增加 | - | ✅ | ✅ | - |
| debt_receive_back | 增加 | - | ✅ | ✅ | - |

### 8.3 转账类（不计入收支）

| 类型 | 转出账户 | 转入账户 | 计入现金流 | 负债变化 | 关联业务 |
|------|---------|---------|-----------|---------|---------|
| transfer | 减少 | 增加 | ❌ | - | - |
| repayment_credit_card | 减少 | 负债减少 | ❌ | 减少 | - |
| repayment_loan | 减少 | 本金减少 | ❌ | 减少 | loan_plans |
| installment_repayment | 减少 | 负债减少 | ❌ | 减少 | installment_plans |

### 8.4 调整类

| 类型 | 余额变化 | 计入支出 | 计入收入 | 说明 |
|------|---------|---------|---------|------|
| refund | 增加 | ❌ | ❌ | 冲减原支出 via related_transaction_id |
| adjustment | 自定义 | ❌ | ❌ | 直接调整余额 |

---

## 9. 修订要点总结

| 修订项 | 修订内容 |
|--------|---------|
| accounts 表 | current_balance 统一：正数=资产，负数=负债 |
| 删除冗余字段 | loan_principal, loan_interest_rate 移至 loan_plans |
| 退款口径 | refund 不计入收入，通过 related_transaction_id 冲减 |
| 现金流口径 | transfer/repayment_credit_card/repayment_loan/installment_repayment 不计入净现金流 |
| 分期口径 | 消费发生时一次性计入支出，手续费计入本金；每期还款不重复计入 |
| business_key | 格式 `entity_type:entity_id`，实现幂等检查 |
| ER 关系 | 修正 relationship，删除冗余字段 |
| 唯一约束 | import_rows 增加 (batch_id, row_no) 唯一约束 |

---

**文档版本**：v2.0  
**最后更新**：2026-03-18
