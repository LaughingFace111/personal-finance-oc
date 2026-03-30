# 系统架构与核心逻辑快照 v2.0

> **Role**: 首席财务架构官 L | **Context**: API-Restricted Handoff to Claude | **Version**: 2.0

---

## 1. 技术栈与全局拓扑 (Tech Stack & Topology)

| Layer | Technology |
|-------|------------|
| **后端框架** | FastAPI (Python 3.12), Pydantic v2, SQLAlchemy 2.0 |
| **数据库驱动** | asyncmy (MySQL) + aiosqlite (开发/测试) |
| **前端框架** | React 18, TypeScript, React Router v6 |
| **UI 库** | Ant Design 5.x |
| **状态管理** | Zustand |
| **图表** | @ant-design/charts |

### 目录骨架

```
personal-finance/
├── server/
│   └── src/
│       ├── core/           # database, config, security, logger
│       └── modules/
│           ├── accounts/          # 账户 CRUD + 锁机制
│           ├── transactions/      # 流水核心
│           ├── installments/      # 分期引擎 (plans + schedules)
│           ├── bills/             # 账单解析 (支付宝/微信/京东)
│           ├── categories/        # 分类体系
│           ├── tags/              # 标签系统
│           ├── reports/          # 报表聚合
│           ├── recurring_rules/  # 自动记账规则
│           └── import_templates/ # 导入模板
└── web/
    └── src/
        ├── pages/     # Dashboard, Import, AssetDetail, Transfer...
        ├── components/  # CategorySelector, TagMultiSelect, HierarchyPickerModal
        └── services/ # API clients
```

---

## 2. 核心数据库骨架 (Database Schema & Models)

### `accounts` (账户表)

```python
class Account(Base):
    __tablename__ = "accounts"
    
    id = Column(String(36), primary_key=True)         # UUID
    book_id = Column(String(36), ForeignKey(...))
    name = Column(String(100))
    account_type = Column(String(20))                 # "asset" | "credit" | "liability"
    credit_limit = Column(Numeric(15, 2), default=0) # 信用额度
    debt_amount = Column(Numeric(15, 2), default=0) # 欠款金额
    frozen_amount = Column(Numeric(15, 2), default=0)# 冻结额度(分期专用)
    current_balance = Column(Numeric(15, 2))         # 当前余额(资产账户)
    billing_day = Column(String(10))                  # 账单日
    repayment_day = Column(String(10))                # 还款日
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)      # 软删除
```

### `transactions` (流水表)

```python
class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey(...))
    occurred_at = Column(DateTime, nullable=False)
    transaction_type = Column(String(30))             # "income" | "expense" | "transfer" | ...
    direction = Column(String(10))                    # "in" | "out"
    amount = Column(Numeric(15, 2), nullable=False)
    account_id = Column(String(36), ForeignKey(...))
    counterparty_account_id = Column(String(36))
    category_id = Column(String(36), ForeignKey(...))
    tags = Column(Text)                               # JSON string
    business_key = Column(String(100))                # 幂等性键
    include_in_expense = Column(Boolean, default=True) # 收支开关
    include_in_income = Column(Boolean, default=True)
    status = Column(String(20), default="confirmed")
    import_hash = Column(String(64))                   # 防重放
    
    __table_args__ = (
        UniqueConstraint("book_id", "business_key", name="uix_transaction_business_key"),
    )
```

### `installment_plans` (分期表)

```python
class InstallmentPlan(Base):
    __tablename__ = "installment_plans"
    
    id = Column(String(36), primary_key=True)
    account_id = Column(String(36), ForeignKey(...))
    total_amount = Column(Numeric(15, 2))             # 总金额
    installment_amount = Column(Numeric(15, 2))        # 每期金额
    total_periods = Column(Integer)                    # 总期数
    executed_periods = Column(Integer, default=0)     # 已执行期数
    current_period = Column(Integer, default=1)        # 当前期数
    principal_per_period = Column(Numeric(15, 2))      # 每期本金
    fee_per_period = Column(Numeric(15, 2))            # 每期手续费
    total_fee = Column(Numeric(15, 2))                 # 总手续费
    start_date = Column(Date)                          # 开始日期
    first_billing_date = Column(Date)                 # 首次账单日
    next_execution_date = Column(Date)                # 下次执行日
    status = Column(String(20), default="active")
```

---

## 3. 金融引擎与数学法则 (Core Financial Physics)

### 3.1 信用账户公式

$$\text{Available\_Credit} = \text{Credit\_Limit} - \text{Debt\_Amount} - \text{Frozen\_Amount}$$

| 字段 | 含义 |
|------|------|
| `credit_limit` | 总额度 |
| `debt_amount` | 已使用欠款 |
| `frozen_amount` | 冻结额度（分期占用未还） |

### 3.2 负债平账逻辑

给定目标可用额度 $T$，求 $\Delta Debt$：

$$\Delta Debt = (\text{Credit\_Limit} - \text{Frozen\_Amount}) - T - \text{Debt\_Amount}$$

| $\Delta Debt$ 极性 | 交易方向 | 业务含义 |
|---------------------|----------|----------|
| **正数** | `direction: "out"` | 减少可用额度 = 还款入账 |
| **负数** | `direction: "in"` | 增加可用额度 = 消费出账 |

**双轨制 API 约束**：
- **调整总额度** (`credit_limit`): 仅修改额度数值，**不触发** `frozen_amount` 释放
- **调整可用额度**: 通过分期冻结/释放实现资金流转

### 3.3 分期冻结与释放模型

| 阶段 | `frozen_amount` | `debt_amount` | 备注 |
|------|----------------|---------------|------|
| **创建分期** | += `total_amount` | 不变 | 冻结额度占用 |
| **每期执行** | -= `principal_per_period` | += `principal_per_period` | 解冻本金并转为欠款 |
| **提前结清** | -= 剩余本金 | = 0 | 全部释放 |

---

## 4. 前端全局规范 (Frontend Standardization)

### 4.1 全局标准组件

| 组件名 | 用途 | 入参契约 |
|--------|------|----------|
| **CategorySelector** | 分类选择 | `value?: string`, `onChange: (id: string) => void`, `bookId: string` |
| **TagMultiSelect** | 标签多选 | `value?: string[]`, `onChange: (tags: string[]) => void` |
| **HierarchyPickerModal** | 层级选择器(账户/分类) | `visible: boolean`, `type: 'account' \| 'category'`, `onSelect: (item) => void` |

### 4.2 路由架构

```typescript
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <DashboardPage /> },           // 首页/大盘
  { path: '/import', element: <ImportPage /> },          // 账单导入
  { path: '/assets/:assetId', element: <AssetDetailPage /> }, // 账户详情
  { path: '/add-transaction', element: <AddTransactionPage /> }, // 新增流水
  { path: '/transfer', element: <TransferPage /> },    // 转账
  { path: '/other', element: <OtherTransactionPage /> }, // 其他交易
]);
```

---

## 5. 当前已知防线与约束 (Known Constraints & Defenses)

### 5.1 幂等性防线

**business_key 生成要素**：

```python
business_key = f"{book_id}:{external_ref}:{occurred_at.isoformat()}:{amount}"
```

**数据库约束**：

```python
UniqueConstraint("book_id", "business_key", name="uix_transaction_business_key")
```

- 同一账本下绝对唯一
- 导入时先查 `business_key`，存在则跳过

### 5.2 跨月与尾差处理

| 场景 | 处理策略 |
|------|----------|
| **除不尽尾差** (`10000/3`) | 首期多扣，末期少扣 |
| **跨月日期** (1月31日 → 2月) | `dateutil.relativedelta(months=+1)` 自动回退到最近有效日 |

---

> **🚨 重构铁律**: 任何涉及 `debt_amount` / `frozen_amount` 的改动，必须同步更新 `account_balance_snapshots` 表。余额快照是报表的数据源，必须与实时余额严格一致。

---

*End of Snapshot v2.0 | Issued by L | 2026-03-30*
