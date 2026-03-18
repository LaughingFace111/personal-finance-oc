# 个人记账 Web 服务 - 技术设计文档

> 第一步输出内容

---

## 1. 推荐完整技术栈

### 1.1 后端技术方案

| 层级 | 技术选型 | 理由 |
|------|----------|------|
| 语言 | Python 3.11+ | 成熟稳定，AI 友好 |
| 框架 | FastAPI | 高性能、自动 OpenAPI、异步 |
| ORM | SQLAlchemy 2.0 | 成熟、类型提示友好 |
| 数据库 | PostgreSQL | 关系型数据强一致 |
| 迁移工具 | Alembic | 标准数据库版本管理 |
| 认证 | JWT (python-jose) | 标准 Token 鉴权 |
| 校验 | Pydantic v2 | 数据校验、自动生成 Schema |
| 文件处理 | python-multipart | CSV/Excel 解析 |
| 任务队列 | 预留（初期不需要） | 未来扩展用 |

### 1.2 前端技术方案

| 层级 | 技术选型 | 理由 |
|------|----------|------|
| 框架 | React 18 + TypeScript | 主流、类型安全 |
| 构建 | Vite | 快、配置简单 |
| UI 库 | Ant Design 5.x | 企业级组件丰富 |
| 路由 | React Router 6 | 官方推荐 |
| 状态 | React Query + Zustand | 服务端状态 + 本地状态 |
| 图表 | ECharts | 任务书推荐、能力强 |
| HTTP | Axios | 统一拦截器、类型封装 |
| 表单 | React Hook Form + Zod | 高性能表单校验 |

### 1.3 部署方案

| 组件 | 选型 |
|------|------|
| 容器 | Docker + Docker Compose |
| 反向代理 | Nginx (生产) |
| 数据库 | PostgreSQL 15 |

---

## 2. 模块拆分方案

### 2.1 后端模块 (按业务域划分)

```
server/
├── src/
│   ├── main.py                    # 应用入口
│   ├── core/                      # 核心模块
│   │   ├── config.py               # 配置管理
│   │   ├── security.py             # 鉴权/JWT
│   │   ├── database.py             # 数据库连接
│   │   ├── exceptions.py            # 统一异常
│   │   └── response.py             # 统一响应
│   │
│   ├── modules/                   # 业务模块
│   │   ├── auth/                  # 认证模块
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── repository.py
│   │   │
│   │   ├── users/                 # 用户模块
│   │   ├── books/                 # 账本模块
│   │   ├── accounts/              # 账户模块
│   │   ├── categories/            # 分类模块
│   │   ├── transactions/          # 交易模块
│   │   ├── credit/               # 信用账户模块
│   │   │   ├── credit_consumption.py
│   │   │   ├── installment.py
│   │   │   └── statement.py
│   │   ├── loans/                # 贷款模块
│   │   ├── imports/              # 导入模块
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── parser.py         # CSV/Excel 解析
│   │   │   ├── normalizer.py     # 标准化
│   │   │   ├── classifier.py      # 自动归类
│   │   │   └── deduplicator.py   # 去重
│   │   ├── rules/                # 归类规则模块
│   │   └── reports/               # 报表模块
│   │
│   └── common/                    # 公共工具
│       ├── constants.py
│       ├── enums.py
│       └── utils.py
│
├── migrations/                    # Alembic 迁移
├── seeds/                         # 种子数据
├── tests/                         # 测试
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

### 2.2 前端模块 (按页面/功能划分)

```
web/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── pages/                     # 页面
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Dashboard.tsx          # 首页看板
│   │   ├── accounts/
│   │   │   ├── AccountList.tsx
│   │   │   └── AccountForm.tsx
│   │   ├── categories/
│   │   │   └── CategoryManage.tsx
│   │   ├── transactions/
│   │   │   ├── TransactionList.tsx
│   │   │   ├── TransactionForm.tsx
│   │   │   └── CreditConsumptionForm.tsx
│   │   ├── credit/
│   │   │   ├── InstallmentList.tsx
│   │   │   └── CreditCardRepayment.tsx
│   │   ├── loans/
│   │   │   ├── LoanList.tsx
│   │   │   └── LoanRepayment.tsx
│   │   ├── imports/
│   │   │   ├── ImportList.tsx
│   │   │   ├── ImportUpload.tsx
│   │   │   └── ImportPreview.tsx
│   │   ├── reports/
│   │   │   └── ReportCenter.tsx
│   │   └── settings/
│   │       └── UserSettings.tsx
│   │
│   ├── components/                # 公共组件
│   │   ├── Layout/
│   │   ├── Form/
│   │   ├── Table/
│   │   └── Chart/
│   │
│   ├── services/                  # API 服务
│   │   ├── api.ts                # Axios 实例
│   │   ├── auth.ts
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── imports.ts
│   │   └── reports.ts
│   │
│   ├── hooks/                     # 自定义 Hooks
│   ├── stores/                    # Zustand 状态
│   ├── types/                      # TypeScript 类型
│   └── utils/                      # 工具函数
│
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 数据库实体关系设计

### 3.1 ER 图概览

```
┌─────────────┐       ┌─────────────┐
│    User    │       │    Book     │
├─────────────┤       ├─────────────┤
│ id (PK)     │──1:N──│ id (PK)     │
│ email       │       │ user_id (FK)│
│ password    │       │ name         │
│ nickname    │       │ currency     │
│ ...         │       │ is_default  │
└─────────────┘       └──────┬──────┘
                             │
                             │ 1:N
                             ▼
┌─────────────┐       ┌─────────────┐
│  Category   │       │   Account   │
├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │
│ book_id(FK) │       │ book_id(FK) │
│ parent_id   │       │ name        │
│ name        │       │ account_type│
│ category_type       │ credit_limit│
│ icon        │       │ billing_day │
│ is_system   │       │ ...         │
└──────┬──────┘       └──────┬──────┘
       │                      │
       │ 1:N                  │ 1:N
       ▼                      ▼
┌─────────────┐       ┌─────────────┐
│    Loan     │       │ Transaction │
├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │
│ account_id  │       │ book_id(FK) │
│ principal   │       │ account_id   │
│ ...         │       │ category_id │
└──────┬──────┘       │ amount     │
       │              │ tx_type    │
       │ 1:N         └──────┬──────┘
       ▼                     │
┌─────────────┐               │ 1:1
│LoanSchedule │               ▼
├─────────────┤       ┌─────────────┐
│ id (PK)     │       │CreditConsume│
│ loan_id(FK) │       ├─────────────┤
│ period_no   │       │ id (PK)     │
│ principal   │       │ account_id   │
│ interest   │       │ installment_ │
│ status     │       │ plan_id     │
└─────────────┘       └─────────────┘
```

### 3.2 核心表结构

#### 用户表 (users)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    avatar_url VARCHAR(500),
    timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
    currency_default VARCHAR(3) DEFAULT 'CNY',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 账本表 (books)

```sql
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    currency VARCHAR(3) DEFAULT 'CNY',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 账户表 (accounts)

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(20) NOT NULL,  -- cash/debit_card/ewallet/credit_card/credit_line/loan/virtual
    institution_name VARCHAR(100),
    card_last4 VARCHAR(4),
    credit_limit DECIMAL(15,2),        -- 信用额度
    billing_day INTEGER,                -- 账单日 1-31
    repayment_day INTEGER,               -- 还款日 1-31
    loan_principal DECIMAL(15,2),       -- 贷款本金
    loan_interest_rate DECIMAL(8,4),   -- 年利率
    opening_balance DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    available_limit DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'CNY',
    is_active BOOLEAN DEFAULT true,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 分类表 (categories)

```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    category_type VARCHAR(20) NOT NULL,  -- expense/income/transfer/repayment/adjustment/refund
    icon VARCHAR(50),
    color VARCHAR(20),
    sort_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    keywords_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 交易表 (transactions)

```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    occurred_at TIMESTAMP NOT NULL,
    posted_at TIMESTAMP,
    transaction_type VARCHAR(30) NOT NULL,  -- expense/income/transfer/repayment_credit_card/repayment_loan/refund/fee/adjustment/installment_purchase/installment_repayment/debt_borrow/debt_lend/debt_receive_back/debt_pay_back
    direction VARCHAR(10) NOT NULL,       -- in/out/internal
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'CNY',
    account_id UUID NOT NULL REFERENCES accounts(id),
    counterparty_account_id UUID REFERENCES accounts(id),
    category_id UUID REFERENCES categories(id),
    merchant VARCHAR(200),
    note TEXT,
    external_ref VARCHAR(200),
    source_type VARCHAR(20) DEFAULT 'manual',  -- manual/import/system
    source_batch_id UUID,
    source_row_no INTEGER,
    import_hash VARCHAR(64),
    status VARCHAR(20) DEFAULT 'confirmed',  -- draft/confirmed/void
    tags_json JSONB,
    extra_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 信用消费表 (credit_consumptions)

```sql
CREATE TABLE credit_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    transaction_id UUID REFERENCES transactions(id),
    merchant VARCHAR(200),
    total_amount DECIMAL(15,2) NOT NULL,
    consumption_date DATE NOT NULL,
    billing_cycle VARCHAR(20),  -- current/next
    is_installment BOOLEAN DEFAULT false,
    installment_plan_id UUID REFERENCES installment_plans(id),
    statement_status VARCHAR(20) DEFAULT 'unbilled',  -- unbilled/billed/partially_paid/paid
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 分期计划表 (installment_plans)

```sql
CREATE TABLE installment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    source_transaction_id UUID REFERENCES transactions(id),
    plan_name VARCHAR(200),
    total_amount DECIMAL(15,2) NOT NULL,
    total_periods INTEGER NOT NULL,
    current_period INTEGER DEFAULT 1,
    principal_per_period DECIMAL(15,2) NOT NULL,
    fee_per_period DECIMAL(15,2) DEFAULT 0,
    total_fee DECIMAL(15,2) DEFAULT 0,
    start_date DATE NOT NULL,
    first_repayment_date DATE,
    repayment_day INTEGER,
    status VARCHAR(20) DEFAULT 'active',  -- active/completed/cancelled
    early_settlement_supported BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 分期明细表 (installment_schedules)

```sql
CREATE TABLE installment_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installment_plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
    period_no INTEGER NOT NULL,
    due_date DATE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL,
    fee_amount DECIMAL(15,2) DEFAULT 0,
    total_due DECIMAL(15,2) NOT NULL,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    paid_at TIMESTAMP,
    payment_transaction_id UUID REFERENCES transactions(id),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/paid/overdue/skipped
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 信用卡账单表 (credit_statements)

```sql
CREATE TABLE credit_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    cycle_start_date DATE NOT NULL,
    cycle_end_date DATE NOT NULL,
    billing_date DATE NOT NULL,
    due_date DATE NOT NULL,
    statement_amount DECIMAL(15,2) NOT NULL,
    minimum_due DECIMAL(15,2),
    paid_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open',  -- open/partially_paid/paid/overdue
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 贷款计划表 (loan_plans)

```sql
CREATE TABLE loan_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    loan_name VARCHAR(200),
    principal_total DECIMAL(15,2) NOT NULL,
    principal_remaining DECIMAL(15,2) NOT NULL,
    annual_interest_rate DECIMAL(8,4) NOT NULL,
    repayment_method VARCHAR(30),  -- equal_principal_interest/equal_principal/custom
    total_periods INTEGER NOT NULL,
    current_period INTEGER DEFAULT 0,
    monthly_payment_estimated DECIMAL(15,2) NOT NULL,
    first_due_date DATE NOT NULL,
    repayment_day INTEGER,
    status VARCHAR(20) DEFAULT 'active',  -- active/completed/cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 贷款还款计划表 (loan_schedules)

```sql
CREATE TABLE loan_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_plan_id UUID NOT NULL REFERENCES loan_plans(id) ON DELETE CASCADE,
    period_no INTEGER NOT NULL,
    due_date DATE NOT NULL,
    principal_due DECIMAL(15,2) NOT NULL,
    interest_due DECIMAL(15,2) NOT NULL,
    total_due DECIMAL(15,2) NOT NULL,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    paid_at TIMESTAMP,
    payment_transaction_id UUID REFERENCES transactions(id),
    status VARCHAR(20) DEFAULT 'pending',  -- pending/paid/overdue
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 导入批次表 (import_batches)

```sql
CREATE TABLE import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    source_name VARCHAR(100),
    file_type VARCHAR(20) NOT NULL,  -- csv/xlsx
    total_rows INTEGER DEFAULT 0,
    parsed_rows INTEGER DEFAULT 0,
    preview_rows JSONB,
    confirmed_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    duplicate_rows INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'uploaded',  -- uploaded/parsed/reviewing/confirmed/failed
    mapping_config_json JSONB,
    parser_version VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 导入行表 (import_rows)

```sql
CREATE TABLE import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    row_no INTEGER NOT NULL,
    raw_data_json JSONB NOT NULL,
    normalized_data_json JSONB,
    guessed_account_id UUID REFERENCES accounts(id),
    guessed_category_id UUID REFERENCES categories(id),
    guessed_transaction_type VARCHAR(30),
    guessed_confidence DECIMAL(5,2),
    duplicate_candidate_id UUID,
    user_modified BOOLEAN DEFAULT false,
    confirm_status VARCHAR(20) DEFAULT 'pending',  -- pending/confirmed/skipped
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 归类规则表 (category_rules)

```sql
CREATE TABLE category_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    rule_name VARCHAR(100),
    match_field VARCHAR(30) NOT NULL,  -- merchant/description/external_category/counterparty
    match_type VARCHAR(20) NOT NULL,   -- exact/contains/regex
    match_value VARCHAR(500) NOT NULL,
    target_category_id UUID REFERENCES categories(id),
    target_account_id UUID REFERENCES accounts(id),
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. 关键业务难点与处理策略

### 4.1 导入系统（最高优先级）

| 难点 | 处理策略 |
|------|----------|
| 多格式解析 | 先统一转为标准中间格式 (Ledger Import Standard v1) |
| 编码识别 | 使用 chardet 自动检测文件编码 |
| 智能归类 | 规则引擎优先：商户匹配 > 关键词匹配 > 历史学习 |
| 去重检测 | 三级去重：external_txn_id 精确 > 时间+金额+商户近似 > 摘要相似 |
| 字段映射 | 支持用户自定义映射模板，保存复用 |

### 4.2 信用账户与分期

| 难点 | 处理策略 |
|------|----------|
| 账单日/还款日 | 账户表存储，账单自动按周期生成 |
| 分期生成 | 创建分期计划时自动生成 N 条分期明细 |
| 统计口径 | 默认按"消费发生时"计入支出，提供切换视图 |
| 提前还款 | 预留接口，计算剩余本金利息 |

### 4.3 金额精度

| 难点 | 处理策略 |
|------|----------|
| 浮点误差 | 所有金额使用 `DECIMAL(15,2)`，Python 用 `Decimal` 类型 |
| 汇率 | 初期简化，单币种；预留 currency 字段 |
| 四舍五入 | 统一在入库前处理，保留 2 位小数 |

### 4.4 数据一致性

| 场景 | 处理策略 |
|------|----------|
| 转账 | 事务包裹：扣减转出账户 + 增加转入账户 |
| 信用卡还款 | 事务包裹：借记卡扣款 + 信用卡减少欠款 + 状态更新 |
| 贷款还款 | 事务包裹：账户扣款 + 贷款本金减少 + 利息计支出 + 计划更新 |
| 删除账户 | 先检查有关联交易，返回错误或 cascade |
| 删除分类 | 软删除 (`is_active=false`)，保留历史 |

---

## 5. 开发阶段拆分计划

### 阶段 1：基础设施 (1-2 天)

- [ ] 项目初始化 (FastAPI + React)
- [ ] 数据库连接 + Alembic 配置
- [ ] 用户认证 (JWT)
- [ ] 统一响应结构 + 异常处理
- [ ] OpenAPI / Swagger 配置

### 阶段 2：基础业务 (2-3 天)

- [ ] 账本 CRUD
- [ ] 账户 CRUD + 余额管理
- [ ] 分类管理 + 二级分类
- [ ] 交易 CRUD (支出/收入/转账)
- [ ] 交易列表筛选

### 阶段 3：信用与债务 (2-3 天)

- [ ] 信用消费记录
- [ ] 分期计划 + 分期明细生成
- [ ] 信用卡还款
- [ ] 贷款账户 + 贷款计划 + 还款

### 阶段 4：导入系统 (3-4 天) ⭐重点

- [ ] 文件上传
- [ ] CSV/Excel 解析
- [ ] 标准中间格式转换
- [ ] 自动归类引擎
- [ ] 预览确认页面
- [ ] 去重检测
- [ ] 正式导入

### 阶段 5：报表看板 (2-3 天)

- [ ] 首页总览
- [ ] 支出/收入分析
- [ ] 账户分析
- [ ] 债务分析
- [ ] 现金流分析

### 阶段 6：收尾与部署 (1-2 天)

- [ ] 种子数据 (默认分类)
- [ ] 单元测试 + 集成测试
- [ ] Docker 配置
- [ ] 文档整理

---

## 6. 目录结构草案

```
personal-finance/
├── server/                    # 后端项目
│   ├── src/
│   │   ├── main.py
│   │   ├── core/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── books/
│   │   │   ├── accounts/
│   │   │   ├── categories/
│   │   │   ├── transactions/
│   │   │   ├── credit/
│   │   │   ├── loans/
│   │   │   ├── imports/
│   │   │   ├── rules/
│   │   │   └── reports/
│   │   └── common/
│   ├── migrations/
│   ├── seeds/
│   ├── tests/
│   ├── .env.example
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
│
├── web/                       # 前端项目
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                      # 文档
│   ├── api/
│   │   └── openapi.yaml
│   ├── import_standard.md
│   └── deployment.md
│
└── README.md
```

---

## 确认后启动

请确认以上设计方案，我将按阶段执行：

1. 阶段 1：基础设施搭建
2. 阶段 2：基础业务 CRUD
3. 阶段 3：信用与债务
4. 阶段 4：导入系统 ⭐
5. 阶段 5：报表看板
6. 阶段 6：测试与部署

确认后请回复「确认设计，开始执行」，我将立即启动编码。
