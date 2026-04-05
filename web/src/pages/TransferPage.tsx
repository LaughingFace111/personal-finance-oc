import { useState, useEffect } from 'react';
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
  TagOption,
  getDefaultBookId,
  getAccountOptionLabel,
  loadTransferFormData,
  toOccurredAt,
  toTagOptions,
} from './transactionFormSupport';

function getCurrentDateTimeLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function TransferPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('0');
  const [feeAccountId, setFeeAccountId] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(getCurrentDateTimeLocal);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const feeValue = Number.parseFloat(feeAmount || '0');
  const normalizedFeeValue = Number.isFinite(feeValue) ? feeValue : 0;
  const shouldShowFeeAccount = normalizedFeeValue > 0;
  const feeEligibleAccounts = accounts.filter((account) =>
    ['cash', 'debit_card', 'ewallet', 'virtual'].includes(account.account_type)
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');

        const formData = await loadTransferFormData(bookId);
        setAccounts(formData.accounts);
        setTags(formData.tags);
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
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

    if (shouldShowFeeAccount && !feeAccountId) {
      setError('请输入手续费扣款账户');
      return;
    }

    setLoading(true);
    try {
      const bookId = await getDefaultBookId();
      if (!bookId) {
        throw new Error('无法获取账本信息');
      }

      const payload = {
        transaction_type: 'transfer',
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: parseFloat(amount),
        fee_amount: normalizedFeeValue,
        fee_account_id: shouldShowFeeAccount ? feeAccountId : null,
        note: memo,
        occurred_at: toOccurredAt(date),
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
    <TransactionFormLayout
      pageTitle="转账"
      showBackButton={true}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className={transactionFormSectionClass}>
          <div>
            <label className={transactionFormLabelClass}>转出账户 *</label>
            <select
              value={fromAccountId}
              onChange={e => setFromAccountId(e.target.value)}
              className={transactionFormFieldClass}
              required
            >
                <option value="">选择转出账户</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {getAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>转入账户 *</label>
            <select
              value={toAccountId}
              onChange={e => setToAccountId(e.target.value)}
              className={transactionFormFieldClass}
              required
            >
                <option value="">选择转入账户</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {getAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={transactionFormLabelClass}>转账金额 *</label>
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
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={transactionFormFieldClass}
            />
          </div>

          <div>
            <label className={transactionFormLabelClass}>手续费</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={feeAmount}
              onChange={e => setFeeAmount(e.target.value)}
              placeholder="0.00"
              className={transactionFormFieldClass}
            />
          </div>

          {shouldShowFeeAccount && (
            <div>
              <label className={transactionFormLabelClass}>手续费扣款账户 *</label>
              <select
                value={feeAccountId}
                onChange={e => setFeeAccountId(e.target.value)}
                className={transactionFormFieldClass}
                required={shouldShowFeeAccount}
              >
                <option value="">选择手续费扣款账户</option>
                {feeEligibleAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {getAccountOptionLabel(account)}
                  </option>
                ))}
              </select>
            </div>
          )}

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
            {loading ? '保存中...' : '确认转账'}
          </button>
        </div>
      </form>
    </TransactionFormLayout>
  );
}
