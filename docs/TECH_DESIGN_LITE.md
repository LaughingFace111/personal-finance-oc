# 记账 Web 服务轻量化修订技术方案（SQLite 版）

---

## 1. 修订目标概述

### 1.1 为什么从 PostgreSQL 调整为 SQLite

| 对比项 | PostgreSQL 方案 | SQLite 方案 |
|--------|-----------------|-------------|
| 部署复杂度 | 需要额外部署数据库服务 | 单文件，直接可用 |
| 开发启动 | 需要等待数据库就绪 | 复制即可运行 |
| 运维要求 | 需要数据库备份、恢复、连接池 | 文件级备份即可 |
| 数据规模 | 适合生产级大规模数据 | 适合单用户/小规模 |
| 移动端 | 需要远程连接 | 可打包进 App |

### 1.2 适用边界

- ✅ 单用户自用为主（当前目标）
- ✅ 个人本地部署
- ✅ 快速原型开发
- ✅ 数据量 < 10 万条
- ❌ 不适合未来多用户生产部署（需迁移 PostgreSQL）

### 1.3 设计原则

1. **业务模型正确性优先** - 不因轻量而牺牲核心模型
2. **保留扩展路径** - SQLite → PostgreSQL 可平滑迁移
3. **第一版可落地** - 最小功能集，快速见面
4. **iOS 对接友好** - REST API + SQLite 本地缓存

---

## 2. 修订后的技术栈

### 2.1 后端技术方案

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 语言 | Python 3.11+ | 成熟稳定 |
| 框架 | FastAPI | 高性能、自动 OpenAPI |
| ORM | SQLAlchemy 2.x | 支持 SQLite |
| 数据库 | SQLite | 本地文件 `data/app.db` |
| 迁移工具 | Alembic | 支持 SQLite |
| 认证 | JWT (python-jose) | 标准 Token |
| 校验 | Pydantic v2 | 数据校验 |
| 文件处理 | python-multipart | CSV 解析 |

### 2.2 前端技术方案

| 层级 | 技术选型 |
|------|----------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite |
| UI 库 | Ant Design 5.x |
| 路由 | React Router 6 |
| 状态 | React Query + Zustand |
| 图表 | ECharts |
| HTTP | Axios |

### 2.3 部署方式

```
# 开发模式
pip install -r requirements.txt
python -m uvicorn src.main:app --reload

# 生产模式（可选 Docker）
docker build -t finance-app .
docker run -v ./data:/app/data finance-app
```

---

## 3. 模块划分修订版

### 3.1 后端模块（轻量化版）

```
server/
├── src/
│   ├── main.py                 # 应用入口
│   ├── core/                   # 核心模块
│   │   ├── config.py           # 配置
│   │   ├── security.py         # JWT
│   │   ├── database.py         # SQLite 连接
│   │   └── exceptions.py       # 统一异常
│   │
│   ├── modules/                # 业务模块
│   │   ├── auth/               # 认证
│   │   ├── books/              # 账本
│   │   ├── accounts/           # 账户
│   │   ├── categories/         # 分类
│   │   ├── transactions/       # 交易（核心）
│   │   ├── installments/       # 分期
│   │   ├── loans/              # 贷款
│   │   ├── imports/             # 导入
│   │   ├── rules/              # 归类规则
│   │   └── reports/            # 报表
│   │
│   └── common/                 # 公共
│
├── data/                       # SQLite 数据目录
├── migrations/
├── seeds/
└── tests/
```

### 3.2 功能裁剪说明

| 模块 | 第一版状态 | 说明 |
|------|-----------|------|
| auth | ✅ 保留 | JWT 认证 |
| books | ✅ 保留 | 账本管理 |
| accounts | ✅ 保留 | 账户 CRUD |
| categories | ✅ 保留 | 分类管理 |
| transactions | ✅ **核心** | 交易流水（强化） |
| installments | ✅ 保留 | 分期计划 + 明细 |
| loans | ✅ 保留 | 贷款计划 + 还款 |
| imports | ✅ 保留 | 批量导入 |
| rules | ✅ 保留 | 归类规则 |
| reports | ✅ 保留 | 报表看板 |
| credit_consumptions | ❌ 延后 | 合并到 transactions |
| credit_statements | ❌ 延后 | 服务层动态聚合 |

---

## 4. 精简后的数据库实体设计

### 4.1 核心表清单

| 序号 | 表名 | 第一版 | 说明 |
|------|------|--------|------|
| 1 | users | ✅ | 用户 |
| 2 | books | ✅ | 账本 |
| 3 | accounts | ✅ | 账户 |
| 4 | categories | ✅ | 分类 |
| 5 | transactions | ✅ **核心** | 交易流水 |
| 6 | installment_plans | ✅ | 分期计划 |
| 7 | installment_schedules | ✅ | 分期明细 |
| 8 | loan_plans | ✅ | 贷款计划 |
| 9 | loan_schedules | ✅ | 贷款明细 |
| 10 | import_batches | ✅ | 导入批次 |
| 11 | import_rows | ✅ | 导入行 |
| 12 | category_rules | ✅ | 归类规则 |

### 4.2 表结构设计

#### 4.2.1 users（用户表）

```python
class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)  # 应用层生成 UUID
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(100))
    avatar_url = Column(String(500))
    timezone = Column(String(50), default="Asia/Shanghai")
    currency_default = Column(String(3), default="CNY")
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**约束**：
- `email` 唯一
- `status` 取值：active / inactive

---

#### 4.2.2 books（账本表）

```python
class Book(Base):
    __tablename__ = "books"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    currency = Column(String(3), default="CNY")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

#### 4.2.3 accounts（账户表）

```python
class Account(Base):
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    name = Column(String(100), nullable=False)
    account_type = Column(String(20), nullable=False)  # cash/debit_card/ewallet/credit_card/credit_line/loan/virtual
    institution_name = Column(String(100))
    card_last4 = Column(String(4))
    credit_limit = Column(Numeric(15, 2), default=0)  # 信用额度
    billing_day = Column(Integer)  # 账单日 1-31
    repayment_day = Column(Integer)  # 还款日 1-31
    loan_principal = Column(Numeric(15, 2), default=0)  # 贷款本金
    loan_interest_rate = Column(Numeric(8, 4), default=0)  # 年利率
    opening_balance = Column(Numeric(15, 2), default=0)  # 开户余额
    current_balance = Column(Numeric(15, 2), default=0)  # 当前余额/欠款
    currency = Column(String(3), default="CNY")
    is_active = Column(Boolean, default=True)
    note = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**账户类型语义**：

| 类型 | opening_balance | current_balance | credit_limit | 含义 |
|------|-----------------|-----------------|--------------|------|
| cash | 初始现金 | 当前现金余额 | - | 现金余额 |
| debit_card | 银行卡余额 | 当前余额 | - | 储蓄卡余额 |
| ewallet | 钱包余额 | 当前余额 | - | 支付宝/微信 |
| credit_card | 0 | 已用额度 | 总额度 | 信用卡欠款 |
| credit_line | 0 | 已用额度 | 总额度 | 花呗/白条 |
| loan | 贷款总额 | 剩余本金 | - | 贷款剩余本金 |
| virtual | 0 | 当前余额 | - | 中转账户 |

**约束**：
- `account_type` 取值限制
- 同一账本内账户名唯一

---

#### 4.2.4 categories（分类表）

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
    is_system = Column(Boolean, default=False)  # 系统分类不可删除
    is_active = Column(Boolean, default=True)
    keywords = Column(Text)  # JSON 字符串，存储关键词列表
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

#### 4.2.5 transactions（交易流水表）- 核心强化版

```python
class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    occurred_at = Column(DateTime, nullable=False)  # 交易发生时间
    posted_at = Column(DateTime)  # 入账时间
    transaction_type = Column(String(30), nullable=False)  # 交易类型
    direction = Column(String(10), nullable=False)  # in/out/internal
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="CNY")
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)  # 主账户
    counterparty_account_id = Column(String(36), ForeignKey("accounts.id"))  # 对手账户
    category_id = Column(String(36), ForeignKey("categories.id"))
    merchant = Column(String(200))
    note = Column(Text)
    external_ref = Column(String(200))  # 外部单号
    source_type = Column(String(20), default="manual")  # manual/import/system
    source_batch_id = Column(String(36))
    source_row_no = Column(Integer)
    import_hash = Column(String(64))  # 导入去重哈希
    status = Column(String(20), default="confirmed")  # draft/confirmed/void
    tags = Column(Text)  # JSON 字符串
    extra = Column(Text)  # JSON 字符串，扩展字段

    # ========== 新增统计控制字段 ==========
    related_transaction_id = Column(String(36))  # 关联交易（如退款关联原交易）
    business_key = Column(String(100))  # 业务键（如分期计划ID、贷款计划ID）
    include_in_expense = Column(Boolean, default=True)  # 是否计入支出
    include_in_income = Column(Boolean, default=True)  # 是否计入收入
    include_in_cashflow = Column(Boolean, default=True)  # 是否计入现金流

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**交易类型枚举**：

| transaction_type | direction | 说明 | 计入支出 | 计入收入 | 计入现金流 |
|-----------------|-----------|------|---------|---------|-----------|
| expense | out | 普通支出 | ✅ | ❌ | ✅ |
| income | in | 普通收入 | ❌ | ✅ | ✅ |
| transfer | internal | 转账 | ❌ | ❌ | ✅ |
| repayment_credit_card | internal | 信用卡还款 | ❌ | ❌ | ✅ |
| repayment_loan | internal | 贷款还款 | ❌ | ❌ | ✅ |
| refund | in | 退款 | ❌ | ✅（可冲减） | ✅ |
| fee | out | 手续费 | ✅ | ❌ | ✅ |
| adjustment | internal | 余额调整 | ❌ | ❌ | ❌ |
| installment_purchase | out | 分期消费 | ✅ | ❌ | ✅ |
| installment_repayment | internal | 分期还款 | ❌ | ❌ | ✅ |
| debt_borrow | in | 借入 | ❌ | ✅ | ✅ |
| debt_lend | out | 借出 | ❌ | ❌ | ✅ |
| debt_receive_back | in | 收回借款 | ❌ | ✅ | ✅ |
| debt_pay_back | out | 归还借款 | ❌ | ❌ | ✅ |

**统计口径控制**：

1. **信用卡还款**：
   - `transaction_type = repayment_credit_card`
   - `include_in_expense = False`（不重复计入支出）

2. **贷款还款**：
   - 本金部分：`include_in_expense = False`
   - 利息部分：通过 `fee` 类型单独记录

3. **分期消费**：
   - 原始消费记录 `transaction_type = installment_purchase`
   - 每期还款 `transaction_type = installment_repayment`

4. **退款冲减**：
   - `related_transaction_id = 原交易ID`
   - 原交易可选 `include_in_expense = False`

---

#### 4.2.6 installment_plans（分期计划表）

```python
class InstallmentPlan(Base):
    __tablename__ = "installment_plans"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    transaction_id = Column(String(36), ForeignKey("transactions.id"))
    plan_name = Column(String(200))
    total_amount = Column(Numeric(15, 2), nullable=False)
    total_periods = Column(Integer, nullable=False)
    current_period = Column(Integer, default=1)
    principal_per_period = Column(Numeric(15, 2), nullable=False)
    fee_per_period = Column(Numeric(15, 2), default=0)
    total_fee = Column(Numeric(15, 2), default=0)
    start_date = Column(Date, nullable=False)
    first_repayment_date = Column(Date)
    repayment_day = Column(Integer)
    status = Column(String(20), default="active")  # active/completed/cancelled
    early_settlement_supported = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

#### 4.2.7 installment_schedules（分期明细表）

```python
class InstallmentSchedule(Base):
    __tablename__ = "installment_schedules"

    id = Column(String(36), primary_key=True)
    installment_plan_id = Column(String(36), ForeignKey("installment_plans.id"), nullable=False)
    period_no = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    principal_amount = Column(Numeric(15, 2), nullable=False)
    fee_amount = Column(Numeric(15, 2), default=0)
    total_due = Column(Numeric(15, 2), nullable=False)
    paid_amount = Column(Numeric(15, 2), default=0)
    paid_at = Column(DateTime)
    payment_transaction_id = Column(String(36), ForeignKey("transactions.id"))
    status = Column(String(20), default="pending")  # pending/paid/overdue/skipped
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("installment_plan_id", "period_no", name="uix_plan_period"),
    )
```

---

#### 4.2.8 loan_plans（贷款计划表）

```python
class LoanPlan(Base):
    __tablename__ = "loan_plans"

    id = Column(String(36), primary_key=True)
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    loan_name = Column(String(200))
    principal_total = Column(Numeric(15, 2), nullable=False)
    principal_remaining = Column(Numeric(15, 2), nullable=False)
    annual_interest_rate = Column(Numeric(8, 4), nullable=False)
    repayment_method = Column(String(30))  # equal_principal_interest/equal_principal/custom
    total_periods = Column(Integer, nullable=False)
    current_period = Column(Integer, default=0)
    monthly_payment_estimated = Column(Numeric(15, 2), nullable=False)
    first_due_date = Column(Date, nullable=False)
    repayment_day = Column(Integer)
    status = Column(String(20), default="active")  # active/completed/cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

#### 4.2.9 loan_schedules（贷款还款明细表）

```python
class LoanSchedule(Base):
    __tablename__ = "loan_schedules"

    id = Column(String(36), primary_key=True)
    loan_plan_id = Column(String(36), ForeignKey("loan_plans.id"), nullable=False)
    period_no = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    principal_due = Column(Numeric(15, 2), nullable=False)
    interest_due = Column(Numeric(15, 2), nullable=False)
    total_due = Column(Numeric(15, 2), nullable=False)
    paid_amount = Column(Numeric(15, 2), default=0)
    paid_at = Column(DateTime)
    payment_transaction_id = Column(String(36), ForeignKey("transactions.id"))
    status = Column(String(20), default="pending")  # pending/paid/overdue
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("loan_plan_id", "period_no", name="uix_loan_period"),
    )
```

---

#### 4.2.10 import_batches（导入批次表）

```python
class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    source_name = Column(String(100))
    file_type = Column(String(20), nullable=False)  # csv/xlsx
    total_rows = Column(Integer, default=0)
    parsed_rows = Column(Integer, default=0)
    confirmed_rows = Column(Integer, default=0)
    skipped_rows = Column(Integer, default=0)
    duplicate_rows = Column(Integer, default=0)
    status = Column(String(20), default="uploaded")  # uploaded/parsed/reviewing/confirmed/failed
    mapping_config = Column(Text)  # JSON 字符串，字段映射配置
    parser_version = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

#### 4.2.11 import_rows（导入行表）

```python
class ImportRow(Base):
    __tablename__ = "import_rows"

    id = Column(String(36), primary_key=True)
    batch_id = Column(String(36), ForeignKey("import_batches.id"), nullable=False)
    row_no = Column(Integer, nullable=False)
    raw_data = Column(Text, nullable=False)  # JSON 字符串，原始数据
    normalized_data = Column(Text)  # JSON 字符串，归一化后数据
    guessed_account_id = Column(String(36))
    guessed_category_id = Column(String(36))
    guessed_transaction_type = Column(String(30))
    guessed_confidence = Column(Numeric(5, 2))  # 0-100
    duplicate_candidate_id = Column(String(36))
    user_modified = Column(Boolean, default=False)
    confirm_status = Column(String(20), default="pending")  # pending/confirmed/skipped
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

#### 4.2.12 category_rules（归类规则表）

```python
class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(String(36), primary_key=True)
    book_id = Column(String(36), ForeignKey("books.id"), nullable=False)
    rule_name = Column(String(100))
    match_field = Column(String(30), nullable=False)  # merchant/description/counterparty
    match_type = Column(String(20), nullable=False)  # exact/contains/regex
    match_value = Column(String(500), nullable=False)
    target_category_id = Column(String(36), ForeignKey("categories.id"))
    target_account_id = Column(String(36), ForeignKey("accounts.id"))
    priority = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

### 4.3 索引设计

```python
# transactions 索引
Index("ix_transactions_book_id", Transaction.book_id)
Index("ix_transactions_occurred_at", Transaction.occurred_at)
Index("ix_transactions_account_id", Transaction.account_id)
Index("ix_transactions_category_id", Transaction.category_id)
Index("ix_transactions_import_hash", Transaction.import_hash)
Index("ix_transactions_status", Transaction.status)

# import_rows 索引
Index("ix_import_rows_batch_id", ImportRow.batch_id)
Index("ix_import_rows_confirm_status", ImportRow.confirm_status)

# accounts 索引
Index("ix_accounts_book_id", Account.book_id)

# categories 索引
Index("ix_categories_book_id", Category.book_id)
Index("ix_categories_parent_id", Category.parent_id)

# loan_schedules 索引
Index("ix_loan_schedules_loan_plan_id", LoanSchedule.loan_plan_id)
Index("ix_loan_schedules_due_date", LoanSchedule.due_date)

# installment_schedules 索引
Index("ix_installment_schedules_plan_id", InstallmentSchedule.installment_plan_id)
```

---

## 5. 精简后的 ER 关系说明

```
User (1) ──────< (N) Book
  │
  └────< (N) Account
  │
  └────< (N) Category
  │
  └────< (N) Transaction ──────< (1) Account (counterparty)
            │
            └────< (N) InstallmentPlan ──────< (N) InstallmentSchedule
            │
            └────< (N) LoanPlan ──────< (N) LoanSchedule
            │
            └────< (N) ImportBatch ──────< (N) ImportRow
            │
            └────< (N) CategoryRule
```

---

## 6. transactions 核心模型重构说明

### 6.1 交易类型与账户影响

| 交易类型 | 主账户变化 | 对手账户变化 | 负债变化 | 备注 |
|---------|-----------|-------------|---------|------|
| 支出 | 余额减少 | - | 信用卡时负债增加 | 必选支出账户 |
| 收入 | 余额增加 | - | - | 必选收入账户 |
| 转账 | 转出减少 | 转入增加 | - | 必选两个账户 |
| 信用卡还款 | 转出减少 | 信用卡负债减少 | - | 特殊转账 |
| 贷款还款 | 转出减少 | 贷款本金减少 | 负债减少 | 含利息记录 |
| 退款 | 余额增加 | - | - | 可关联原交易 |
| 手续费 | 余额减少 | - | - | 单独记录 |
| 分期消费 | 负债增加 | - | 分期本金+手续费 | 生成分期计划 |
| 分期还款 | 负债减少 | - | 每期本金+手续费 | 关联分期计划 |

### 6.2 统计口径定义

```
支出 = SUM(transactions WHERE transaction_type IN ('expense', 'fee', 'installment_purchase') AND include_in_expense = True)

收入 = SUM(transactions WHERE transaction_type IN ('income', 'refund') AND include_in_income = True)

现金流 = SUM(transactions WHERE include_in_cashflow = True)
```

### 6.3 防重复统计策略

1. **导入去重**：使用 `import_hash` 字段
2. **退款冲减**：`related_transaction_id` 关联原交易
3. **转账不重复**：`direction = internal` 不计入收支
4. **信用卡/贷款还款**：设置 `include_in_expense = False`

---

## 7. 信用消费 / 分期 / 还款 / 贷款的轻量化实现方案

### 7.1 信用消费实现（第一版）

**不建 credit_consumptions 表**，通过 transactions 实现：

1. **信用卡消费**：
   ```python
   transaction = Transaction(
       transaction_type="expense",
       account_id=credit_card_id,  # 信用卡账户
       amount=1000,
       include_in_expense=True,  # 计入支出
   )
   ```

2. **分期消费**：
   ```python
   transaction = Transaction(
       transaction_type="installment_purchase",
       account_id=credit_card_id,
       amount=12000,
       business_key=installment_plan_id,  # 关联分期计划
       include_in_expense=True,
   )
   ```

### 7.2 信用卡还款实现

```python
# 还款交易
repayment_txn = Transaction(
    transaction_type="repayment_credit_card",
    account_id=debit_card_id,  # 从储蓄卡扣款
    counterparty_account_id=credit_card_id,  # 还到信用卡
    amount=5000,
    include_in_expense=False,  # 不计入支出
    include_in_cashflow=True,  # 计入现金流
)
```

### 7.3 贷款还款实现

```python
# 1. 本金部分
principal_txn = Transaction(
    transaction_type="repayment_loan",
    account_id=debit_card_id,
    counterparty_account_id=loan_account_id,
    amount=2000,
    business_key=loan_plan_id,
    include_in_expense=False,
    include_in_cashflow=True,
)

# 2. 利息部分（作为支出）
interest_txn = Transaction(
    transaction_type="fee",
    account_id=debit_card_id,
    amount=200,
    category_id=interest_category_id,
    include_in_expense=True,
    include_in_cashflow=True,
)
```

### 7.4 信用卡账单动态聚合（替代 credit_statements）

**不建表，通过服务层计算**：

```python
def get_credit_card_statement(account_id: str, billing_cycle: str) -> dict:
    account = get_account(account_id)
    billing_day = account.billing_day
    cycle_start, cycle_end = get_billing_cycle(billing_day, billing_cycle)

    unbilled = db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.transaction_type.in_(["expense", "installment_purchase"]),
        Transaction.status == "confirmed",
        Transaction.occurred_at > cycle_end
    ).all()

    billed = db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.transaction_type.in_(["expense", "installment_purchase"]),
        Transaction.status == "confirmed",
        Transaction.occurred_at.between(cycle_start, cycle_end)
    ).all()

    repayments = db.query(Transaction).filter(
        Transaction.counterparty_account_id == account_id,
        Transaction.transaction_type == "repayment_credit_card",
        Transaction.status == "confirmed"
    ).all()

    return {
        "unbilled_amount": sum(t.amount for t in unbilled),
        "billed_amount": sum(t.amount for t in billed),
        "paid_amount": sum(t.amount for t in repayments),
        "due_amount": sum(t.amount for t in billed) - sum(t.amount for t in repayments)
    }
```

**优点**：
- 无需维护额外表
- 数据实时准确
- 迁移 PostgreSQL 后同样适用

---

## 8. 批量导入与自动分类的轻量化方案

### 8.1 Import Standard v1 保留

```python
class LedgerImportStandard:
    """标准导入中间格式"""
    row_id: Optional[str] = None
    occurred_at: datetime  # 必填
    posted_at: Optional[datetime] = None
    amount: Decimal  # 必填，正数
    direction: str  # in/out/transfer/repayment/fee/refund
    currency: str = "CNY"
    account_name: str
    account_type: Optional[str]
    merchant: Optional[str]
    description: Optional[str]
    counterparty: Optional[str]
    external_category: Optional[str]
    installment_flag: bool = False
    installment_total_periods: Optional[int] = None
    fee_amount: Optional[Decimal] = None
    external_txn_id: Optional[str] = None
    raw_payload: dict  # 原始数据 JSON
```

### 8.2 导入流程（四阶段）

1. **上传解析**：接受 CSV/Excel，转为标准格式
2. **智能识别**：查 category_rules 匹配、查 keywords 匹配
3. **人工确认**：展示 import_rows，用户逐行确认/修改
4. **正式导入**：逐行写入 transactions，更新状态

### 8.3 去重机制

```python
def calculate_import_hash(row: LedgerImportStandard) -> str:
    content = f"{row.occurred_at}|{row.amount}|{row.account_name}|{row.merchant}|{row.external_txn_id or ''}"
    return hashlib.sha256(content.encode()).hexdigest()
```

---

## 9. SQLite 兼容性注意事项

### 9.1 主键策略

```python
import uuid

def gen_uuid() -> str:
    return str(uuid.uuid4())
```

### 9.2 JSON 字段策略

```python
import json

class Transaction(Base):
    tags = Column(Text)
    extra = Column(Text)

    @property
    def tags_list(self):
        if self.tags:
            return json.loads(self.tags)
        return []

    @tags_list.setter
    def tags_list(self, value):
        self.tags = json.dumps(value, ensure_ascii=False)
```

### 9.3 金额策略

```python
from decimal import Decimal, ROUND_HALF_UP

# 所有金额用 Decimal
amount = Column(Numeric(15, 2))
```

### 9.4 时间策略

```python
from datetime import datetime, timezone

# 存储 UTC 时间
occurred_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
```

### 9.5 性能边界

| 数据量 | 建议 |
|--------|------|
| < 1 万条 | 无需特殊优化 |
| 1-10 万条 | 注意索引 |
| > 10 万条 | 建议迁移 PostgreSQL |

---

## 10. 第一版开发阶段建议

### 阶段 1：基础设施（1 天）
- [ ] 项目骨架搭建
- [ ] SQLite 配置
- [ ] JWT 认证
- [ ] 统一响应/异常

### 阶段 2：基础 CRUD（2 天）
- [ ] 账本管理
- [ ] 账户管理
- [ ] 分类管理
- [ ] 交易 CRUD

### 阶段 3：信用与债务（2 天）
- [ ] 分期计划 + 明细
- [ ] 贷款计划 + 还款
- [ ] 信用卡还款

### 阶段 4：导入系统（3 天）⭐重点
- [ ] 文件上传解析
- [ ] 自动归类
- [ ] 预览确认
- [ ] 去重

### 阶段 5：报表看板（2 天）
- [ ] 首页总览
- [ ] 支出/收入分析
- [ ] 债务分析

### 阶段 6：收尾（1 天）
- [ ] 种子数据
- [ ] Docker 配置
- [ ] 文档

---

## 11. 未来迁移 PostgreSQL 的升级路径

### 11.1 迁移时机

- 数据量超过 10 万条
- 需要多用户并发
- 需要云部署

### 11.2 迁移步骤

1. **数据导出**
   ```bash
   sqlite3 data/app.db .dump > backup.sql
   ```

2. **修改配置**
   ```python
   # 将
   DATABASE_URL = "sqlite:///data/app.db"
   # 改为
   DATABASE_URL = "postgresql://user:pass@localhost/app"
   ```

3. **SQLAlchemy 兼容**
   - 主键策略：应用层 UUID 无需改变
   - JSON 字段：TEXT → JSONB（可选，SQLite 也支持）
   - Numeric：无变化

4. **数据迁移**
   - 使用 pgloader 或手动导入
   - 验证数据完整性

### 11.3 兼容性保证

- 所有 UUID 应用层生成（SQLite/PG 通用）
- JSON 用 TEXT 存储（PG 可无缝迁移为 JSONB）
- 时间用 UTC 存储（跨数据库兼容）
- Decimal 精度保证（SQLite NUMERIC / PG NUMERIC 通用）

---

**文档版本**：v1.0  
**最后更新**：2026-03-18
