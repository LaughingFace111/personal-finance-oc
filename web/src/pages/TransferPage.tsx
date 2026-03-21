import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';

interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
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
  { id: 4, name: '建设银行', type: 'fund', balance: 15000 },
];

const mockTags: Tag[] = [
  { id: 1, name: '西双版纳自驾游', color: '#10b981' },
  { id: 2, name: '电脑硬件升级', color: '#3b82f6' },
  { id: 3, name: '帕萨特专项', color: '#f59e0b' },
];

export default function TransferPage() {
  const navigate = useNavigate();
  const [fromAccountId, setFromAccountId] = useState<number>(0);
  const [toAccountId, setToAccountId] = useState<number>(0);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const response = await fetch('/api/transactions/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: Number(fromAccountId),
          toAccountId: Number(toAccountId),
          amount: parseFloat(amount),
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
        <h1 className="mb-6 text-xl font-semibold text-gray-800">转账</h1>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow">
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

          {/* 转出账户 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">转出账户</label>
            <select
              value={fromAccountId}
              onChange={e => setFromAccountId(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择转出账户</option>
              {mockAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} (余额: {account.balance})
                </option>
              ))}
            </select>
          </div>

          {/* 转入账户 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">转入账户</label>
            <select
              value={toAccountId}
              onChange={e => setToAccountId(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              required
            >
              <option value="">选择转入账户</option>
              {mockAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} (余额: {account.balance})
                </option>
              ))}
            </select>
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
            className={`w-full rounded-lg bg-blue-500 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 ${
              loading ? 'opacity-50' : ''
            }`}
          >
            {loading ? '保存中...' : '保存转账'}
          </button>
        </form>
      </div>
    </div>
  );
}
