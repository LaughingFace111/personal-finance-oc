# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v4（最终版）

---

## 1. repayment_loan 统计口径修正

### 1.1 贷款还款拆分逻辑

贷款还款必须拆分为**本金**和**利息**两部分：

```python
# 贷款还款时创建两条交易记录

# 1. 本金部分
principal_txn = Transaction(
    transaction_type="repayment_loan",
    direction="internal",
    amount=principal_amount,  # 本金
    account_id=repayment_account_id,  # 还款账户
    counterparty_account_id=loan_account_id,  # 贷款账户
    category_id=loan_principal_category_id,  # 贷款本金分类
    business_key=f"loan:{loan_plan_id}:p{period_no}",
    include_in_expense=False,  # 本金不计入支出
    include_in_cashflow=True,   # 现金流减少
    # extra 字段存储本金金额
    extra=json.dumps({"principal_amount": principal_amount})
)

# 2. 利息部分
interest_txn = Transaction(
    transaction_type="fee",  # 使用 fee 类型计入支出
    direction="out",
    amount=interest_amount,  # 利息
    account_id=repayment_account_id,
    category_id=interest_expense_category_id,  # 利息支出分类
    include_in_expense=True,  # 利息计入支出
    include_in_cashflow=True, # 现金流减少
    # extra 字段
    extra=json.dumps({"interest_amount": interest_amount, "loan_plan_id": loan_plan_id})
)
```

### 1.2 统计口径

| 部分 | 计入支出 | 计入现金流 | 负债变化 |
|------|---------|-----------|---------|
| 本金 | ❌ | ✅ | debt_amount -= 本金 |
| 利息 | ✅ | ✅ | - |

### 1.3 loan_schedules 关联

```python
class LoanSchedule(Base):
    __tablename__ = "loan_schedules"

    id = Column(String(36), primary_key=True)
    loan_plan_id = Column(String(36), ForeignKey("loan_plans.id"), nullable=False)
    period_no = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    principal_due = Column(Numeric(15, 2), nullable=False)  # 本金
    interest_due = Column(Numeric(15, 2), nullable=False)  # 利息
    total_due = Column(Numeric(15, 2), nullable=False)  # 总应还
    paid_amount = Column(Numeric(15, 2), default=0)  # 已还金额
    paid_at = Column(DateTime)
    payment_transaction_id = Column(String(36))  # 关联本金交易
    interest_transaction_id = Column(String(36))  # 关联利息交易
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## 2. refund 账户变化规则修正

### 2.1 退款可指定入账账户

```python
class RefundDTO(BaseModel):
    original_transaction_id: str
    refund_amount: Decimal
    account_id: str  # 退款入账账户（必填）
    refund_type: str = "original"  # "original"=原路退回 / "custom"=指定账户
    note: Optional[str] = None
```

### 2.2 退款账户影响逻辑

```python
def apply_refund_effects(db: Session, refund: Transaction, original: Transaction):
    """
    根据退款入账账户类型决定账户影响
    """
    refund_account = db.query(Account).filter(Account.id == refund.account_id).first()
    original_account = db.query(Account).filter(Account.id == original.account_id).first()

    # 退款进入资产账户
    if refund_account.account_type in ['cash', 'debit_card', 'ewallet', 'virtual']:
        refund_account.current_balance += refund.amount

    # 退款进入信用账户（退到信用卡/花呗）
    elif refund_account.account_type in ['credit_card', 'credit_line']:
        refund_account.debt_amount -= refund.amount

    # 原消费如果是信用消费，退款减少负债
    if original_account.account_type in ['credit_card', 'credit_line']:
        original_account.debt_amount -= refund.amount
    else:
        # 原消费是现金消费，退款增加现金
        original_account.current_balance += refund.amount
```

### 2.3 refund 交易记录

```python
refund = Transaction(
    transaction_type="refund",
    direction="in",
    amount=refund_amount,
    account_id=refund_account_id,  # 退款入账账户
    related_transaction_id=original_transaction_id,  # 关联原交易
    business_key=f"refund:{original_transaction_id}:{seq}",
    merchant=original.merchant,  # 保留原商户信息
    include_in_expense=False,  # 不计入支出
    include_in_cashflow=True,   # 现金流入
    status="confirmed"
)
```

---

## 3. 信用卡账单周期算法修正

### 3.1 按 billing_day 切分账期

```python
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

def get_billing_period(billing_day: int, check_date: date) -> tuple:
    """
    按账单日切分账期
    返回: (period_start, period_end)

    账期规则：
    - 周期开始日 = 上一个账单日次日
    - 周期结束日 = 当前账单日
    """
    billing_day = int(billing_day)

    # 计算当前账期的结束日（账单日）
    if check_date.day >= billing_day:
        # 当月账单日已过，当前账期结束日 = 当月账单日
        period_end = check_date.replace(day=billing_day)
    else:
        # 当月账单日未过，当前账期结束日 = 上月账单日
        period_end = (check_date - relativedelta(months=1)).replace(day=billing_day)

    # 周期开始日 = 上个月账单日次日
    period_start = (period_end - relativedelta(months=1)) + timedelta(days=1)

    return period_start, period_end


def get_upcoming_billing_date(billing_day: int, from_date: date) -> date:
    """获取下一个账单日"""
    billing_day = int(billing_day)
    if from_date.day < billing_day:
        return from_date.replace(day=billing_day)
    else:
        next_month = from_date + relativedelta(months=1)
        return next_month.replace(day=billing_day)
```

### 3.2 示例

```
假设 billing_day = 15

2026-03-18 查询：
- period_end = 2026-03-15（当月账单日已过）
- period_start = 2026-02-16（上月账单日次日）

2026-03-10 查询：
- period_end = 2026-02-15（上月账单日）
- period_start = 2026-01-16
```

---

## 4. installment_purchase.amount 语义明确

### 4.1 明确定义

**`installment_purchase.amount` = 本金 + 手续费（一次性计入支出）**

| 字段 | 含义 | 存储位置 |
|------|------|---------|
| `transaction.amount` | 本金 + 手续费合计 | transactions.amount |
| `installment_plan.principal_total` | 本金 | installment_plans.total_amount |
| `installment_plan.total_fee` | 手续费 | installment_plans.total_fee |
| `installment_schedules.principal_amount` | 每期本金 | installment_schedules.principal_amount |
| `installment_schedules.fee_amount` | 每期手续费 | installment_schedules.fee_amount |
| `installment_schedules.total_due` | 每期应还 = 本金 + 手续费 | installment_schedules.total_due |

### 4.2 数据一致性保证

```python
# 创建分期消费时的数据一致性
installment_plan = InstallmentPlan(
    total_amount=principal,      # 本金
    total_fee=fee,              # 手续费
    principal_per_period=principal / periods,
    fee_per_period=fee / periods
)

transaction = Transaction(
    transaction_type="installment_purchase",
    amount=principal + fee,    # 本金+手续费合计，计入支出
    business_key=f"installment:{plan_id}",
    include_in_expense=True,
    include_in_cashflow=False   # 无现金流出
)

# 每期还款
schedule = InstallmentSchedule(
    principal_amount=principal_per_period,
    fee_amount=fee_per_period,
    total_due=principal_per_period + fee_per_period
)
```

### 4.3 统计一致性

```python
def get_expense_summary(book_id: str, date_from: date, date_to: date) -> dict:
    """支出统计 - 一致性保证"""
    # 分期消费（本金+手续费一次性计入）
    installment_purchases = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'installment_purchase',
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    # 普通消费
    expenses = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'expense',
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    # 手续费
    fees = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'fee',
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    # 扣除退款冲减
    refunds = get_refund_deductions(book_id, date_from, date_to)

    total = sum(t.amount for t in expenses) + \
            sum(t.amount for t in installment_purchases) + \
            sum(t.amount for t in fees) - refunds

    return {"total_expense": total}
```

---

## 5. debt_pay_back 语义明确

### 5.1 定义

**debt_pay_back = 归还自己欠别人的借款**（向他人归还借款）

| 类型 | 语义 | 现金流 | 计入收入 |
|------|------|--------|---------|
| debt_borrow | 借入（向他人借钱） | ✅ 现金流入 | ❌ 不计入 |
| debt_lend | 借出（借钱给他人） | ✅ 现金流出 | ❌ 不计入 |
| debt_receive_back | 收回借款（他人归还） | ✅ 现金流入 | ❌ 不计入 |
| debt_pay_back | 归还借款（归还欠款） | ✅ 现金流出 | ❌ 不计入 |

### 5.2 账户影响

```python
# debt_pay_back（归还借款）
txn = Transaction(
    transaction_type="debt_pay_back",
    direction="out",
    amount=amount,
    account_id=repayment_account_id,  # 从哪个账户还款
    counterparty_id=creditor_id,      # 借给谁
    merchant=creditor_name,           # 债权人
    include_in_expense=False,  # 不计入支出
    include_in_cashflow=True,   # 现金流减少
)
# 结果：repayment_account.current_balance -= amount
```

### 5.3 与 repayment_loan 的区别

| 场景 | 类型 | 对方账户 | 说明 |
|------|------|---------|------|
| 银行贷款/信用卡还款 | repayment_loan / repayment_credit_card | 银行/金融机构 | 正规金融机构的负债 |
| 归还个人借款 | debt_pay_back | 个人/朋友 | 私人借贷 |

---

## 6. 外部账单交易幂等键

### 6.1 business_key 命名空间

| 来源 | business_key 格式 | 唯一性 | 说明 |
|------|------------------|--------|------|
| 导入批次 | `import:{batch_id}:{row_no}` | 必须唯一 | 导入文件数据 |
| 外部账单 | `external:{account_id}:{external_txn_id}` | 必须唯一 | 银行/支付平台同步 |
| 分期消费 | `installment:{plan_id}` | 必须唯一 | 分期计划 |
| 分期还款 | `installment:{plan_id}:p{period_no}` | 必须唯一 | 分期期次 |
| 贷款还款 | `loan:{plan_id}:p{period_no}` | 必须唯一 | 贷款期次 |
| 退款 | `refund:{original_txn_id}:{seq}` | 可重复 | 支持多次部分退款 |

### 6.2 外部账单幂等实现

```python
def create_or_update_external_transaction(db: Session, data: ExternalTransactionDTO) -> Transaction:
    """
    外部账单交易幂等创建/更新
    """
    business_key = f"external:{data.account_id}:{data.external_txn_id}"

    # 检查是否已存在
    existing = db.query(Transaction).filter(
        Transaction.business_key == business_key
    ).first()

    if existing:
        # 已存在则更新（支持外部系统更新流水）
        for key, value in data.dict().items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        existing.updated_at = datetime.utcnow()
        db.commit()
        return existing
    else:
        # 不存在则创建
        txn = Transaction(
            transaction_type=data.transaction_type,
            direction=data.direction,
            amount=data.amount,
            account_id=data.account_id,
            merchant=data.merchant,
            occurred_at=data.occurred_at,
            business_key=business_key,
            source_type="external",
            external_ref=data.external_txn_id,
            status="confirmed"
        )
        db.add(txn)
        db.commit()
        return txn
```

### 6.3 唯一约束

```python
# transactions 表增加 business_key 唯一索引
Index("ix_transactions_business_key", Transaction.business_key, unique=True)
```

---

## 7. 交易类型对照表（最终完整版）

### 7.1 报表统计

| 类型 | 计入支出 | 计入收入 | 计入现金流 | 说明 |
|------|---------|---------|-----------|------|
| expense | ✅ | ❌ | ✅ | 消费支出 |
| income | ❌ | ✅ | ✅ | 工资/兼职 |
| installment_purchase | ✅ | ❌ | ❌ | 分期消费（负债增加，无现金流） |
| fee | ✅ | ❌ | ✅ | 手续费/利息支出 |
| transfer | ❌ | ❌ | ❌ | 转账 |
| repayment_credit_card | ❌ | ❌ | ❌ | 信用卡还款 |
| repayment_loan | ❌ | ❌ | ❌ | 贷款本金还款 |
| installment_repayment | ❌ | ❌ | ❌ | 分期还款 |
| debt_borrow | ❌ | ❌ | ✅ | 借入 |
| debt_lend | ❌ | ❌ | ✅ | 借出 |
| debt_receive_back | ❌ | ❌ | ✅ | 收回借款 |
| debt_pay_back | ❌ | ❌ | ✅ | 归还借款 |
| refund | ❌ | ❌ | ✅ | 退款（冲减原消费） |

### 7.2 账户余额变化

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
| refund | 根据入账账户 | 根据入账账户 |

---

**文档版本**：v4.0（最终版）  
**最后更新**：2026-03-18
