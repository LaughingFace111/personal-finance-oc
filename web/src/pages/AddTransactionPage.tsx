import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
import { apiGet, apiPost } from '../services/api';

interface Account {
  id: string;
  name: string;
  account_type: string;
  current_balance: number;
}

interface Category {
  id: string;
  name: string;
  category_type: string;
  parent_id?: string;
}

interface Tag {
  id: string;
  name: string;
}

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'income' ? 'income' : 'expense';
  
  const [direction, setDirection] = useState<'income' | 'expense'>(initialType);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  
  const [accountId, setAccountId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 获取用户默认账本ID
  const getBookId = async () => {
    try {
      const sessionRes = await fetch('/api/auth/me');
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        return session.default_book_id;
      }
    } catch {}
    return null;
  };

  // 加载账户、分类、标签数据
  useEffect(() => {
    const loadData = async () => {
      const bookId = await getBookId();
      if (!bookId) return;
      
      try {
        const [accountsData, categoriesData, tagsData] = await Promise.all([
          apiGet(`/api/accounts?book_id=${bookId}`),
          apiGet(`/api/categories?book_id=${bookId}`),
          apiGet(`/api/tags?book_id=${bookId}`)
        ]);
        setAccounts(accountsData || []);
        setCategories(categoriesData || []);
        setTags(tagsData || []);
      } catch (e) {
        console.error('加载数据失败', e);
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

  // 获取分类名称（支持二级分类）
  const getCategoryName = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return '';
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id);
      return parent ? `${parent.name}-${cat.name}` : cat.name;
    }
    return cat.name;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!accountId || !categoryId || !amount) {
      setError('请填写必填字段');
      return;
    }

    setLoading(true);
    try {
      const bookId = await getBookId();
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
        occurred_at: new Date(date).toISOString(),
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
    <div className="min-h-screen bg-gray-50 p-4">
      {/* 返回按钮 */}
      <div className="mb-4 flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600"
        >
          <span className="text-xl">←</span>
          <span className="ml-1">返回</span>
        </button>
      </div>

      <div className="mx-auto max-w-md">
        {/* 顶部切换 */}
        <div className="mb-6 flex rounded-lg bg-white p-1 shadow">
          <button
            type="button"
            onClick={() => setDirection('income')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              direction === 'income'
                ? 'bg-green-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            收入
          </button>
          <button
            type="button"
            onClick={() => setDirection('expense')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              direction === 'expense'
                ? 'bg-red-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            支出
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow">
          {/* 账户选择 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">账户 *</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
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

          {/* 类别选择 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">类别 *</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择类别</option>
              {filteredCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {getCategoryName(category.id)}
                </option>
              ))}
            </select>
          </div>

          {/* 金额 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">金额 *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            />
          </div>

          {/* 日期 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">日期</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="添加备注..."
              rows={2}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
            />
          </div>

          {/* 标签 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">标签</label>
            <TagMultiSelect 
              allTags={tags.map(t => ({ id: t.id, name: t.name, color: '#3b82f6' }))} 
              value={tagIds} 
              onChange={setTagIds} 
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg py-2.5 text-sm font-medium text-white transition ${
              direction === 'income'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-red-500 hover:bg-red-600'
            } ${loading ? 'opacity-50' : ''}`}
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>
      </div>
    </div>
  );
}
