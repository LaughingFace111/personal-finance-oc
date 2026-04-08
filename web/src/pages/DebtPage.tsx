import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HierarchyPickerModal } from '../components/HierarchyPickerModal';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
} from '../components/TransactionFormLayout';
import { apiPost } from '../services/api';
import { AccountOption, TagOption, getDefaultBookId } from './transactionFormSupport';

interface DebtPageProps {
  type: 'lend' | 'borrow';
}

export default function DebtPage({ type }: DebtPageProps) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accountId, setAccountId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState('');
  const [reason, setReason] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');
        const { accounts: accs, tags: tgs } = await import('./transactionFormSupport').then(m => m.loadTransactionFormData(bookId));
        setAccounts(accs);
        setTags(tgs);
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
      }
    };
    loadData();
  }, []);

  const assetAccounts = accounts.filter((account) => ['cash', 'debit_card', 'ewallet', 'virtual'].includes(account.account_type));
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

  const title = type === 'lend' ? '借出登记' : '借入登记';
  const direction = type === 'lend' ? 'out' : 'in'  // 借出=money out, 借入=money in;
  const transactionType = type === 'lend' ? 'debt_lend' : 'debt_borrow';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const bookId = await getDefaultBookId();
      if (!bookId) throw new Error('无法获取账本信息');

      await apiPost('/api/transactions', {
        occurred_at: new Date(date).toISOString(),
        book_id: bookId,
        account_id: accountId,
        transaction_type: transactionType,
        direction,
        amount: parseFloat(loanAmount),
        note: memo || null,
        tags: tagIds.length > 0 ? JSON.stringify(tagIds) : null,
        extra: JSON.stringify({
          counterparty,
          repayment_date: repaymentDate,
          reason: reason || null,
        }),
      });

      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TransactionFormLayout pageTitle={title}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className={transactionFormSectionClass}>
          <div>
            <label className={transactionFormLabelClass}>资金账户 *</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={transactionFormFieldClass} required>
              <option value="">选择资产账户</option>
              {assetAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} (余额: ¥{account.current_balance})</option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>{type === 'lend' ? '借款人' : '出借方'} *</label>
            <input type="text" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={type === 'lend' ? '请输入借款人姓名' : '请输入出借方姓名'} className={transactionFormFieldClass} required />
          </div>

          <div>
            <label className={transactionFormLabelClass}>金额 *</label>
            <input type="number" step="0.01" min="0" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="0.00" className={transactionFormFieldClass} required />
          </div>

          <div>
            <label className={transactionFormLabelClass}>约定还款日 *</label>
            <input type="date" value={repaymentDate} onChange={(e) => setRepaymentDate(e.target.value)} className={transactionFormFieldClass} required />
          </div>

          <div>
            <label className={transactionFormLabelClass}>原因</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="可选，记录借款原因" className={transactionFormFieldClass} />
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
            <button
              type="button"
              onClick={() => setTagModalOpen(true)}
              className={`${transactionFormFieldClass} h-auto min-h-11 py-3`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  color:
                    selectedTagLabels.length > 0
                      ? 'var(--text-primary)'
                      : 'var(--text-tertiary)',
                }}
              >
                {selectedTagLabels.length > 0
                  ? selectedTagLabels.map((label) => (
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
                    ))
                  : '点击选择标签'}
              </span>
              <span style={{ color: 'var(--text-tertiary)', lineHeight: '28px' }}>›</span>
            </button>
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

      <HierarchyPickerModal
        open={tagModalOpen}
        title="选择标签"
        items={tags}
        value={tagIds}
        multiple
        emptyText="暂无可选标签"
        onCancel={() => setTagModalOpen(false)}
        onConfirm={(nextValue) => {
          setTagIds(Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : []);
          setTagModalOpen(false);
        }}
      />
    </TransactionFormLayout>
  );
}
