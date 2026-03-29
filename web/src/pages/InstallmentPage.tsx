import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
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

export default function InstallmentPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [periods, setPeriods] = useState(12);
  const [feePerPeriod, setFeePerPeriod] = useState('');
  const [repaymentDay, setRepaymentDay] = useState(15);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);

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
        fee_per_period: feePerPeriod ? parseFloat(feePerPeriod) : 0,
        start_date: date,
        repayment_day: repaymentDay,
        plan_name: merchant,
      });

      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TransactionFormLayout pageTitle="分期消费">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className={transactionFormSectionClass}>
          <div>
            <label className={transactionFormLabelClass}>分期账户 *</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={transactionFormFieldClass} required>
              <option value="">选择信用卡/信用账户</option>
              {creditAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>商户 *</label>
            <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="如：苹果官网、京东" className={transactionFormFieldClass} required />
          </div>

          <div>
            <label className={transactionFormLabelClass}>分类</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={transactionFormFieldClass}>
              <option value="">选择分类</option>
              {installmentCategories.map((category) => (
                <option key={category.id} value={category.id}>{getCategoryLabel(categories, category.id)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>总金额 *</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={transactionFormFieldClass} required />
          </div>

          <div>
            <label className={transactionFormLabelClass}>分期期数 *</label>
            <select value={periods} onChange={(e) => setPeriods(Number(e.target.value))} className={transactionFormFieldClass}>
              {[3, 6, 9, 12, 18, 24, 36].map((p) => <option key={p} value={p}>{p} 期</option>)}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>每期手续费</label>
            <input type="number" step="0.01" min="0" value={feePerPeriod} onChange={(e) => setFeePerPeriod(e.target.value)} placeholder="0.00" className={transactionFormFieldClass} />
          </div>

          <div>
            <label className={transactionFormLabelClass}>每月还款日</label>
            <select value={repaymentDay} onChange={(e) => setRepaymentDay(Number(e.target.value))} className={transactionFormFieldClass}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d} 日</option>)}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={transactionFormFieldClass} required />
          </div>

          <div>
            <label className={transactionFormLabelClass}>备注</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="添加备注..." rows={3} className={transactionFormTextareaClass} />
          </div>

          <div>
            <label className={transactionFormLabelClass}>标签</label>
            <TagMultiSelect allTags={tags.map(t => ({ ...t, id: t.id, name: t.name, parent_id: t.parent_id }))} value={tagIds} onChange={setTagIds} />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate('/other')} className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            返回
          </button>
          <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </TransactionFormLayout>
  );
}