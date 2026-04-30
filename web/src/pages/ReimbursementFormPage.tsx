import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Tag, message } from 'antd';

import {
  TransactionFormLayout,
  transactionFormFieldClass,
  transactionFormLabelClass,
  transactionFormPrimaryButtonClass,
  transactionFormSectionClass,
  transactionFormTextareaClass,
} from '../components/TransactionFormLayout';
import {
  apiGet,
  apiGetReimbursement,
  apiPatchReimbursement,
  apiPostReimbursement,
  type ReimbursementRecord,
  type ReimbursementStatus,
} from '../services/api';
import { getDefaultBookId, toDateInputValue, toOccurredAt } from './transactionFormSupport';

function getStatusMeta(status: ReimbursementStatus) {
  switch (status) {
    case 'pending':
      return { label: '待处理', color: 'gold' as const };
    case 'approved':
      return { label: '待报销', color: 'blue' as const };
    case 'rejected':
      return { label: '已拒绝', color: 'red' as const };
    case 'reimbursed':
      return { label: '已报销', color: 'green' as const };
    default:
      return { label: status, color: 'default' as const };
  }
}

type SourceTransactionDetail = {
  id: string;
  amount: number | string;
  currency?: string | null;
  occurred_at: string;
  note?: string | null;
  extra?: string | null;
  transaction_type: string;
};

export default function ReimbursementFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const sourceTransactionId = searchParams.get('source_transaction_id');

  const [bookId, setBookId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<ReimbursementStatus | null>(null);
  const [formValues, setFormValues] = useState({
    source_transaction_id: sourceTransactionId || '',
    contact_name: '',
    description: '',
    amount: '',
    currency: 'CNY',
    occurred_at: toDateInputValue(new Date().toISOString()),
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const resolvedBookId = await getDefaultBookId();
        if (!resolvedBookId) throw new Error('无法获取账本信息');
        setBookId(resolvedBookId);

        if (isEdit && id) {
          const detail = await apiGetReimbursement<ReimbursementRecord>(`/api/reimbursements/${id}?book_id=${resolvedBookId}`);
          setCurrentStatus(detail.status);
          setFormValues({
            source_transaction_id: detail.source_transaction_id || '',
            contact_name: detail.contact_name || '',
            description: detail.description || '',
            amount: String(detail.amount ?? ''),
            currency: detail.currency || 'CNY',
            occurred_at: toDateInputValue(detail.occurred_at),
          });
          return;
        }

        if (sourceTransactionId) {
          const sourceTransaction = await apiGet<SourceTransactionDetail>(
            `/api/transactions/${sourceTransactionId}?book_id=${resolvedBookId}`,
          );

          let sourceExtra: Record<string, any> = {};
          try {
            sourceExtra = sourceTransaction.extra ? JSON.parse(sourceTransaction.extra) : {};
          } catch {
            sourceExtra = {};
          }

          const defaultDescription =
            sourceExtra.reason ||
            sourceTransaction.note ||
            (sourceTransaction.transaction_type === 'debt_lend' ? '借出垫付报销' : '借入垫付报销');

          setFormValues((current) => ({
            ...current,
            source_transaction_id: sourceTransaction.id,
            contact_name: sourceExtra.counterparty || '',
            description: defaultDescription,
            amount: String(sourceTransaction.amount ?? ''),
            currency: sourceTransaction.currency || 'CNY',
            occurred_at: toDateInputValue(sourceTransaction.occurred_at),
          }));
        }
      } catch (err: any) {
        message.error(err.message || '加载报销申请失败');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [id, isEdit, sourceTransactionId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bookId) return;

    if (!formValues.contact_name.trim() || !formValues.description.trim() || !formValues.amount) {
      message.error('请填写完整信息');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        source_transaction_id: formValues.source_transaction_id || null,
        contact_name: formValues.contact_name.trim(),
        description: formValues.description.trim(),
        amount: Number(formValues.amount),
        currency: formValues.currency || 'CNY',
        occurred_at: toOccurredAt(formValues.occurred_at),
      };

      if (isEdit && id) {
        await apiPatchReimbursement(`/api/reimbursements/${id}?book_id=${bookId}`, payload);
        message.success('报销申请已更新');
      } else {
        await apiPostReimbursement(`/api/reimbursements?book_id=${bookId}`, payload);
        message.success('报销申请已创建');
      }

      navigate('/reimbursements');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TransactionFormLayout pageTitle={isEdit ? '编辑报销申请' : '新建报销申请'}>
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className={transactionFormSectionClass}>
            {currentStatus ? (
              <div>
                <label className={transactionFormLabelClass}>当前状态</label>
                <Tag color={getStatusMeta(currentStatus).color}>{getStatusMeta(currentStatus).label}</Tag>
              </div>
            ) : null}

            <div>
              <label className={transactionFormLabelClass}>联系人 *</label>
              <input
                type="text"
                value={formValues.contact_name}
                onChange={(event) => setFormValues((current) => ({ ...current, contact_name: event.target.value }))}
                className={transactionFormFieldClass}
                placeholder="请输入联系人姓名"
                required
              />
            </div>

            <div>
              <label className={transactionFormLabelClass}>说明 *</label>
              <textarea
                value={formValues.description}
                onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
                className={transactionFormTextareaClass}
                placeholder="请输入报销说明"
                rows={4}
                required
              />
            </div>

            <div>
              <label className={transactionFormLabelClass}>金额 *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formValues.amount}
                onChange={(event) => setFormValues((current) => ({ ...current, amount: event.target.value }))}
                className={transactionFormFieldClass}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className={transactionFormLabelClass}>币种</label>
              <input
                type="text"
                value={formValues.currency}
                onChange={(event) => setFormValues((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                className={transactionFormFieldClass}
                maxLength={3}
              />
            </div>

            <div>
              <label className={transactionFormLabelClass}>申请日期 *</label>
              <input
                type="date"
                value={formValues.occurred_at}
                onChange={(event) => setFormValues((current) => ({ ...current, occurred_at: event.target.value }))}
                className={transactionFormFieldClass}
                required
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => navigate('/reimbursements')}>
              取消
            </Button>
            <button type="submit" disabled={submitting} className={`flex-1 ${transactionFormPrimaryButtonClass}`}>
              {submitting ? '保存中...' : isEdit ? '保存修改' : '创建申请'}
            </button>
          </div>
        </form>
      )}
    </TransactionFormLayout>
  );
}
