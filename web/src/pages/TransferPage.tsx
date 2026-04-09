import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormPrimaryButtonClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
} from '../components/TransactionFormLayout';
import { apiPost, apiPut } from '../services/api';
import {
  AccountOption,
  getAccountOptionLabel,
  getDefaultBookId,
  loadTransferFormData,
  TagOption,
  toDateInputValue,
  toOccurredAt,
  TransferFormInitialValues,
} from './transactionFormSupport';

function getCurrentDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

interface TransferPageProps {
  initialValues?: TransferFormInitialValues;
  isEditMode?: boolean;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TransferPage({
  initialValues,
  isEditMode = false,
  embedded = false,
  onSuccess,
  onCancel,
}: TransferPageProps) {
  const navigate = useNavigate();
  const [bookId, setBookId] = useState('');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [fromAccountId, setFromAccountId] = useState<string>(initialValues?.fromAccountId ?? '');
  const [toAccountId, setToAccountId] = useState<string>(initialValues?.toAccountId ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [feeAmount, setFeeAmount] = useState(initialValues?.feeAmount ?? '0');
  const [feeAccountId, setFeeAccountId] = useState<string>(initialValues?.feeAccountId ?? '');
  const [memo, setMemo] = useState(initialValues?.memo ?? '');
  const [tagIds, setTagIds] = useState<string[]>(initialValues?.tagIds ?? []);
  const [occurredAt, setOccurredAt] = useState(
    initialValues?.occurredAt ? toDateInputValue(initialValues.occurredAt) : getCurrentDateValue(),
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean((initialValues?.feeAmount && initialValues.feeAmount !== '0') || initialValues?.memo || initialValues?.tagIds?.length),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const feeValue = Number.parseFloat(feeAmount || '0');
  const normalizedFeeValue = Number.isFinite(feeValue) ? feeValue : 0;
  const shouldShowFeeAccount = normalizedFeeValue > 0;
  const feeEligibleAccounts = useMemo(
    () =>
      accounts.filter((account) =>
        ['cash', 'debit_card', 'ewallet', 'virtual'].includes(account.account_type),
      ),
    [accounts],
  );
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

  useEffect(() => {
    setFromAccountId(initialValues?.fromAccountId ?? '');
    setToAccountId(initialValues?.toAccountId ?? '');
    setAmount(initialValues?.amount ?? '');
    setFeeAmount(initialValues?.feeAmount ?? '0');
    setFeeAccountId(initialValues?.feeAccountId ?? '');
    setMemo(initialValues?.memo ?? '');
    setTagIds(initialValues?.tagIds ?? []);
    setOccurredAt(initialValues?.occurredAt ? toDateInputValue(initialValues.occurredAt) : getCurrentDateValue());
  }, [initialValues]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const resolvedBookId = await getDefaultBookId();
        if (!resolvedBookId) throw new Error('无法获取账本信息');
        setBookId(resolvedBookId);

        const formData = await loadTransferFormData(resolvedBookId);
        setAccounts(formData.accounts);
        setTags(formData.tags);
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (
      fromAccountId &&
      feeEligibleAccounts.some((account) => account.id === fromAccountId) &&
      (!feeAccountId || feeAccountId === '')
    ) {
      setFeeAccountId(fromAccountId);
    }
  }, [feeEligibleAccounts, fromAccountId, feeAccountId]);

  useEffect(() => {
    if (
      shouldShowFeeAccount &&
      fromAccountId &&
      feeEligibleAccounts.some((account) => account.id === fromAccountId) &&
      !feeAccountId
    ) {
      setFeeAccountId(fromAccountId);
    }
  }, [shouldShowFeeAccount, feeEligibleAccounts, fromAccountId, feeAccountId]);

  useEffect(() => {
    if (feeAccountId && !feeEligibleAccounts.some((account) => account.id === feeAccountId)) {
      setFeeAccountId('');
    }
  }, [feeAccountId, feeEligibleAccounts]);

  useEffect(() => {
    if (shouldShowFeeAccount || memo.trim() || tagIds.length > 0) {
      setAdvancedOpen(true);
    }
  }, [shouldShowFeeAccount, memo, tagIds.length]);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    navigate(-1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fromAccountId || !toAccountId || !amount || !occurredAt) {
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
      const resolvedBookId = bookId || (await getDefaultBookId());
      if (!resolvedBookId) {
        throw new Error('无法获取账本信息');
      }

      const payload = {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: parseFloat(amount),
        fee_amount: normalizedFeeValue,
        fee_account_id: shouldShowFeeAccount ? feeAccountId : null,
        note: memo || null,
        occurred_at: toOccurredAt(occurredAt),
        tags:
          tagIds.length > 0
            ? JSON.stringify(
                tagIds
                  .map((id) => {
                    const tag = tags.find((item) => item.id === id);
                    return tag?.name || '';
                  })
                  .filter(Boolean),
              )
            : null,
      };

      if (isEditMode) {
        if (!initialValues?.transactionId) {
          throw new Error('缺少转账记录ID');
        }
        await apiPut(`/api/transactions/transfer/${initialValues.transactionId}?book_id=${resolvedBookId}`, payload);
      } else {
        await apiPost(`/api/transactions/transfer?book_id=${resolvedBookId}`, payload);
      }

      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || (isEditMode ? '更新失败' : '创建失败'));
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className={transactionFormSectionClass}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={transactionFormLabelClass}>转出账户 *</label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className={transactionFormFieldClass}
              required
            >
              <option value="">选择转出账户</option>
              {accounts.map((account) => (
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
              onChange={(e) => setToAccountId(e.target.value)}
              className={transactionFormFieldClass}
              required
            >
              <option value="">选择转入账户</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {getAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={transactionFormLabelClass}>转账金额 *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={transactionFormFieldClass}
            required
          />
        </div>

        <div>
          <label className={transactionFormLabelClass}>日期 *</label>
          <input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={transactionFormFieldClass}
            required
          />
        </div>
      </div>

      <details
        className={transactionFormSectionClass}
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none text-sm font-medium text-[var(--text-primary)]">
          高级选项
        </summary>

        <div className="mt-4 space-y-4">
          <div>
            <label className={transactionFormLabelClass}>手续费（选填）</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              placeholder="0.00"
              className={transactionFormFieldClass}
            />
          </div>

          {shouldShowFeeAccount ? (
            <div>
              <label className={transactionFormLabelClass}>手续费扣款账户 *</label>
              <select
                value={feeAccountId}
                onChange={(e) => setFeeAccountId(e.target.value)}
                className={transactionFormFieldClass}
                required
              >
                <option value="">选择手续费扣款账户</option>
                {feeEligibleAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {getAccountOptionLabel(account)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={transactionFormLabelClass}>备注</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
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
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedTagLabels.map((label) => (
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
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </details>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={loading}
          className={`${transactionFormPrimaryButtonClass} flex-1`}
        >
          {loading ? (isEditMode ? '保存中...' : '创建中...') : isEditMode ? '保存' : '创建'}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return content;
  }

  return (
    <TransactionFormLayout pageTitle={isEditMode ? '编辑转账' : '转账'} showBackButton={true}>
      {content}
    </TransactionFormLayout>
  );
}
