import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TagMultiSelect } from '../components/TagMultiSelect';
import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
} from '../components/TransactionFormLayout';
import { apiGet, apiPost, apiPut } from '../services/api';
import {
  AccountOption,
  CategoryOption,
  TagOption,
  getAccountOptionLabel,
  getCategoryLabel,
  getDefaultBookId,
  loadTransactionFormData,
  OtherTransactionFormInitialValues,
  toDateInputValue,
  toOccurredAt,
} from './transactionFormSupport';

type SubType = 'installment' | 'lend' | 'borrow' | 'repay';

const assetAccountTypes = ['cash', 'debit_card', 'ewallet', 'virtual'];
const creditAccountTypes = ['credit_card', 'credit_line'];

interface OtherTransactionPageProps {
  initialSubType?: SubType;
  initialValues?: OtherTransactionFormInitialValues;
  isEditMode?: boolean;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface AccountDetailResponse {
  current_statement_balance: number | string | null;
}

export default function OtherTransactionPage({
  initialSubType = 'installment',
  initialValues,
  isEditMode = false,
  embedded = false,
  onSuccess,
  onCancel,
}: OtherTransactionPageProps) {
  const navigate = useNavigate();
  const [bookId, setBookId] = useState('');
  const [subType, setSubType] = useState<SubType>(initialValues?.subType ?? initialSubType);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accountId, setAccountId] = useState(initialValues?.accountId ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [periods, setPeriods] = useState(12);
  const [feePerPeriod, setFeePerPeriod] = useState('');
  const [repaymentDay, setRepaymentDay] = useState(15);

  const [counterparty, setCounterparty] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState('');
  const [reason, setReason] = useState('');
  const [creditCardAccountId, setCreditCardAccountId] = useState(initialValues?.creditCardAccountId ?? '');
  const [repayAmount, setRepayAmount] = useState(initialValues?.amount ?? '');
  const [repayAmountLoading, setRepayAmountLoading] = useState(false);

  const [memo, setMemo] = useState(initialValues?.memo ?? '');
  const [date, setDate] = useState(initialValues?.date ? toDateInputValue(initialValues.date) : new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>(initialValues?.tagIds ?? []);

  useEffect(() => {
    setSubType(initialValues?.subType ?? initialSubType);
    setAccountId(initialValues?.accountId ?? '');
    setCreditCardAccountId(initialValues?.creditCardAccountId ?? '');
    setRepayAmount(initialValues?.amount ?? '');
    setMemo(initialValues?.memo ?? '');
    setDate(initialValues?.date ? toDateInputValue(initialValues.date) : new Date().toISOString().split('T')[0]);
    setTagIds(initialValues?.tagIds ?? []);
  }, [initialSubType, initialValues]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const resolvedBookId = await getDefaultBookId();
        if (!resolvedBookId) throw new Error('无法获取账本信息');
        setBookId(resolvedBookId);

        const formData = await loadTransactionFormData(resolvedBookId);
        setAccounts(formData.accounts);
        setCategories(formData.categories);
        setTags(formData.tags);
      } catch (err) {
        setError((err as Error).message || '加载数据失败');
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    setError('');
    if (subType === 'repay' && isEditMode) {
      return;
    }
    setAccountId((current) => (subType === 'repay' ? current : ''));
    setCategoryId('');
    setCreditCardAccountId((current) => (subType === 'repay' ? current : ''));
  }, [isEditMode, subType]);

  useEffect(() => {
    if (subType !== 'repay') {
      setRepayAmountLoading(false);
      return;
    }

    if (!creditCardAccountId) {
      setRepayAmount(initialValues?.amount ?? '');
      setRepayAmountLoading(false);
      return;
    }

    if (
      isEditMode &&
      initialValues?.creditCardAccountId === creditCardAccountId &&
      initialValues?.amount
    ) {
      setRepayAmount(initialValues.amount);
      setRepayAmountLoading(false);
      return;
    }

    let isCancelled = false;

    const loadRepaymentAmount = async () => {
      setRepayAmountLoading(true);
      try {
        const account = await apiGet<AccountDetailResponse>(`/api/accounts/${creditCardAccountId}`);
        if (!isCancelled) {
          setRepayAmount(account.current_statement_balance == null ? '' : String(account.current_statement_balance));
        }
      } catch {
        if (!isCancelled) {
          setRepayAmount('');
        }
      } finally {
        if (!isCancelled) {
          setRepayAmountLoading(false);
        }
      }
    };

    loadRepaymentAmount();

    return () => {
      isCancelled = true;
    };
  }, [creditCardAccountId, initialValues?.amount, initialValues?.creditCardAccountId, isEditMode, subType]);

  const creditAccounts = useMemo(
    () => accounts.filter((account) => creditAccountTypes.includes(account.account_type)),
    [accounts],
  );

  const assetAccounts = useMemo(
    () => accounts.filter((account) => assetAccountTypes.includes(account.account_type)),
    [accounts],
  );

  const installmentCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.category_type === 'expense' || category.category_type === 'income_expense',
      ),
    [categories],
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

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    navigate(-1);
  };

  const submitInstallment = async (resolvedBookId: string) => {
    if (!accountId || !amount || !merchant) {
      throw new Error('请填写分期账户、金额和商户');
    }

    await apiPost('/api/installments', {
      occurred_at: toOccurredAt(date),
      book_id: resolvedBookId,
      account_id: accountId,
      merchant,
      category_id: categoryId || null,
      note: memo || null,
      total_amount: parseFloat(amount),
      total_periods: periods,
      fee_per_period: feePerPeriod ? parseFloat(feePerPeriod) : 0,
      start_date: date,
      repayment_day: repaymentDay,
      plan_name: merchant,
    });
  };

  const submitDebtTransaction = async (resolvedBookId: string, transactionType: 'debt_lend' | 'debt_borrow') => {
    if (!accountId || !loanAmount || !counterparty || !repaymentDate) {
      throw new Error('请填写账户、金额、往来方和约定还款日');
    }

    await apiPost(`/api/transactions?book_id=${resolvedBookId}`, {
      occurred_at: toOccurredAt(date),
      account_id: accountId,
      transaction_type: transactionType,
      direction: transactionType === 'debt_borrow' ? 'in' : 'out',
      amount: parseFloat(loanAmount),
      note: memo || null,
      tags: tagIds.length > 0 ? JSON.stringify(tagIds) : null,
      extra: JSON.stringify({
        counterparty,
        repayment_date: repaymentDate,
        reason: reason || null,
      }),
    });
  };

  const submitRepayment = async (resolvedBookId: string) => {
    if (!accountId || !creditCardAccountId || !repayAmount) {
      throw new Error('请填写还款账户、信用卡和还款金额');
    }

    const tagPayload =
      tagIds.length > 0
        ? JSON.stringify(
            tagIds
              .map((id) => {
                const tag = tags.find((item) => item.id === id);
                return tag?.name || '';
              })
              .filter(Boolean),
          )
        : null;

    if (isEditMode) {
      const payload = {
        occurred_at: toOccurredAt(date),
        account_id: accountId,
        counterparty_account_id: creditCardAccountId,
        amount: parseFloat(repayAmount),
        note: memo || null,
        tags: tagPayload,
      };

      if (!initialValues?.transactionId) {
        throw new Error('缺少还款记录ID');
      }
      await apiPut(`/api/transactions/${initialValues.transactionId}?book_id=${resolvedBookId}`, payload);
      return;
    }

    const payload = {
      occurred_at: toOccurredAt(date),
      transaction_type: 'repayment_credit_card',
      direction: 'out',
      account_id: accountId,
      counterparty_account_id: creditCardAccountId,
      amount: parseFloat(repayAmount),
      note: memo || null,
      tags: tagPayload,
    };

    await apiPost(`/api/transactions?book_id=${resolvedBookId}`, payload);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const resolvedBookId = bookId || (await getDefaultBookId());
      if (!resolvedBookId) throw new Error('无法获取账本信息');

      if (subType === 'installment') {
        await submitInstallment(resolvedBookId);
      } else if (subType === 'lend') {
        await submitDebtTransaction(resolvedBookId, 'debt_lend');
      } else if (subType === 'borrow') {
        await submitDebtTransaction(resolvedBookId, 'debt_borrow');
      } else {
        await submitRepayment(resolvedBookId);
      }

      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError((err as Error).message || (isEditMode ? '更新失败' : '创建失败'));
    } finally {
      setLoading(false);
    }
  };

  const renderInstallmentFields = () => (
    <>
      <div>
        <label className={transactionFormLabelClass}>分期账户 *</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={transactionFormFieldClass}
          required
        >
          <option value="">选择信用卡/信用账户</option>
          {creditAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={transactionFormLabelClass}>商户 *</label>
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="如：苹果官网、京东"
          className={transactionFormFieldClass}
          required
        />
      </div>

      <div>
        <label className={transactionFormLabelClass}>分类</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={transactionFormFieldClass}
        >
          <option value="">选择分类</option>
          {installmentCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {getCategoryLabel(categories, category.id)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={transactionFormLabelClass}>总金额 *</label>
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
        <label className={transactionFormLabelClass}>分期期数 *</label>
        <select
          value={periods}
          onChange={(e) => setPeriods(Number(e.target.value))}
          className={transactionFormFieldClass}
        >
          {[3, 6, 9, 12, 18, 24, 36].map((period) => (
            <option key={period} value={period}>
              {period} 期
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={transactionFormLabelClass}>每期手续费</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={feePerPeriod}
          onChange={(e) => setFeePerPeriod(e.target.value)}
          placeholder="0.00"
          className={transactionFormFieldClass}
        />
      </div>

      <div>
        <label className={transactionFormLabelClass}>每月还款日</label>
        <select
          value={repaymentDay}
          onChange={(e) => setRepaymentDay(Number(e.target.value))}
          className={transactionFormFieldClass}
        >
          {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={day}>
              {day} 日
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const renderDebtFields = () => (
    <>
      <div>
        <label className={transactionFormLabelClass}>资金账户 *</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={transactionFormFieldClass}
          required
        >
          <option value="">选择资产账户</option>
          {assetAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} (余额: ¥{account.current_balance})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={transactionFormLabelClass}>
          {subType === 'lend' ? '借款人' : '出借方'} *
        </label>
        <input
          type="text"
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder={subType === 'lend' ? '请输入借款人姓名' : '请输入出借方姓名'}
          className={transactionFormFieldClass}
          required
        />
      </div>

      <div>
        <label className={transactionFormLabelClass}>金额 *</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={loanAmount}
          onChange={(e) => setLoanAmount(e.target.value)}
          placeholder="0.00"
          className={transactionFormFieldClass}
          required
        />
      </div>

      <div>
        <label className={transactionFormLabelClass}>约定还款日 *</label>
        <input
          type="date"
          value={repaymentDate}
          onChange={(e) => setRepaymentDate(e.target.value)}
          className={transactionFormFieldClass}
          required
        />
      </div>

      <div>
        <label className={transactionFormLabelClass}>原因</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="可选，记录借款原因"
          className={transactionFormFieldClass}
        />
      </div>
    </>
  );

  const renderRepayFields = () => (
    <>
      <div>
        <label className={transactionFormLabelClass}>还款账户 *</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={transactionFormFieldClass}
          required
        >
          <option value="">选择资产账户</option>
          {assetAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {getAccountOptionLabel(account)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={transactionFormLabelClass}>还款信用卡 *</label>
        <select
          value={creditCardAccountId}
          onChange={(e) => setCreditCardAccountId(e.target.value)}
          className={transactionFormFieldClass}
          required
        >
          <option value="">选择信用卡/信用账户</option>
          {creditAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {getAccountOptionLabel(account)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={transactionFormLabelClass}>还款金额 *</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={repayAmount}
          onChange={(e) => setRepayAmount(e.target.value)}
          placeholder={repayAmountLoading ? '加载账单金额中...' : '0.00'}
          className={transactionFormFieldClass}
          required
        />
      </div>
    </>
  );

  const content = (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className={transactionFormSectionClass}>
        {subType === 'installment'
          ? renderInstallmentFields()
          : subType === 'repay'
            ? renderRepayFields()
            : renderDebtFields()}

        <div>
          <label className={transactionFormLabelClass}>日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={transactionFormFieldClass}
            required
          />
        </div>

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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

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
          className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (isEditMode ? '保存中...' : '保存中...') : isEditMode ? '保存' : '保存'}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return content;
  }

  return (
    <TransactionFormLayout pageTitle={isEditMode ? '编辑其他交易' : '其他交易'}>
      {content}
    </TransactionFormLayout>
  );
}
