import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormPrimaryButtonClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
  transactionFormToggleClass,
} from '../components/TransactionFormLayout';
import { apiPost } from '../services/api';
import {
  AccountOption,
  CategoryOption,
  TagOption,
  getCategoryLabel,
  getDefaultBookId,
  loadTransactionFormData,
  toOccurredAt,
  toTagOptions,
} from './transactionFormSupport';

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'income' ? 'income' : 'expense';
  
  const [direction, setDirection] = useState<'income' | 'expense'>(initialType);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  
  const [accountId, setAccountId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');

        const formData = await loadTransactionFormData(bookId);
        setAccounts(formData.accounts);
        setCategories(formData.categories);
        setTags(formData.tags);
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
      }
    };
    loadData();
  }, []);

  // 根据当前类型过滤分类
  const filteredCategories = categories.filter(c => {
    if (direction === 'income') {
      return c.category_type === 'income' || c.category_type === 'income_expense';
    }
    return c.category_type === 'expense' || c.category_type === 'income_expense';
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!accountId || !categoryId || !amount) {
      setError('请填写必填字段');
      return;
    }

    setLoading(true);
    try {
      const bookId = await getDefaultBookId();
      if (!bookId) {
        throw new Error('无法获取账本信息');
      }

      const payload = {
        transaction_type: direction === 'income' ? 'income' : 'expense',
        direction: direction === 'income' ? 'in' : 'out',
        amount: parseFloat(amount),
        account_id: accountId,
        category_id: categoryId,
        note: memo,
        occurred_at: toOccurredAt(date),
        book_id: bookId,
        tags: tagIds.length > 0 ? JSON.stringify(tagIds) : null
      };

      const response = await apiPost('/api/transactions', payload);

      if (response) {
        navigate('/dashboard');
      } else {
        throw new Error('创建失败');
      }
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TransactionFormLayout
      pageTitle="收入/支出"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl bg-slate-100 p-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('income')}
              className={transactionFormToggleClass(direction === 'income')}
            >
              收入
            </button>
            <button
              type="button"
              onClick={() => setDirection('expense')}
              className={transactionFormToggleClass(direction === 'expense')}
            >
              支出
            </button>
          </div>
        </div>

        <div className={transactionFormSectionClass}>
          <div>
            <label className={transactionFormLabelClass}>账户 *</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className={transactionFormFieldClass}
              required
            >
              <option value="">选择账户</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} (余额: ¥{account.current_balance})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>类别 *</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className={transactionFormFieldClass}
              required
            >
              <option value="">选择类别</option>
              {filteredCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {getCategoryLabel(categories, category.id)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>金额 *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={transactionFormFieldClass}
              required
            />
          </div>

          <div>
            <label className={transactionFormLabelClass}>日期</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={transactionFormFieldClass}
            />
          </div>

          <div>
            <label className={transactionFormLabelClass}>备注</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="添加备注..."
              rows={3}
              className={transactionFormTextareaClass}
            />
          </div>

          <div>
            <label className={transactionFormLabelClass}>标签</label>
            <TagMultiSelect
              allTags={toTagOptions(tags)}
              value={tagIds}
              onChange={setTagIds}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </TransactionFormLayout>
  );
}
