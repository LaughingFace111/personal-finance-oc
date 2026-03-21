import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';

type SubType = 'installment' | 'lend' | 'borrow';

interface Tag {
  id: number;
  name: string;
  color: string;
}

const mockTags: Tag[] = [
  { id: 1, name: '西双版纳自驾游', color: '#10b981' },
  { id: 2, name: '电脑硬件升级', color: '#3b82f6' },
  { id: 3, name: '帕萨特专项', color: '#f59e0b' },
];

export default function OtherTransactionPage() {
  const navigate = useNavigate();
  const [subType, setSubType] = useState<SubType>('installment');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 分期付款字段
  const [amount, setAmount] = useState('');
  const [periods, setPeriods] = useState(12);
  const [dueDay, setDueDay] = useState(15);
  const [interestRate, setInterestRate] = useState(0);

  // 借出/借入字段
  const [counterparty, setCounterparty] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState('');
  const [reason, setReason] = useState('');
  
  // 通用字段
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<number[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (subType === 'installment') {
        if (!amount || periods < 1) {
          throw new Error('请填写必填字段');
        }
        const response = await fetch('/api/credit/installments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(amount),
            feeRate: interestRate / 100,
            periods: parseInt(String(periods)),
            dueDay: parseInt(String(dueDay)),
            memo,
            happenedAt: date,
            tagIds,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || '创建失败');
        }
      } else if (subType === 'lend') {
        if (!counterparty || !loanAmount || !repaymentDate) {
          throw new Error('请填写必填字段');
        }
        const response = await fetch('/api/loans/lend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            counterparty,
            amount: parseFloat(loanAmount),
            repaymentDate,
            reason,
            memo,
            happenedAt: date,
            tagIds,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || '创建失败');
        }
      } else if (subType === 'borrow') {
        if (!counterparty || !loanAmount || !repaymentDate) {
          throw new Error('请填写必填字段');
        }
        const response = await fetch('/api/loans/borrow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            counterparty,
            amount: parseFloat(loanAmount),
            repaymentDate,
            reason,
            memo,
            happenedAt: date,
            tagIds,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || '创建失败');
        }
      }

      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const renderSubTypeForm = () => {
    switch (subType) {
      case 'installment':
        return (
          <>
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">分期数</label>
              <select
                value={periods}
                onChange={e => setPeriods(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              >
                <option value={3}>3期</option>
                <option value={6}>6期</option>
                <option value={9}>9期</option>
                <option value={12}>12期</option>
                <option value={18}>18期</option>
                <option value={24}>24期</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">每期还款日</label>
              <select
                value={dueDay}
                onChange={e => setDueDay(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              >
                {[...Array(28)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}日
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">手续费率 (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              />
            </div>
          </>
        );
      case 'lend':
      case 'borrow':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {subType === 'lend' ? '借款人' : '借出方'}
              </label>
              <input
                type="text"
                value={counterparty}
                onChange={e => setCounterparty(e.target.value)}
                placeholder={subType === 'lend' ? '请输入借款人姓名' : '请输入借出方姓名'}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">金额</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={loanAmount}
                onChange={e => setLoanAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">约定还款日</label>
              <input
                type="date"
                value={repaymentDate}
                onChange={e => setRepaymentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">理由</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="借款理由"
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm"
              />
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">其他交易</h1>

        {/* 子类型切换 */}
        <div className="mb-4 flex rounded-lg bg-white p-1 shadow">
          <button
            type="button"
            onClick={() => setSubType('installment')}
            className={`flex-1 rounded-md py-2 text-xs font-medium transition ${
              subType === 'installment'
                ? 'bg-indigo-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            分期付款
          </button>
          <button
            type="button"
            onClick={() => setSubType('lend')}
            className={`flex-1 rounded-md py-2 text-xs font-medium transition ${
              subType === 'lend'
                ? 'bg-orange-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            借出
          </button>
          <button
            type="button"
            onClick={() => setSubType('borrow')}
            className={`flex-1 rounded-md py-2 text-xs font-medium transition ${
              subType === 'borrow'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            借入
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-4 shadow">
          {renderSubTypeForm()}

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
            className={`w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-600 ${
              loading ? 'opacity-50' : ''
            }`}
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>
      </div>
    </div>
  );
}
