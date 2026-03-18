# 个人记账 Web 服务 (Personal Finance)

一个功能完整的个人/家庭记账 Web 应用，支持账户管理、交易记录、分期消费、贷款管理、批量导入和报表分析。

## 功能特性

### 核心功能
- 📊 **账户管理** - 支持现金、借记卡、电子钱包、信用卡、信用账户(花呗)、贷款账户等多种类型
- 💰 **交易记录** - 支出、收入、转账、退款完整支持
- 📈 **分期消费** - 信用卡/花呗分期，自动生成期数和还款计划
- 🏦 **贷款管理** - 房贷、车贷等贷款，支持本金/利息拆分
- 📤 **批量导入** - CSV 文件导入，自动识别归类
- 📉 **报表分析** - 首页总览、分类支出、账户分析、债务看板

### 技术特点
- ✅ 按业务规则设计，支出/收入/现金流统计口径清晰
- ✅ SQLite 轻量化数据库，无需额外安装
- ✅ 预留 PostgreSQL 迁移路径
- ✅ RESTful API，前后端分离架构

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.11 + FastAPI + SQLAlchemy |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| 前端 | React 18 + TypeScript + Vite |
| UI | Ant Design 5.x |
| 图表 | ECharts |

## 快速开始

### 后端启动

```bash
cd server

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m uvicorn src.main:app --reload

# API 文档: http://localhost:8000/docs
```

### 前端启动

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问: http://localhost:5173
```

## 项目结构

```
personal-finance/
├── docs/                      # 技术方案文档
│   ├── TECH_DESIGN.md        # PostgreSQL 版设计
│   └── TECH_DESIGN_LITE_V8.md # SQLite 最终版设计
│
├── server/                    # 后端项目
│   ├── src/
│   │   ├── main.py          # FastAPI 入口
│   │   ├── core/            # 核心模块
│   │   │   ├── config.py    # 配置管理
│   │   │   ├── database.py  # 数据库连接
│   │   │   ├── security.py # JWT 鉴权
│   │   │   └── exceptions.py
│   │   │
│   │   ├── modules/          # 业务模块
│   │   │   ├── auth/         # 用户认证
│   │   │   ├── books/       # 账本管理
│   │   │   ├── accounts/    # 账户管理
│   │   │   ├── categories/  # 分类管理
│   │   │   ├── transactions/# 交易记录
│   │   │   ├── installments/ # 分期消费
│   │   │   ├── loans/       # 贷款管理
│   │   │   ├── imports/     # 批量导入
│   │   │   ├── rules/       # 归类规则
│   │   │   └── reports/     # 报表分析
│   │   │
│   │   └── common/          # 公共工具
│   │
│   ├── data/                # SQLite 数据库
│   ├── migrations/          # 数据库迁移
│   ├── requirements.txt
│   └── .env.example
│
└── web/                     # 前端项目
    ├── src/
    │   ├── pages/          # 页面组件
    │   │   ├── Dashboard.tsx   # 首页看板
    │   │   ├── Accounts.tsx    # 账户管理
    │   │   ├── Categories.tsx  # 分类管理
    │   │   ├── Transactions.tsx # 交易记录
    │   │   ├── Transfer.tsx   # 转账
    │   │   ├── CreditCards.tsx # 信用账户
    │   │   ├── Loans.tsx      # 贷款管理
    │   │   ├── Imports.tsx    # 批量导入
    │   │   └── Reports.tsx    # 报表中心
    │   │
    │   ├── services/        # API 服务
    │   └── App.tsx
    │
    ├── package.json
    └── vite.config.ts
```

## API 接口

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 账本
- `GET/POST /api/books` - 获取/创建账本
- `GET/PATCH/DELETE /api/books/{id}` - 账本 CRUD

### 账户
- `GET/POST /api/accounts` - 获取/创建账户
- `GET/PATCH/DELETE /api/accounts/{id}` - 账户 CRUD

### 分类
- `GET /api/categories` - 获取分类列表
- `GET /api/categories/tree` - 获取分类树
- `POST /api/categories` - 创建分类

### 交易
- `GET /api/transactions` - 交易列表(支持筛选)
- `POST /api/transactions` - 创建交易
- `POST /api/transactions/transfer` - 转账
- `POST /api/transactions/refund` - 退款

### 分期
- `GET /api/installments` - 分期计划列表
- `POST /api/installments` - 创建分期消费
- `POST /api/installments/{id}/settle` - 分期还款

### 贷款
- `GET /api/loans` - 贷款列表
- `POST /api/loans` - 创建贷款
- `POST /api/loans/{id}/repay` - 贷款还款

### 导入
- `POST /api/imports/upload` - 上传 CSV
- `GET /api/imports/{id}/rows` - 获取导入预览
- `POST /api/imports/{id}/confirm` - 确认导入

### 报表
- `GET /api/reports/overview` - 首页总览
- `GET /api/reports/expense-by-category` - 分类支出
- `GET /api/reports/accounts` - 账户汇总
- `GET /api/reports/upcoming-debts` - 待还债务

## 交易类型与统计口径

| 类型 | 计入支出 | 计入收入 | 现金流 |
|------|---------|---------|--------|
| expense (支出) | ✅ | ❌ | ✅ (资产账户) |
| income (收入) | ❌ | ✅ | ✅ |
| installment_purchase (分期消费) | ✅ | ❌ | ❌ |
| fee (手续费/利息) | ✅ | ❌ | ✅ |
| repayment_credit_card | ❌ | ❌ | ❌ |
| repayment_loan | ❌ | ❌ | ❌ |
| debt_borrow/debt_lend | ❌ | ❌ | ✅ |
| refund | ❌ | ❌ | ✅ (资产账户) |

详细统计规则见 `docs/TECH_DESIGN_LITE_V8.md`

## 设计文档

详见 `docs/` 目录：

- `TECH_DESIGN.md` - 最初版 PostgreSQL 方案
- `TECH_DESIGN_LITE_V8.md` - **最终版 SQLite 方案** (推荐阅读)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
