import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
import { CategorySelector } from '../components/CategorySelector';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
} from '../components/TransactionFormLayout';
import { apiPost } from '../services/api';
import {
  AccountOption,
  CategoryOption,
  TagOption,
  getCategoryLabel,
  getDefaultBookId,
} from './transactionFormSupport';

interface InstallmentPreviewRow {
  period: number;
  principal: number;
  fee: number;
  total: number;
}

/**
 * 🛡️ L: 尾差计算算法
 * 处理无法整除的情况，例如 10000 ÷ 3 = 3333.33
 * 前 n-1 期每期 3333.33，最后一期用余额兜底 (3333.34)
 */
function calculateInstallmentPlan(
  totalAmount: number,
  totalPeriods: number,
  feePerPeriod: number = 0
): InstallmentPreviewRow[] {
  const rows: InstallmentPreviewRow[] = [];
  
  // 计算每期本金（精确到分）
  const basePrincipal = Math.floor((totalAmount / totalPeriods) * 100) / 100;
  const remainder = Math.round((totalAmount - basePrincipal * totalPeriods) * 100) / 100;
  
  for (let i = 1; i <= totalPeriods; i++) {
    let principal: number;
    
    if (i < totalPeriods) {
      // 前 n-1 期使用平均金额
      principal = basePrincipal;
    } else {
      // 最后一期用余额兜底（处理尾差）
      principal = Math.round((totalAmount - basePrincipal * (totalPeriods - 1)) * 100) / 100;
    }
    
    const fee = feePerPeriod;
    const total = Math.round((principal + fee) * 100) / 100;
    
    rows.push({
      period: i,
      principal: Math.round(principal * 100) / 100,
      fee: Math.round(fee * 100) / 100,
      total: Math.round(total * 100) / 100,
    });
  }
  
  return rows;
}

export default function InstallmentPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [firstBillingDate, setFirstBillingDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [isInterestFree, setIsInterestFree] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');
        const { accounts: accs, categories: cats, tags: tgs } = await import('./transactionFormSupport').then(m => m.loadTransactionFormData(bookId));
        setAccounts(accs);
        setCategories(cats);
        setTags(tgs);
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
      }
    };
    loadData();
  }, []);

  const creditAccounts = useMemo(
    () => accounts.filter((account) => ['credit_card', 'credit_line'].includes(account.account_type)),
    [accounts],
  );

  const installmentCategories = useMemo(
    () => categories.filter((c) => c.category_type === 'expense' || c.category_type === 'income_expense'),
    [categories],
  );

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const bookId = await getDefaultBookId();
      if (!bookId) throw new Error('无法获取账本信息');

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
        start_date: firstBillingDate,
        repayment_day: repaymentDay,
        plan_name: merchant,
        tags: tagIds,
      });

      navigate('/installments');
    } catch (err) {
      setError((err as Error).message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TransactionFormLayout pageTitle="信用卡分期购物">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className={transactionFormSectionClass}>
          {/* 支出项目 - 分类 */}
          <div>
            <label className={transactionFormLabelClass}>支出项目 *</label>
            <CategorySelector
              categories={categories as any}
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
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={transactionFormFieldClass} required>
              <option value="">选择信用卡/信用账户</option>
              {creditAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>

          {/* 分期申请日期 */}
          <div>
            <label className={transactionFormLabelClass}>分期申请日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={transactionFormFieldClass} required />
          </div>

          {/* 首次入账日期 */}
          <div>
            <label className={transactionFormLabelClass}>首次入账日期</label>
            <input type="date" value={firstBillingDate} onChange={(e) => setFirstBillingDate(e.target.value)} className={transactionFormFieldClass} required />
          </div>

          {/* 分期的总期数 */}
          <div>
            <label className={transactionFormLabelClass}>分期期数 *</label>
            <select value={periods} onChange={(e) => setPeriods(Number(e.target.value))} className={transactionFormFieldClass}>
              {[3, 6, 9, 12, 18, 24, 36].map((p) => <option key={p} value={p}>{p} 期</option>)}
            </select>
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
                <span className="text-sm text-slate-600">免息/免手续费</span>
              </label>
            </div>
            {!isInterestFree && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={feePerPeriod}
                onChange={(e) => setFeePerPeriod(e.target.value)}
                placeholder="每期手续费金额"
                className={`${transactionFormFieldClass} mt-2`}
              />
            )}
          </div>

          {/* 标签 */}
          <div>
            <label className={transactionFormLabelClass}>标签</label>
            <TagMultiSelect allTags={tags.map(t => ({ ...t, id: t.id, name: t.name, parent_id: t.parent_id }))} value={tagIds} onChange={setTagIds} />
          </div>

          {/* 备注 */}
          <div>
            <label className={transactionFormLabelClass}>备注</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="添加备注..." rows={3} className={transactionFormTextareaClass} />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/installments')} className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            返回
          </button>
          <button 
            type="button" 
            onClick={() => setShowPreview(true)}
            disabled={!amount || !accountId}
            className="flex-1 rounded-xl border border-blue-300 bg-blue-50 py-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            预览
          </button>
          <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? '保存中...' : '确认提交'}
          </button>
        </div>
      </form>

      {/* 预览弹窗 */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">分期计划预览</h3>
            
            {/* 汇总信息 */}
            <div className="mb-4 rounded-xl bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">分期总金额</span>
                  <p className="text-lg font-semibold text-slate-800">¥{parseFloat(amount || '0').toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-slate-500">分期期数</span>
                  <p className="text-lg font-semibold text-slate-800">{periods} 期</p>
                </div>
                <div>
                  <span className="text-slate-500">每期手续费</span>
                  <p className="text-lg font-semibold text-slate-800">¥{isInterestFree ? '0.00' : (parseFloat(feePerPeriod || '0')).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-slate-500">总手续费</span>
                  <p className="text-lg font-semibold text-slate-800">¥{totalFee.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* 还款计划表 */}
            <div className="mb-4 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">期数</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">本金</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">手续费</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {previewPlan.map((row) => (
                    <tr key={row.period} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">第 {row.period} 期</td>
                      <td className="px-3 py-2 text-right text-slate-600">¥{row.principal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">¥{row.fee.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">¥{row.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 尾差说明 */}
            <div className="mb-4 text-xs text-slate-500">
              {parseFloat(amount) % periods !== 0 && (
                <p>💡 由于金额无法整除，最后一期已自动调整以处理尾差。</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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