# 个人记账 Personal Finance

一个功能完整的个人/家庭记账 Web 应用，支持账户管理、交易记录、分期消费、贷款管理、定期自动记账、批量导入和报表分析。

## 功能特性

### 核心功能
- 📊 **账户管理** - 支持现金、借记卡、电子钱包、信用卡、信用账户（花呗）、贷款账户、资产账户（房屋/车辆）等多种类型
- 💰 **交易记录** - 支出、收入、转账、退款完整支持，支持标签管理
- 💳 **分期消费** - 信用卡/花呗分期，自动生成期数和还款计划，支持冻结额度管理
- 📋 **分期任务大盘** - 统一查看所有进行中的分期任务，支持单期执行/撤回
- 🏦 **贷款管理** - 房贷、车贷等贷款，支持本金/利息拆分
- 🔄 **定期自动记账** - 配置定期规则，自动生成待确认交易
- 📤 **批量导入** - CSV 文件导入，支持导入模板管理
- 📉 **报表分析** - 首页总览、分类支出、账户分析、债务看板、月度对比
- 📈 **余额趋势图** - 信用账户显示每日可用额度趋势，资产账户显示历史余额变化
- 🏷️ **标签管理** - 标签增删改、回收站恢复、父子标签分组
- 🎯 **愿望清单** - 记录心愿目标和进度

### 信用账户专项
- 本期待还金额计算（账单日/还款日管理）
- 距还款日倒计时
- 可用额度实时计算：`可用额度 = 信用额度 - 欠款 - 冻结金额`
- 调整总额度（不生成流水）
- 负债平账（生成调整流水）
- 分期冻结/解冻历史轨迹回放（account_state_events）

### 技术特点
- ✅ 按业务规则设计，支出/收入/现金流统计口径清晰
- ✅ SQLite 轻量化数据库，无需额外安装，启动时自动兼容旧库
- ✅ 预留 PostgreSQL 迁移路径（Alembic）
- ✅ RESTful API，前后端分离架构
- ✅ 业务日（本地日期）体系，避免时区偏移
- ✅ 20+ 回归测试，覆盖余额计算、分期流程、信用账户边界

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.12 + FastAPI + SQLAlchemy + Alembic |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| 前端 | React 18 + TypeScript + Vite |
| UI | Ant Design 5.x |
| 图表 | ECharts |

## 快速开始

### 后端启动

```bash
cd server

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn src.main:app --host 0.0.0.0 --port 8000

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

### 默认账号
- 用户名: test
- 密码: 357103

## 项目结构

```
personal-finance/
├── server/                    # 后端项目
│   ├── src/
│   │   ├── main.py           # FastAPI 入口
│   │   ├── core/             # 核心模块
│   │   │   ├── config.py    # 配置管理
│   │   │   ├── database.py  # 数据库连接 + 旧库自修复
│   │   │   ├── security.py  # JWT 鉴权
│   │   │   └── exceptions.py
│   │   │
│   │   ├── modules/         # 业务模块
│   │   │   ├── auth/         # 用户认证
│   │   │   ├── books/        # 账本管理
│   │   │   ├── accounts/     # 账户管理
│   │   │   ├── categories/   # 分类管理
│   │   │   ├── transactions/ # 交易记录
│   │   │   ├── installments/  # 分期消费（含 account_state_events）
│   │   │   ├── loans/        # 贷款管理
│   │   │   ├── imports/      # 批量导入
│   │   │   ├── import_templates/  # 导入模板
│   │   │   ├── rules/        # 归类规则
│   │   │   ├── recurring_rules/  # 定期规则
│   │   │   ├── recurring_pending/ # 待确认定期交易
│   │   │   ├── reports/      # 报表分析
│   │   │   ├── tags/         # 标签管理
│   │   │   ├── bills/        # 账单管理
│   │   │   ├── wishlists/     # 愿望清单
│   │   │   └── durable_assets/ # 固定资产
│   │   │
│   │   └── common/          # 公共工具
│   │       └── dates.py     # 业务日工具
│   │
│   ├── migrations/          # Alembic 数据库迁移
│   ├── data/                # SQLite 数据库
│   ├── requirements.txt
│   └── .env.example
│
└── web/                      # 前端项目
    ├── src/
    │   ├── pages/           # 页面组件
    │   │   ├── DashboardPage.tsx       # 首页看板
    │   │   ├── AccountBalanceTrendPage.tsx  # 账户余额趋势
    │   │   ├── AssetDetailPage.tsx     # 资产账户详情
    │   │   ├── Transactions.tsx        # 交易记录
    │   │   ├── AddTransactionPage.tsx  # 添加交易
    │   │   ├── TransferPage.tsx        # 转账
    │   │   ├── OtherHubPage.tsx        # 其他交易入口
    │   │   ├── InstallmentPage.tsx     # 分期消费录入
    │   │   ├── InstallmentTasksPage.tsx # 分期任务大盘
    │   │   ├── ReportsHomePage.tsx     # 报表中心
    │   │   ├── ExpenseDistributionPage.tsx    # 分类支出
    │   │   ├── IncomeDistributionPage.tsx     # 分类收入
    │   │   ├── MonthlySummaryPage.tsx        # 月度总览
    │   │   ├── MonthlyComparisonPage.tsx    # 月度对比
    │   │   ├── TagDistributionPage.tsx       # 标签分布
    │   │   ├── DebtPage.tsx                  # 债务看板
    │   │   ├── TagManagementPage.tsx        # 标签管理
    │   │   ├── ImportPage.tsx / ImportsPage.tsx  # 导入
    │   │   ├── ImportTemplatesPage.tsx      # 导入模板
    │   │   ├── RecurringRulesPage.tsx       # 定期规则
    │   │   ├── DurableAssetsPage.tsx        # 固定资产
    │   │   ├── WishlistPage.tsx             # 愿望清单
    │   │   ├── SettingsPage.tsx            # 设置
    │   │   └── ...
    │   │
    │   ├── services/         # API 服务
    │   ├── components/       # 公共组件
    │   └── App.tsx           # 主应用
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

### 账户
- `GET/POST /api/accounts` - 获取/创建账户
- `GET/PATCH/DELETE /api/accounts/{id}` - 账户 CRUD
- `POST /api/accounts/{id}/adjust-limit` - 调整信用额度（不生成流水）
- `POST /api/accounts/rebuild/{id}` - 重建账户余额
- `GET /api/accounts/credit-repayment-summary` - 信用还款汇总
- `GET /api/accounts/{id}/balance-trend` - 余额/可用额度趋势

### 分类
- `GET /api/categories` - 获取分类列表
- `GET /api/categories/tree` - 获取分类树
- `POST /api/categories` - 创建分类

### 交易
- `GET /api/transactions` - 交易列表（支持筛选）
- `POST /api/transactions` - 创建交易
- `POST /api/transactions/transfer` - 转账
- `POST /api/transactions/adjust` - 余额/可用额度平账
- `POST /api/transactions/refund` - 退款

### 标签
- `GET /api/tags` - 获取标签列表
- `POST /api/tags` - 创建标签
- `PATCH /api/tags/{id}` - 更新标签
- `DELETE /api/tags/{id}` - 删除标签（软删除）

### 分期
- `GET /api/installments` - 分期计划列表
- `POST /api/installments` - 创建分期消费
- `POST /api/installments/{id}/execute` - 执行单期分期
- `POST /api/installments/{id}/revert` - 撤回单期分期
- `DELETE /api/installments/{id}` - 删除分期计划

### 贷款
- `GET /api/loans` - 贷款列表
- `POST /api/loans` - 创建贷款
- `POST /api/loans/{id}/repay` - 贷款还款

### 定期规则
- `GET /api/recurring-rules` - 获取定期规则列表
- `POST /api/recurring-rules` - 创建定期规则
- `PATCH /api/recurring-rules/{id}` - 更新定期规则
- `DELETE /api/recurring-rules/{id}` - 删除定期规则
- `GET /api/recurring-pending` - 待确认的定期交易

### 导入
- `POST /api/imports/upload` - 上传 CSV
- `GET /api/imports/{id}/rows` - 获取导入预览
- `POST /api/imports/{id}/confirm` - 确认导入
- `GET /api/import-templates` - 获取导入模板列表
- `POST /api/import-templates` - 创建导入模板

### 报表
- `GET /api/reports/overview` - 首页总览
- `GET /api/reports/expense-by-category` - 分类支出
- `GET /api/reports/income-by-category` - 分类收入
- `GET /api/reports/accounts` - 账户汇总
- `GET /api/reports/upcoming-debts` - 待还债务
- `GET /api/reports/monthly-summary` - 月度总览
- `GET /api/reports/monthly-comparison` - 月度对比

### 账单
- `GET /api/bills` - 获取账单列表
- `GET /api/bills/summary` - 账单汇总

### 愿望清单
- `GET /api/wishlists` - 获取愿望清单
- `POST /api/wishlists` - 创建愿望
- `PATCH /api/wishlists/{id}` - 更新愿望

### 固定资产
- `GET /api/durable-assets` - 获取固定资产列表
- `POST /api/durable-assets` - 创建固定资产

## 信用账户算法

### 可用额度计算
```
可用额度 = 信用额度 - 当前欠款 - 冻结金额
```

### 平账公式（调整可用额度）
```
目标欠款 = 信用额度 - 冻结金额 - 目标可用额度
欠款差额 = 目标欠款 - 当前欠款
- 欠款差额 > 0 → 生成支出流水
- 欠款差额 < 0 → 生成收入流水
```

### 分期冻结逻辑
```
创建分期时：
  冻结金额 = 每期金额 × (总期数 - 1)
执行单期时：
  冻结金额 -= 每期金额
  欠款 -= 每期金额
```

### 分期状态事件（account_state_events）
通过 `InstallmentStateEvent` 事件表记录分期生命周期中的每一次状态变更，支持冻结轨迹历史回放：
- `created` - 分期创建（生成冻结）
- `deleted` - 分期删除（释放冻结）
- `executed` - 单期执行（解冻并减少欠款）
- `reverted` - 单期撤回（恢复冻结和欠款）
- `credit_limit_changed` - 额度调整

## 设计文档

详见 `docs/` 目录：

- `TECH_DESIGN.md` - 最初版 PostgreSQL 方案
- `TECH_DESIGN_LITE_V8.md` - **最终版 SQLite 方案**（推荐阅读）

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
