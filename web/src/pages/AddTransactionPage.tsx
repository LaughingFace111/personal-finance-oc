import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HierarchyPickerModal } from '../components/HierarchyPickerModal';
import { TagMultiSelect } from '../components/TagMultiSelect';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
  transactionFormToggleClass,
} from '../components/TransactionFormLayout';
import { apiPost } from '../services/api';
import {
  AccountOption,
  CategoryOption,
  TagOption,
  getAccountOptionLabel,
  getCategoryLabel,
  getDefaultBookId,
  loadTransactionFormData,
  toOccurredAt,
} from './transactionFormSupport';

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'income' ? 'income' : 'expense';
  
  const [direction, setDirection] = useState<'income' | 'expense'>(initialType);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  
  const [accountId, setAccountId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');

        setBookId(bookId);
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

  const filteredCategories = useMemo(
    () =>
      categories.filter(c => {
        if (direction === 'income') {
          return c.category_type === 'income' || c.category_type === 'income_expense';
        }
        return c.category_type === 'expense' || c.category_type === 'income_expense';
      }),
    [categories, direction],
  );

  useEffect(() => {
    if (!categoryId) return;
    const stillAvailable = filteredCategories.some((item) => item.id === categoryId);
    if (!stillAvailable) {
      setCategoryId('');
    }
  }, [categoryId, filteredCategories]);

  const selectedCategoryLabel = categoryId ? getCategoryLabel(categories, categoryId) : '';
  const selectedTagLabels = useMemo(
    () =>
      tagIds
        .map((id) => {
          const tag = tags.find((item) => item.id === id);
          if (!tag) return '';
          if (!tag.parent_id) return tag.name;
          const parent = tags.find((item) => item.id === tag.parent_id);
          return parent ? `${parent.name} / ${tag.name}` : tag.name;
        })
        .filter(Boolean),
    [tagIds, tags],
  );

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
        include_in_expense: true,
        include_in_income: true,
        include_in_cashflow: true,
        // 🛡️ L: 标签持久化 - 传递标签名数组（与编辑页保持一致）
        tags: tagIds.length > 0
          ? JSON.stringify(tagIds.map(id => {
              const tag = tags.find((item: any) => item.id === id)
              return tag?.name || ''
            }).filter(Boolean))
          : null
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
        <div
          className="rounded-2xl p-1"
          style={{ background: 'var(--bg-elevated)' }}
        >
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
                  {getAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>类别 *</label>
            <button
              type="button"
              onClick={() => setCategoryModalOpen(true)}
              className={transactionFormFieldClass}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
              }}
            >
              <span style={{ color: selectedCategoryLabel ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {selectedCategoryLabel || '点击选择类别'}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>›</span>
            </button>
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
                      color: 'var(--text-primary)',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {error && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: 'rgba(255, 77, 79, 0.35)',
              background: 'rgba(255, 77, 79, 0.08)',
              color: '#ff7875',
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 rounded-xl border py-3 text-sm font-semibold transition"
            style={{
              borderColor: 'var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: 'var(--accent-color)' }}
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>

      <HierarchyPickerModal
        open={categoryModalOpen}
        title="选择类别"
        items={filteredCategories}
        value={categoryId}
        emptyText="暂无可选类别"
        bookId={bookId}
        enableCreate={Boolean(bookId)}
        createButtonText="[+ 新建分类]"
        onItemsUpdated={(nextItems) =>
          setCategories((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            (nextItems as CategoryOption[]).forEach((item) => merged.set(item.id, item));
            return Array.from(merged.values());
          })
        }
        onCancel={() => setCategoryModalOpen(false)}
        onConfirm={(nextValue) => {
          setCategoryId(typeof nextValue === 'string' ? nextValue : '');
          setCategoryModalOpen(false);
        }}
      />
    </TransactionFormLayout>
  );
}
