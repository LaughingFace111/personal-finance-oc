# 余额调整流水展示修复报告

## 修改目标

修复账户详情页中余额调整流水（`source_type=SYSTEM`）的展示与金额颜色问题，并确认其不参与收支统计的逻辑保持不变。

## 已完成修改

### 1. 后端：恢复 SYSTEM 交易在流水列表中显示

文件：`server/src/modules/transactions/service.py`

- 删除了 `get_transactions` 中对 `source_type=SYSTEM` 的额外过滤逻辑。
- 结果：余额调整流水会重新出现在账户详情页及普通流水列表中。

### 2. 前端：SYSTEM 交易使用中性颜色渲染

文件：`web/src/App.tsx`

- 调整了 `getTransactionAmountMeta(...)` 的逻辑。
- 当 `transaction.source_type === 'system'` 时：
  - 颜色使用 `#999`
  - 前缀根据 `direction` 显示 `+` 或 `-`
- 普通收入/支出、转账/还款的原有颜色逻辑保持不变。

## 统计逻辑确认

已确认 [server/src/modules/reports/service.py](/home/joshua/Desktop/personal-finance/server/src/modules/reports/service.py#L95) 中 `_get_period_metrics(...)` 仍然使用以下条件过滤：

- `Transaction.include_in_income == True`
- `Transaction.include_in_expense == True`

因此，余额调整流水是否参与 Dashboard / 报表统计，仍然由这两个标志控制，本次未修改该逻辑。

## 本次变更文件

- `server/src/modules/transactions/service.py`
- `web/src/App.tsx`
- `balance_adjust_display_fix.md`

## 验证结果

- 已执行 `git diff` 核对目标改动。
- 未运行自动化测试；本次为定向修复，主要验证了代码路径和差异内容。
