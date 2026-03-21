# Code Review Report (2026-03-21)

本报告基于当前仓库代码进行静态审查，聚焦：业务逻辑与数据完整性、安全与权限、架构与可维护性、异常处理、性能。

## 高优先级问题清单

1. 多个接口直接信任 `book_id` 参数，缺少“账本归属当前用户”的后端强校验，存在 IDOR 风险。
2. 导入模块的 `rows` 查询与更新接口未鉴权，已登录用户可通过 row_id/batch_id 越权读取和修改他人导入数据。
3. 余额调整接口 `amount` 使用 `float`，并在接口层接收 `book_id`，带来金额精度和越权双重风险。
4. 转账接口声明返回列表，但服务实际返回单对象，容易触发响应校验异常。
5. 前端仍大量使用 mock 数据与手写 fetch，且字段命名与后端 schema 不一致，前后端状态同步不可控。

## 建议优先修复顺序

- P0: 统一 book_id 授权校验 + imports 越权修复。
- P0: 余额调整金额改 Decimal + 统一交易创建 DTO。
- P1: 修复 transfer 返回模型不一致。
- P1: 拆分 `transactions/service.py`（记账规则引擎 + 持久化 + 编排事务）。
- P2: 前端统一 API 层与类型契约，移除 mock 页面。

## 整改与自查（本次提交）

- ✅ 已完成：`book_id` 统一按用户归属校验（books/accounts/categories/tags/reports/transactions/imports）。
- ✅ 已完成：imports 行查询与更新接口补齐鉴权，并在 service 层按 book_id 约束。
- ✅ 已完成：余额调整 `amount` 从 `float` 改为 `Decimal`，并移除 body 传入 `book_id`。
- ✅ 已完成：transfer 路由返回模型与 service 实际返回统一为单对象。
- ✅ 已完成：修复核心循环导入路径（`main.py` 改为直接从 router 模块导入，auth/books 包不再在 `__init__` 里强制导入 router）。
