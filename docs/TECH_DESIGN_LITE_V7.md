# 记账 Web 服务 SQLite 轻量化方案 - 修订版 v7（最终定稿版）

---

## 1. 现金流报表口径统一

### 1.1 方案 A：现金流报表 = 消费/经营现金流（推荐）

**定义**：现金流报表仅反映消费/经营相关的资金流动，借贷款项单独统计。

| 包含 | 单独统计 |
|------|---------|
| income（工资/兼职） | debt_borrow → 借入报表 |
| expense（消费支出） | debt_lend → 借出报表 |
| fee（手续费/利息） | debt_receive_back → 借入报表 |
| | debt_pay_back → 借出报表 |
| | repayment_credit_card → 债务报表 |
| | repayment_loan → 债务报表 |
| | installment_repayment → 债务报表 |

### 1.2 修正后的现金流统计表

| transaction_type | 计入现金流 | 资产账户变化 | 负债账户变化 |
|-----------------|-----------|-------------|-------------|
| expense(资产) | ✅ | balance -= | - |
| expense(信用) | ❌ | - | debt += |
| income | ✅ | balance += | - |
| installment_purchase | ❌ | - | debt += |
| fee | ✅ | balance -= | - |
| repayment_credit_card | ❌ | balance -= | debt -= |
| repayment_loan | ❌ | balance -= | debt -= |
| installment_repayment | ❌ | balance -= | debt -= |
| transfer | ❌ | 转出-/转入+ | - |
| debt_borrow | ❌ | balance += | - |
| debt_lend | ❌ | balance -= | - |
| debt_receive_back | ❌ | balance += | - |
| debt_pay_back | ❌ | balance -= | - |
| refund(资产入账) | ✅ | balance += | - |
| refund(信用入账) | ❌ | - | debt -= |

### 1.3 报表体系说明

| 报表类型 | 口径 | 包含内容 |
|---------|------|---------|
| 收入报表 | 劳动/经营所得 | income |
| 支出报表 | 消费支出 | expense + fee + installment_purchase |
| 现金流报表 | 消费/经营资金流 | income + expense(资产) + fee |
| 债务报表 | 负债变动 | repayment_credit_card + repayment_loan + installment_repayment |
| 借入报表 | 资金往来 | debt_borrow + debt_receive_back |
| 借出报表 | 资金往来 | debt_lend + debt_pay_back |

---

## 2. expense 账户影响表述修正

### 2.1 修正后的规则

**expense 根据账户类型有不同影响**：

| 账户类型 | 账户余额变化 | 负债变化 | 计入现金流 |
|---------|-------------|---------|-----------|
| 资产账户 (cash/debit_card/ewallet) | balance -= amount | - | ✅ |
| 信用账户 (credit_card/credit_line) | - | debt += amount | ❌ |

### 2.2 统一表述

```python
def apply_expense_effects(transaction: Transaction, account: Account):
    """expense 账户影响 - 根据账户类型区分"""

    if account.account_type in ['cash', 'debit_card', 'ewallet', 'virtual']:
        # 资产账户支出
        account.current_balance -= transaction.amount
        transaction.include_in_cashflow = True

    elif account.account_type in ['credit_card', 'credit_line']:
        # 信用账户支出（负债增加）
        account.debt_amount += transaction.amount
        transaction.include_in_cashflow = False  # 负债增加，无现金流

    elif account.account_type == 'loan':
        # 贷款账户支出（异常，贷款一般不做支出）
        raise ValueError("贷款账户不支持 expense 类型")
```

### 2.3 与 installment_purchase 的一致性

| 类型 | 资产账户 | 信用账户 |
|------|---------|---------|
| expense | balance -=, 现金流 ✅ | debt +=, 现金流 ❌ |
| installment_purchase | - | debt +=, 现金流 ❌ |

---

## 3. get_billing_period() 示例修正

### 3.1 修正后的示例

```
billing_day = 31

示例 1：check_date = 2026-03-18
- check_date.day = 18 < billing_day = 31
- 当月账单日未过，period_end = 2026-02-28（2月最后一天）
- 账期: 2026-02-01 ~ 2026-02-28

示例 2：check_date = 2026-04-20
- check_date.day = 20 < billing_day = 31
- 当月账单日未过，period_end = 2026-03-31
- 账期: 2026-03-01 ~ 2026-03-31

示例 3：check_date = 2026-04-05
- check_date.day = 5 < billing_day = 31
- 2月账单日 = 2026-02-28（2月没有31日，自动取28）
- 账期: 2026-01-29 ~ 2026-02-28
```

---

## 4. 统一后的完整对照表（v7 最终定稿版）

### 4.1 报表统计

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

### 4.2 现金流统计

| transaction_type | 现金流 | 资产账户 | 负债账户 |
|-----------------|--------|---------|---------|
| expense(资产) | ✅ | balance -= | - |
| expense(信用) | ❌ | - | debt += |
| income | ✅ | balance += | - |
| installment_purchase | ❌ | - | debt += |
| fee | ✅ | balance -= | - |
| repayment_credit_card | ❌ | balance -= | debt -= |
| repayment_loan | ❌ | balance -= | debt -= |
| installment_repayment | ❌ | balance -= | debt -= |
| transfer | ❌ | 转出-/转入+ | - |
| debt_borrow | ❌ | balance += | - |
| debt_lend | ❌ | balance -= | - |
| debt_receive_back | ❌ | balance += | - |
| debt_pay_back | ❌ | balance -= | - |
| refund(资产) | ✅ | balance += | - |
| refund(信用) | ❌ | - | debt -= |

---

## 5. 报表体系总结

| 报表 | 用途 | 统计口径 |
|------|------|---------|
| 收入报表 | 分析收入来源 | income |
| 支出报表 | 分析消费去向 | expense + fee + installment_purchase |
| 现金流报表 | 分析资金变动（消费/经营） | income + expense(资产) + fee |
| 债务报表 | 分析负债变动 | repayment_* + installment_repayment |
| 往来报表 | 分析借贷款项 | debt_borrow + debt_receive_back + debt_lend + debt_pay_back |

---

**文档版本**：v7.0（最终定稿版）  
**最后更新**：2026-03-18
