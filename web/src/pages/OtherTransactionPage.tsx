import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  getCategoryLabel,
  getAccountOptionLabel,
  getDefaultBookId,
  loadTransactionFormData,
  toOccurredAt,
  toTagOptions,
} from './transactionFormSupport';

type SubType = 'installment' | 'lend' | 'borrow' | 'repay';

const assetAccountTypes = ['cash', 'debit_card', 'ewallet', 'virtual'];
const creditAccountTypes = ['credit_card', 'credit_line'];

interface OtherTransactionPageProps {
  initialSubType?: SubType;
}

export default function OtherTransactionPage({
  initialSubType = 'installment',
}: OtherTransactionPageProps) {
  const navigate = useNavigate();
  const [subType, setSubType] = useState<SubType>(initialSubType);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [accountId, setAccountId] = useState('');
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
  const [creditCardAccountId, setCreditCardAccountId] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    setSubType(initialSubType);
  }, [initialSubType]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const bookId = await getDefaultBookId();
        if (!bookId) throw new Error('无法获取账本信息');

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

  useEffect(() => {
    setError('');
    setAccountId('');
    setCategoryId('');
    setCreditCardAccountId('');
  }, [subType]);

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

  const submitInstallment = async (bookId: string) => {
    if (!accountId || !amount || !merchant) {
      throw new Error('请填写分期账户、金额和商户');
    }

    await apiPost('/api/installments', {
      occurred_at: toOccurredAt(date),
      book_id: bookId,
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

  const submitDebtTransaction = async (bookId: string, transactionType: 'debt_lend' | 'debt_borrow') => {
    if (!accountId || !loanAmount || !counterparty || !repaymentDate) {
      throw new Error('请填写账户、金额、往来方和约定还款日');
    }

    await apiPost(`/api/transactions?book_id=${bookId}`, {
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

  const submitRepayment = async (bookId: string) => {
    if (!accountId || !creditCardAccountId || !repayAmount) {
      throw new Error('请填写还款账户、信用卡和还款金额');
    }

    await apiPost(`/api/transactions?book_id=${bookId}`, {
      occurred_at: toOccurredAt(date),
      transaction_type: 'repayment_credit_card',
      direction: 'out',
      account_id: accountId,
      counterparty_account_id: creditCardAccountId,
      amount: parseFloat(repayAmount),
      note: memo || null,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const bookId = await getDefaultBookId();
      if (!bookId) throw new Error('无法获取账本信息');

      if (subType === 'installment') {
        await submitInstallment(bookId);
      } else if (subType === 'lend') {
        await submitDebtTransaction(bookId, 'debt_lend');
      } else if (subType === 'borrow') {
        await submitDebtTransaction(bookId, 'debt_borrow');
      } else {
        await submitRepayment(bookId);
      }

      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message || '创建失败');
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
          placeholder="0.00"
          className={transactionFormFieldClass}
          required
        />
      </div>
    </>
  );

  return (
    <TransactionFormLayout
      pageTitle="其他交易"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl bg-slate-100 p-1">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setSubType('installment')}
              className={transactionFormToggleClass(subType === 'installment')}
            >
              分期
            </button>
            <button
              type="button"
              onClick={() => setSubType('lend')}
              className={transactionFormToggleClass(subType === 'lend')}
            >
              借出
            </button>
            <button
              type="button"
              onClick={() => setSubType('borrow')}
              className={transactionFormToggleClass(subType === 'borrow')}
            >
              借入
            </button>
            <button
              type="button"
              onClick={() => setSubType('repay')}
              className={transactionFormToggleClass(subType === 'repay')}
            >
              还款
            </button>
          </div>
        </div>

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

          {subType !== 'repay' && (
            <div>
              <label className={transactionFormLabelClass}>标签</label>
              <TagMultiSelect allTags={toTagOptions(tags)} value={tagIds} onChange={setTagIds} />
            </div>
          )}
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
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </TransactionFormLayout>
  );
}
