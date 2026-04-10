import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CategorySelector } from '../components/CategorySelector';
import { TagMultiSelect } from '../components/TagMultiSelect';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
} from '../components/TransactionFormLayout';
import { apiGet, apiPatch, apiPost } from '../services/api';
import {
  AccountOption,
  CategoryOption,
  TagOption,
  getDefaultBookId,
} from './transactionFormSupport';

interface InstallmentPreviewRow {
  period: number;
  principal: number;
  fee: number;
  total: number;
}

import Decimal from 'decimal.js';

/**
 * 🛡️ L: 尾差计算算法 — 使用 decimal.js 消除 JS 浮点误差
 * 处理无法整除的情况，例如 10000 ÷ 3 = 3333.33
 * 前 n-1 期每期 basePrincipal，最后一期用余额减法兜底，确保总额精确等于 totalAmount
 */
function calculateInstallmentPlan(
  totalAmount: number,
  totalPeriods: number,
  feePerPeriod: number = 0
): InstallmentPreviewRow[] {
  const rows: InstallmentPreviewRow[] = []

  // 🛡️ L: 使用 Decimal 替代原生 number，彻底消除 0.1+0.2 类误差
  const total = new Decimal(totalAmount)
  const periods = new Decimal(totalPeriods)
  const fee = new Decimal(feePerPeriod)

  // 每期本金 = 总额 / 期数，向下取整到分
  const basePrincipal = total.dividedBy(periods).toDecimalPlaces(2, Decimal.ROUND_DOWN)

  for (let i = 1; i <= totalPeriods; i++) {
    let principal: Decimal

    if (i < totalPeriods) {
      principal = basePrincipal
    } else {
      // 🛡️ L: 最后一期用减法兜底，确保总额精确等于 totalAmount
      principal = total.minus(basePrincipal.times(totalPeriods - 1))
    }

    const totalDue = principal.plus(fee)

    rows.push({
      period: i,
      principal: principal.toNumber(),
      fee: fee.toNumber(),
      total: totalDue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    })
  }

  return rows
}

export default function InstallmentPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const [bookId, setBookId] = useState('');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [periods, setPeriods] = useState(12);
  const [feePerPeriod, setFeePerPeriod] = useState('');
  const [repaymentDay, setRepaymentDay] = useState(15);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [firstExecutionDate, setFirstExecutionDate] = useState(new Date().toISOString().split('T')[0]);
  const [firstBillingDate, setFirstBillingDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [isInterestFree, setIsInterestFree] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setInitializing(true);
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');
        setBookId(bookId);
        const { accounts: accs, categories: cats, tags: tgs } = await import('./transactionFormSupport').then(m => m.loadTransactionFormData(bookId));
        setAccounts(accs);
        setCategories(cats);
        setTags(tgs);

        if (id) {
          const plan = await apiGet<any>(`/api/installments/${id}?book_id=${bookId}`);
          setAccountId(plan.account_id || '');
          setCategoryId(plan.category_id || '');
          setMerchant(plan.plan_name || '');
          setAmount(String(plan.total_amount || ''));
          setPeriods(Number(plan.total_periods || 12));
          setFeePerPeriod(String(plan.fee_per_period || ''));
          setRepaymentDay(Number(plan.repayment_day || 1));
          setMemo(plan.note || '');
          setDate(plan.start_date || '');
          setFirstExecutionDate(plan.first_execution_date || plan.next_execution_date || '');
          setFirstBillingDate(plan.first_billing_date || plan.start_date || '');
          setTagIds(Array.isArray(plan.tags) ? plan.tags : []);
          setIsInterestFree(Number(plan.fee_per_period || 0) === 0);
        }
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
      } finally {
        setInitializing(false);
      }
    };
    loadData();
  }, [id]);

  const creditAccounts = useMemo(
    () => accounts.filter((account) => ['credit_card', 'credit_line'].includes(account.account_type)),
    [accounts],
  );

  const installmentCategories = useMemo(
    () => categories.filter((c) => c.category_type === 'expense' || c.category_type === 'income_expense'),
    [categories],
  );
  const selectedAccount = useMemo(
    () => creditAccounts.find((account) => account.id === accountId),
    [accountId, creditAccounts],
  );

  useEffect(() => {
    if (!selectedAccount) return;
    const rawStatementDay = selectedAccount.statement_date ?? selectedAccount.billing_day;
    const statementDay = Number(rawStatementDay);
    if (!Number.isFinite(statementDay) || statementDay < 1 || statementDay > 31) return;

    const derivedBillingDay = statementDay === 1 ? 31 : statementDay - 1;
    setRepaymentDay(derivedBillingDay);
  }, [selectedAccount?.id]);

  // 计算预览计划
  const previewPlan = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    const fee = isInterestFree ? 0 : (parseFloat(feePerPeriod) || 0);
    if (amt <= 0 || periods <= 0) return [];
    return calculateInstallmentPlan(amt, periods, fee);
  }, [amount, periods, feePerPeriod, isInterestFree]);

  // 计算总利息
  const totalFee = useMemo(() => {
    const fee = isInterestFree ? 0 : (parseFloat(feePerPeriod) || 0);
    return fee * periods;
  }, [feePerPeriod, periods, isInterestFree]);
  const selectedTagLabels = useMemo(() => {
    return tagIds
      .map((id) => {
        const tag = tags.find((item) => item.id === id);
        if (!tag) return '';
        if (!tag.parent_id) return tag.name;
        const parent = tags.find((item) => item.id === tag.parent_id);
        return parent ? `${parent.name} / ${tag.name}` : tag.name;
      })
      .filter(Boolean);
  }, [tagIds, tags]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const bookId = await getDefaultBookId();
      if (!bookId) throw new Error('无法获取账本信息');
      const normalizedTagIds = tagIds.filter(Boolean);

      if (isEditMode) {
        await apiPatch(`/api/installments/${id}?book_id=${bookId}`, {
          plan_name: merchant,
          category_id: categoryId || null,
          note: memo || null,
          start_date: date,
          repayment_day: repaymentDay,
          tags: normalizedTagIds.length > 0 ? normalizedTagIds : null,
        });
      } else {
        await apiPost('/api/installments', {
          occurred_at: new Date(date).toISOString(),
          book_id: bookId,
          account_id: accountId,
          merchant,
          category_id: categoryId || null,
          note: memo || null,
          total_amount: parseFloat(amount),
          total_periods: periods,
          fee_per_period: isInterestFree ? 0 : (feePerPeriod ? parseFloat(feePerPeriod) : 0),
          installment_amount: previewPlan[0]?.total || 0,
          start_date: date,
          first_execution_date: firstExecutionDate,
          first_billing_date: firstBillingDate,
          repayment_day: repaymentDay,
          plan_name: merchant,
          tags: normalizedTagIds.length > 0 ? normalizedTagIds : null,
        });
      }

      navigate('/installments');
    } catch (err) {
      setError((err as Error).message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return <TransactionFormLayout pageTitle={isEditMode ? "编辑分期" : "信用卡分期购物"}>加载中...</TransactionFormLayout>;
  }

  return (
    <TransactionFormLayout pageTitle={isEditMode ? "编辑分期" : "信用卡分期购物"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className={transactionFormSectionClass}>
          {/* 支出项目 - 分类 */}
          <div>
            <label className={transactionFormLabelClass}>支出项目 *</label>
            <CategorySelector
              categories={installmentCategories as any}
              value={categoryId}
              onChange={setCategoryId}
              placeholder="点击选择类别"
            />
          </div>

          {/* 分期总金额 */}
          <div>
            <label className={transactionFormLabelClass}>分期总金额 *</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={transactionFormFieldClass} required />
          </div>

          {/* 信用卡账户 */}
          <div>
            <label className={transactionFormLabelClass}>信用卡账户 *</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={transactionFormFieldClass} required disabled={isEditMode}>
              <option value="">选择信用卡/信用账户</option>
              {creditAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>

          {/* 分期申请日期 */}
          <div>
            <label className={transactionFormLabelClass}>分期创建日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={transactionFormFieldClass} required />
          </div>

          {/* 首次入账日期 */}
          <div>
            <label className={transactionFormLabelClass}>首次入账日期</label>
            <input type="date" value={firstBillingDate} onChange={(e) => setFirstBillingDate(e.target.value)} className={transactionFormFieldClass} required={!isEditMode} disabled={isEditMode} />
          </div>

          <div>
            <label className={transactionFormLabelClass}>首次执行日期</label>
            <input type="date" value={firstExecutionDate} onChange={(e) => setFirstExecutionDate(e.target.value)} className={transactionFormFieldClass} required={!isEditMode} disabled={isEditMode} />
          </div>

          {/* 分期的总期数 */}
          <div>
            <label className={transactionFormLabelClass}>分期期数 *</label>
            <select value={periods} onChange={(e) => setPeriods(Number(e.target.value))} className={transactionFormFieldClass} disabled={isEditMode}>
              {[3, 6, 9, 12, 18, 24, 36].map((p) => <option key={p} value={p}>{p} 期</option>)}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>每月账单日</label>
            <input
              type="number"
              min="1"
              max="31"
              value={repaymentDay}
              onChange={(e) => setRepaymentDay(Number(e.target.value))}
              className={transactionFormFieldClass}
              required
            />
          </div>

          {/* 手续费与利息 - Switch */}
          <div>
            <label className={transactionFormLabelClass}>手续费与利息</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInterestFree}
                  onChange={(e) => setIsInterestFree(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm text-[var(--text-secondary)]">免息/免手续费</span>
              </label>
            </div>
            {!isInterestFree && (
              <div className="mt-2">
                <label className={`${transactionFormLabelClass} text-xs`}>每期手续费 (元)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={feePerPeriod}
                  onChange={(e) => setFeePerPeriod(e.target.value)}
                  placeholder="0.00"
                  className={`${transactionFormFieldClass} mt-1`}
                />
              </div>
            )}
          </div>

          {/* 标签 */}
          <div>
            <label className={transactionFormLabelClass}>标签</label>
            <TagMultiSelect
              allTags={tags}
              value={tagIds}
              onChange={setTagIds}
              onTagsUpdated={setTags}
              bookId={bookId}
              placeholder="搜索、选择或创建标签"
            />
            {selectedTagLabels.length > 0 ? (
              <div
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                {selectedTagLabels.map((label) => (
                  <span
                    key={label}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '999px',
                      background: 'var(--bg-elevated)',
                      padding: '4px 10px',
                      fontSize: '12px',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* 备注 */}
          <div>
            <label className={transactionFormLabelClass}>备注</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="添加备注..." rows={3} className={transactionFormTextareaClass} />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/installments')} className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:brightness-95">
            返回
          </button>
          <button 
            type="button" 
            onClick={() => setShowPreview(true)}
            disabled={isEditMode || !amount || !accountId}
            className="flex-1 rounded-xl border border-blue-300 bg-blue-50 py-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
          >
            预览
          </button>
          <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? '保存中...' : isEditMode ? '保存修改' : '确认提交'}
          </button>
        </div>
      </form>

      {/* 预览弹窗 */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">分期计划预览</h3>
            
            {/* 汇总信息 */}
            <div className="mb-4 rounded-xl bg-[var(--bg-elevated)] p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--text-tertiary)]">分期总金额</span>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">¥{parseFloat(amount || '0').toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">分期期数</span>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">{periods} 期</p>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">每期手续费</span>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">¥{isInterestFree ? '0.00' : (parseFloat(feePerPeriod || '0')).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[var(--text-tertiary)]">总手续费</span>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">¥{totalFee.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* 还款计划表 */}
            <div className="mb-4 max-h-64 overflow-y-auto rounded-xl border border-[var(--border-color)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--bg-elevated)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">期数</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--text-secondary)]">本金</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--text-secondary)]">手续费</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--text-secondary)]">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {previewPlan.map((row) => (
                    <tr key={row.period} className="border-t border-[var(--border-light)]">
                      <td className="px-3 py-2 text-[var(--text-primary)]">第 {row.period} 期</td>
                      <td className="px-3 py-2 text-right text-[var(--text-secondary)]">¥{row.principal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-secondary)]">¥{row.fee.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-[var(--text-primary)]">¥{row.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 尾差说明 */}
            <div className="mb-4 text-xs text-[var(--text-tertiary)]">
              {parseFloat(amount) % periods !== 0 && (
                <p>💡 由于金额无法整除，最后一期已自动调整以处理尾差。</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:brightness-95"
              >
                取消
              </button>
              <button
                type="submit"
                onClick={(e) => {
                  setShowPreview(false);
                  handleSubmit(e as any);
                }}
                disabled={loading}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}

    </TransactionFormLayout>
  );
}
