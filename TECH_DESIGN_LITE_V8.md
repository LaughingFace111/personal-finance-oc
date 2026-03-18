# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v8（最终定稿版）

---

## 1. get_billing_period() 示例修正

### 1.1 算法回顾

```
period_end = 当前账期账单日（当月或上月，根据 check_date.day vs billing_day）
prev_period_end = period_end - 1个月（安全取月末）
period_start = prev_period_end + 1天
```

### 1.2 严格正确的示例

**示例 1：billing_day=15，check_date=2026-03-18**
- check_date.day=18 ≥ billing_day=15
- period_end = get_billing_date(2026,3,15) = 2026-03-15
- prev_period_end = 2026-02-15
- period_start = 2026-02-15 + 1天 = 2026-02-16
- **账期：2026-02-16 ~ 2026-03-15**

**示例 2：billing_day=31，check_date=2026-04-20**
- check_date.day=20 < billing_day=31
- period_end = get_billing_date(2026,3,31) = 2026-03-31（3月有31天）
- prev_period_end = get_billing_date(2026,2,31) = 2026-02-28（2月无31天，取28）
- period_start = 2026-02-28 + 1天 = 2026-03-01
- **账期：2026-03-01 ~ 2026-03-31**

**示例 3：billing_day=31，check_date=2026-04-05**
- check_date.day=5 < billing_day=31
- period_end = get_billing_date(2026,3,31) = 2026-03-31
- prev_period_end = get_billing_date(2026,2,31) = 2026-02-28
- period_start = 2026-02-28 + 1天 = 2026-03-01
- **账期：2026-03-01 ~ 2026-03-31**

---

## 2. 债务报表与贷款利息关系修正

### 2.1 修正后的报表归属

| 报表 | 交易类型 | 说明 |
|------|---------|------|
| 支出报表 | expense + fee + installment_purchase | 包含**贷款利息**（fee） |
| 债务报表 | repayment_credit_card + repayment_loan（本金）+ installment_repayment | 仅含**本金偿还** |

### 2.2 贷款利息的正确归属

```python
# 贷款本金 - 属于债务报表
principal_txn = Transaction(
    transaction_type="repayment_loan",  # 债务报表
    include_in_expense=False,
    # 账户变化：balance -=, debt -=
)

# 贷款利息 - 属于支出报表 + 现金流报表
interest_txn = Transaction(
    transaction_type="fee",  # 支出报表 + 现金流报表
    include_in_expense=True,
    include_in_cashflow=True,
    # 账户变化：balance -=
)
```

---

## 3. refund 支出统计口径

### 3.1 支出报表统计方式

**默认：净支出 = 毛支出 - 退款冲减**

```python
def calculate_expense_report(book_id: str, date_from: date, date_to: date) -> dict:
    """支出报表计算 - 净支出"""

    # 1. 获取所有支出类交易
    expense_txns = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_(['expense', 'fee', 'installment_purchase']),
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).all()

    # 2. 获取所有退款（关联到原交易的）
    refund_txns = db.query(Transaction).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type == 'refund',
        Transaction.related_transaction_id.isnot(None),
        Transaction.status == 'confirmed'
    ).all()

    # 3. 构建原交易ID -> 退款金额映射
    refund_map = {}
    for r in refund_txns:
        if r.related_transaction_id not in refund_map:
            refund_map[r.related_transaction_id] = Decimal('0')
        refund_map[r.related_transaction_id] += r.amount

    # 4. 计算净支出
    gross_expense = sum(t.amount for t in expense_txns)
    total_refund = sum(refund_map.values())
    net_expense = gross_expense - total_refund

    return {
        "gross_expense": gross_expense,
        "refund_deducted": total_refund,
        "net_expense": net_expense
    }
```

### 3.2 无法关联原交易的退款

- 归入"退款"分类（系统分类）
- 不参与支出冲减，单独展示

### 3.3 按分类统计时的退款冲减

```python
def calculate_expense_by_category(book_id: str, date_from: date, date_to: date) -> list:
    """按分类统计支出 - 含退款冲减"""

    # 按分类聚合毛支出
    expenses = db.query(
        Transaction.category_id,
        func.sum(Transaction.amount).label('total')
    ).filter(
        Transaction.book_id == book_id,
        Transaction.transaction_type.in_(['expense', 'fee', 'installment_purchase']),
        Transaction.status == 'confirmed',
        Transaction.occurred_at >= date_from,
        Transaction.occurred_at <= date_to
    ).group_by(Transaction.category_id).all()

    # 按分类聚合退款冲减
    refunds = db.query(
        Transaction.category_id,  # 关联到原交易的分类
        func.sum(Transaction.amount).label('total')
    ).join(
        Transaction, Transaction.related_transaction_id == Transaction.id
    ).filter(
        Transaction.transaction_type == 'refund',
        Transaction.status == 'confirmed'
    ).group_by(Transaction.category_id).all()

    # 合并计算净支出
    refund_by_category = {r.category_id: r.total for r in refunds}

    results = []
    for e in expenses:
        category_id = e.category_id
        gross = e.total
        refund = refund_by_category.get(category_id, 0)
        results.append({
            "category_id": category_id,
            "gross": gross,
            "refund": refund,
            "net": gross - refund
        })

    return results
```

---

## 4. 报表命名统一

### 4.1 最终命名规范

| 报表 | 正式名称 | 别名 | 说明 |
|------|---------|------|------|
| 收入报表 | 收入报表 | - | 分析收入来源 |
| 支出报表 | 支出报表 | - | 分析消费去向（含退款冲减） |
| 现金流报表 | 现金流报表 | - | 消费/经营资金流 |
| 债务报表 | 债务报表 | 负债变动报表 | 信用/贷款本金偿还 |
| 借贷款报表 | 借贷款报表 | 往来报表 | debt_borrow/debt_lend/debt_receive_back/debt_pay_back |

### 4.2 统一对照表

| 报表 | 包含的交易类型 |
|------|--------------|
| 收入报表 | income |
| 支出报表 | expense + fee + installment_purchase - refund(冲减) |
| 现金流报表 | income + expense(资产账户) + fee |
| 债务报表 | repayment_credit_card + repayment_loan + installment_repayment |
| 借贷款报表 | debt_borrow + debt_receive_back + debt_lend + debt_pay_back |

---

## 5. 统一后的完整对照表（v8 最终定稿版）

### 5.1 报表统计

| transaction_type | 支出报表 | 收入报表 | 现金流报表 | 债务报表 | 借贷款报表 |
|----------------|---------|---------|-----------|---------|-----------|
| expense | ✅ | ❌ | ✅(资产) | ❌ | ❌ |
| income | ❌ | ✅ | ✅ | ❌ | ❌ |
| installment_purchase | ✅ | ❌ | ❌ | ❌ | ❌ |
| fee | ✅ | ❌ | ✅ | ❌ | ❌ |
| repayment_credit_card | ❌ | ❌ | ❌ | ✅ | ❌ |
| repayment_loan(本金) | ❌ | ❌ | ❌ | ✅ | ❌ |
| installment_repayment | ❌ | ❌ | ❌ | ✅ | ❌ |
| transfer | ❌ | ❌ | ❌ | ❌ | ❌ |
| debt_borrow | ❌ | ❌ | ❌ | ❌ | ✅ |
| debt_lend | ❌ | ❌ | ❌ | ❌ | ✅ |
| debt_receive_back | ❌ | ❌ | ❌ | ❌ | ✅ |
| debt_pay_back | ❌ | ❌ | ❌ | ❌ | ✅ |
| refund | ❌ | ❌ | ✅(资产)/❌(信用) | ❌ | ❌ |

### 5.2 账户余额变化

| transaction_type | 资产账户 | 信用/负债账户 |
|-----------------|---------|-------------|
| expense(资产) | balance -= | - |
| expense(信用) | - | debt += |
| income | balance += | - |
| installment_purchase | - | debt += |
| fee | balance -= | - |
| repayment_credit_card | balance -= | debt -= |
| repayment_loan | balance -= | debt -= |
| installment_repayment | balance -= | debt -= |
| transfer | 转出-/转入+ | - |
| debt_borrow | balance += | - |
| debt_lend | balance -= | - |
| debt_receive_back | balance += | - |
| debt_pay_back | balance -= | - |
| refund(资产) | balance += | - |
| refund(信用) | - | debt -= |

---

**文档版本**：v8.0（最终定稿版）  
**最后更新**：2026-03-18
