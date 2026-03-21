import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
import { apiGet, apiPost } from '../services/api';

interface Account {
  id: string;
  name: string;
  account_type: string;
  current_balance: number;
}

interface Tag {
  id: string;
  name: string;
}

export default function TransferPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
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

  // 加载账户和标签数据
  useEffect(() => {
    const loadData = async () => {
      const bookId = await getBookId();
      if (!bookId) return;
      
      try {
        const [accountsData, tagsData] = await Promise.all([
          apiGet(`/api/accounts?book_id=${bookId}`),
          apiGet(`/api/tags?book_id=${bookId}`)
        ]);
        setAccounts(accountsData || []);
        setTags(tagsData || []);
      } catch (e) {
        console.error('加载数据失败', e);
      }
    };
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!fromAccountId || !toAccountId || !amount) {
      setError('请填写必填字段');
      return;
    }

    if (fromAccountId === toAccountId) {
      setError('转出账户和转入账户不能相同');
      return;
    }

    setLoading(true);
    try {
      const bookId = await getBookId();
      if (!bookId) {
        throw new Error('无法获取账本信息');
      }

      const payload = {
        transaction_type: 'transfer',
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: parseFloat(amount),
        note: memo,
        occurred_at: new Date(date).toISOString(),
        book_id: bookId,
        tags: tagIds.length > 0 ? JSON.stringify(tagIds) : null
      };

      const response = await apiPost('/api/transactions/transfer', payload);

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
        <h1 className="mb-6 text-xl font-bold text-gray-800">转账</h1>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow">
          {/* 转出账户 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">转出账户 *</label>
            <select
              value={fromAccountId}
              onChange={e => setFromAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择转出账户</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} (余额: ¥{account.current_balance})
                </option>
              ))}
            </select>
          </div>

          {/* 转入账户 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">转入账户 *</label>
            <select
              value={toAccountId}
              onChange={e => setToAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择转入账户</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* 转账金额 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">转账金额 *</label>
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
            className={`w-full rounded-lg py-2.5 text-sm font-medium text-white transition bg-blue-500 hover:bg-blue-600 ${loading ? 'opacity-50' : ''}`}
          >
            {loading ? '保存中...' : '确认转账'}
          </button>
        </form>
      </div>
    </div>
  );
}
