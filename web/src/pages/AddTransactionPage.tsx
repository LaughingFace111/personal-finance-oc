import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';

interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
}

interface Category {
  id: number;
  name: string;
  type: string;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

const mockAccounts: Account[] = [
  { id: 1, name: '现金', type: 'fund', balance: 5000 },
  { id: 2, name: '招商银行', type: 'fund', balance: 20000 },
  { id: 3, name: '支付宝', type: 'fund', balance: 10000 },
  { id: 4, name: '信用卡', type: 'credit', balance: -3000 },
];

const mockCategories: Category[] = [
  { id: 1, name: '工资', type: 'income' },
  { id: 2, name: '奖金', type: 'income' },
  { id: 3, name: '餐饮', type: 'expense' },
  { id: 4, name: '交通', type: 'expense' },
  { id: 5, name: '购物', type: 'expense' },
  { id: 6, name: '娱乐', type: 'expense' },
];

const mockTags: Tag[] = [
  { id: 1, name: '西双版纳自驾游', color: '#10b981' },
  { id: 2, name: '电脑硬件升级', color: '#3b82f6' },
  { id: 3, name: '帕萨特专项', color: '#f59e0b' },
];

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const [direction, setDirection] = useState<'income' | 'expense'>('expense');
  const [accountId, setAccountId] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredCategories = mockCategories.filter(c => c.type === direction);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!accountId || !categoryId || !amount) {
      setError('请填写必填字段');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: Number(accountId),
          categoryId: Number(categoryId),
          amount: parseFloat(amount),
          direction,
          memo,
          happenedAt: date,
          tagIds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '创建失败');
      }

      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
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
            <label className="mb-1 block text-sm font-medium text-gray-700">账户</label>
            <select
              value={accountId}
              onChange={e => setAccountId(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择账户</option>
              {mockAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} (余额: {account.balance})
                </option>
              ))}
            </select>
          </div>

          {/* 类别选择 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">类别</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择类别</option>
              {filteredCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* 金额 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">金额</label>
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
              required
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
            <TagMultiSelect allTags={mockTags} value={tagIds} onChange={setTagIds} />
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
