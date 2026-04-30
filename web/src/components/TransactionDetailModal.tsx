import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Tag, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CategorySelector } from './CategorySelector';
import { TagMultiSelect, hexToRgba } from './TagMultiSelect';
import {
  apiDelete,
  apiGet,
  apiGetReimbursement,
  apiPatch,
  apiPatchReimbursement,
  apiPost,
  type ReimbursementRecord,
  type ReimbursementStatus,
} from '../services/api';
import TransferPage from '../pages/TransferPage';
import OtherTransactionPage from '../pages/OtherTransactionPage';
import { getHierarchyPathLabel } from '../utils/hierarchySelection';
import {
  loadTransactionFormData,
  mapTagNamesToIds,
  parseTransactionTagNames,
  toDateInputValue,
  toOccurredAt,
} from '../pages/transactionFormSupport';

type DetailMode = 'detail' | 'edit' | 'copy';

interface TransactionDetailModalProps {
  open: boolean;
  transaction: any | null;
  bookId?: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}

const REFUNDABLE_TRANSACTION_TYPE = 'expense';
const INCOME_CATEGORY_TYPES = new Set(['income', 'income_expense']);
const EXPENSE_CATEGORY_TYPES = new Set(['expense', 'income_expense']);
const DEFAULT_TAG_COLOR = '#3b82f6';

function formatMoney(value?: string | number | null) {
  return Number(value || 0).toFixed(2);
}

function getLeafCategoryDisplay(categories: any[], category: any | null) {
  if (!category) return { label: '未分类', icon: '' };

  const fullLabel = getHierarchyPathLabel(categories, category) || category.name || '未分类';
  const label = fullLabel.split(' / ').pop() || fullLabel || '未分类';
  return { label, icon: category.icon || '' };
}

function getTransactionTypeLabel(transactionType?: string | null) {
  switch (transactionType) {
    case 'expense':
      return '支出';
    case 'income':
      return '收入';
    case 'transfer':
      return '转账';
    case 'refund':
      return '退款';
    default:
      return transactionType || '-';
  }
}

function getReimbursementStatusMeta(status?: ReimbursementStatus | null) {
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
      return { label: '未知', color: 'default' as const };
  }
}

export function TransactionDetailModal({
  open,
  transaction,
  bookId,
  onClose,
  onRefresh,
}: TransactionDetailModalProps) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<DetailMode>('detail');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [editValues, setEditValues] = useState({
    amount: '',
    account_id: '',
    category_id: '',
    merchant: '',
    note: '',
    occurred_at: '',
  });
  const [transferEditValues, setTransferEditValues] = useState<any | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [reimbursement, setReimbursement] = useState<ReimbursementRecord | null>(null);
  const [reimbursementLoading, setReimbursementLoading] = useState(false);
  const [reimbursementSubmitting, setReimbursementSubmitting] = useState(false);
  const [refundForm] = Form.useForm();
  const transactionId = transaction?.id;

  const loadReimbursement = async (targetTransactionId?: string | null, targetTransactionType?: string | null) => {
    if (!bookId || !targetTransactionId || !targetTransactionType || !['debt_borrow', 'debt_lend'].includes(targetTransactionType)) {
      setReimbursement(null);
      return;
    }

    setReimbursementLoading(true);
    try {
      const records = await apiGetReimbursement<ReimbursementRecord[]>(
        `/api/reimbursements?book_id=${bookId}&source_transaction_id=${targetTransactionId}`,
      );
      setReimbursement((records || [])[0] || null);
    } finally {
      setReimbursementLoading(false);
    }
  };

  const loadDetail = async () => {
    if (!bookId || !transactionId) return;
    setLoading(true);
    try {
      const data = await apiGet(`/api/transactions/${transactionId}?book_id=${bookId}`);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;

    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousWidth = document.body.style.width;
    const previousTop = document.body.style.top;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.width = previousWidth;
      document.body.style.top = previousTop;
      document.body.style.touchAction = previousTouchAction;
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    };
  }, [open]);

  useEffect(() => {
    if (!open || !bookId || !transactionId) return;
    setMode('detail');
    setRefundOpen(false);
    setTransferEditValues(null);
    void loadDetail();
    loadTransactionFormData(bookId)
      .then(({ accounts: nextAccounts, categories: nextCategories, tags: nextTags }) => {
        setAccounts(nextAccounts);
        setCategories(nextCategories);
        setTags(nextTags);
      })
      .catch(() => {
        setAccounts([]);
        setCategories([]);
        setTags([]);
      });
  }, [open, bookId, transactionId]);

  useEffect(() => {
    if (!open || !bookId || !detail?.id) {
      setReimbursement(null);
      return;
    }
    void loadReimbursement(detail.id, detail.transaction_type);
  }, [bookId, detail?.id, detail?.transaction_type, open]);

  useEffect(() => {
    if (!detail) return;
    setEditValues({
      amount: String(detail.amount ?? ''),
      account_id: detail.account_id || '',
      category_id: detail.category_id || '',
      merchant: detail.merchant || '',
      note: detail.note || '',
      occurred_at: toDateInputValue(detail.occurred_at),
    });
    setTagIds(mapTagNamesToIds(tags, parseTransactionTagNames(detail.tags)));
  }, [detail, tags]);

  useEffect(() => {
    if (!open || mode !== 'edit' || !detail || !bookId || detail.transaction_type !== 'transfer') {
      setTransferEditValues(null);
      setTransferLoading(false);
      return;
    }

    let cancelled = false;
    setTransferLoading(true);
    apiGet(`/api/transactions/transfer/${detail.id}/edit?book_id=${bookId}`)
      .then((context: any) => {
        if (cancelled) return;
        setTransferEditValues({
          transactionId: context.transaction_id,
          fromAccountId: context.from_account_id,
          toAccountId: context.to_account_id,
          amount: String(context.amount),
          feeAmount: String(context.fee_amount ?? 0),
          feeAccountId: context.fee_account_id ?? '',
          memo: context.note ?? '',
          tagIds: mapTagNamesToIds(tags, parseTransactionTagNames(context.tags)),
          occurredAt: toDateInputValue(context.occurred_at),
        });
      })
      .finally(() => {
        if (!cancelled) setTransferLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, detail, mode, open, tags]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [String(category.id), category])),
    [categories],
  );
  const tagsById = useMemo(
    () => new Map(tags.map((tag) => [String(tag.id), tag])),
    [tags],
  );
  const isOriginalExpense =
    detail?.transaction_type === REFUNDABLE_TRANSACTION_TYPE && detail?.direction === 'out';
  const linkedRefunds = Array.isArray(detail?.linked_refunds) ? detail.linked_refunds : [];
  const hasLinkedRefunds = linkedRefunds.length > 0;
  const hasRefundProgress = Boolean(detail?.has_refund) || hasLinkedRefunds;
  const filteredCategories = useMemo(() => {
    const isIncome = detail?.direction === 'in' && detail?.transaction_type !== 'refund';
    const allowed = isIncome ? INCOME_CATEGORY_TYPES : EXPENSE_CATEGORY_TYPES;
    return categories.filter((category) => allowed.has(category.category_type));
  }, [categories, detail?.direction, detail?.transaction_type]);
  const categoryDisplay = useMemo(() => {
    const category = detail?.category_id ? categoriesById.get(String(detail.category_id)) : null;
    return getLeafCategoryDisplay(categories, category);
  }, [categories, categoriesById, detail?.category_id]);
  const originalAmount = Number(detail?.original_amount ?? detail?.amount ?? 0);
  const remainingRefundableAmount = Number(detail?.remaining_refundable_amount || 0);
  const canShowRefundActions =
    isOriginalExpense && !detail?.is_fully_refunded && remainingRefundableAmount > 0;
  const detailTags = useMemo(() => {
    const parsedTagNames = parseTransactionTagNames(detail?.tags);

    return parsedTagNames.map((tagName) => {
      const tag = tags.find((item) => item.name === tagName);
      if (!tag) {
        return {
          key: tagName,
          label: tagName,
          color: DEFAULT_TAG_COLOR,
        };
      }

      let current = tag;
      const visited = new Set<string>();
      while (current?.parent_id) {
        const parentKey = String(current.parent_id);
        if (visited.has(parentKey)) break;
        visited.add(parentKey);
        const parent = tagsById.get(parentKey);
        if (!parent) break;
        current = parent;
      }

      return {
        key: String(tag.id),
        label: getHierarchyPathLabel(tags, tag) || tag.name,
        color: current?.color || tag.color || DEFAULT_TAG_COLOR,
      };
    });
  }, [detail?.tags, tags, tagsById]);

  const openRefundModal = () => {
    refundForm.setFieldsValue({
      amount: Number(originalAmount.toFixed(2)),
      reason: '',
      occurred_at: toDateInputValue(new Date().toISOString()),
      refund_account_id: detail?.account_id,
    });
    setRefundOpen(true);
  };

  const handleClose = () => {
    setMode('detail');
    setRefundOpen(false);
    onClose();
  };

  const handleRefresh = async () => {
    await loadDetail();
    await loadReimbursement(detail?.id, detail?.transaction_type);
    onRefresh?.();
  };

  const handleMarkReimbursed = async () => {
    if (!bookId || !reimbursement?.id) return;
    setReimbursementSubmitting(true);
    try {
      await apiPatchReimbursement(`/api/reimbursements/${reimbursement.id}/reimburse?book_id=${bookId}`);
      message.success('已标记为报销完成');
      await handleRefresh();
    } finally {
      setReimbursementSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!bookId || !detail?.id) return;
    await apiDelete(`/api/transactions/${detail.id}?book_id=${bookId}`);
    message.success('删除成功');
    onRefresh?.();
    handleClose();
  };

  const handleGenericEditSubmit = async () => {
    if (!bookId || !detail?.id) return;
    setSubmitting(true);
    try {
      const payload = {
        amount: Number(editValues.amount),
        account_id: editValues.account_id,
        category_id: editValues.category_id || null,
        merchant: editValues.merchant || null,
        note: editValues.note || null,
        occurred_at: toOccurredAt(editValues.occurred_at),
        tags:
          tagIds.length > 0
            ? JSON.stringify(
                tagIds
                  .map((id) => tags.find((tag) => tag.id === id)?.name || '')
                  .filter(Boolean),
              )
            : null,
      };
      await apiPatch(`/api/transactions/${detail.id}?book_id=${bookId}`, payload);
      message.success('更新成功');
      setMode('detail');
      await handleRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const canCopyTransaction =
    detail?.transaction_type === 'income' || detail?.transaction_type === 'expense';
  const canSplitTransaction =
    (detail?.transaction_type === 'income' || detail?.transaction_type === 'expense') &&
    !detail?.is_split_parent &&
    !detail?.is_split_child;

  const openCopyMode = () => {
    if (!detail) return;
    setEditValues({
      amount: String(detail.amount ?? ''),
      account_id: detail.account_id || '',
      category_id: detail.category_id || '',
      merchant: detail.merchant || '',
      note: detail.note || '',
      occurred_at: toDateInputValue(new Date().toISOString()),
    });
    setTagIds(mapTagNamesToIds(tags, parseTransactionTagNames(detail.tags)));
    setMode('copy');
  };

  const handleCopySubmit = async () => {
    if (!bookId || !detail?.id) return;
    setSubmitting(true);
    try {
      const payload = {
        transaction_type: detail.transaction_type,
        direction: detail.direction,
        amount: Number(editValues.amount),
        account_id: editValues.account_id,
        category_id: editValues.category_id || null,
        merchant: editValues.merchant || null,
        note: editValues.note || null,
        occurred_at: toOccurredAt(editValues.occurred_at),
        include_in_expense: true,
        include_in_income: true,
        include_in_cashflow: true,
        tags:
          tagIds.length > 0
            ? JSON.stringify(
                tagIds
                  .map((id) => tags.find((tag) => tag.id === id)?.name || '')
                  .filter(Boolean),
              )
            : null,
      };
      await apiPost(`/api/transactions?book_id=${bookId}`, payload);
      message.success('复制成功');
      onRefresh?.();
      handleClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefundSubmit = async () => {
    if (!detail || !bookId) return;
    const values = await refundForm.validateFields();
    const amount = Number(values.amount);
    const remaining = Number(detail.remaining_refundable_amount || 0);
    if (amount > remaining) {
      refundForm.setFields([{ name: 'amount', errors: [`退款金额不能超过剩余 ¥${remaining.toFixed(2)}`] }]);
      return;
    }

    setRefundSubmitting(true);
    try {
      await apiPost(`/api/transactions/refund?book_id=${bookId}`, {
        original_transaction_id: detail.id,
        refund_account_id: values.refund_account_id,
        amount,
        note: values.reason || null,
        occurred_at: toOccurredAt(values.occurred_at),
      });
      message.success('退款成功');
      setRefundOpen(false);
      refundForm.resetFields();
      await handleRefresh();
    } finally {
      setRefundSubmitting(false);
    }
  };

  const renderDetailMode = () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.04), rgba(148, 163, 184, 0.08))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {categoryDisplay.icon ? `${categoryDisplay.icon} ${categoryDisplay.label}` : categoryDisplay.label}
            </div>
            <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
              {toDateInputValue(detail?.occurred_at)} · {accountMap.get(detail?.account_id)?.name || '未知账户'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: detail?.direction === 'in' || detail?.transaction_type === 'refund' ? 'var(--accent-green)' : 'var(--accent-red)',
              }}
            >
              {detail?.direction === 'in' || detail?.transaction_type === 'refund' ? '+' : '-'}¥{formatMoney(detail?.amount)}
            </div>
            {detail?.is_fully_refunded && <Tag color="default" style={{ marginTop: 8 }}>已全额退款</Tag>}
            {!detail?.is_fully_refunded && detail?.is_partially_refunded && <Tag color="processing" style={{ marginTop: 8 }}>部分退款</Tag>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button onClick={() => setMode('edit')}>编辑</Button>
        {canCopyTransaction && <Button onClick={openCopyMode}>复制</Button>}
        {canSplitTransaction && (
          <Button
            onClick={() => {
              handleClose();
              navigate(`/split/new?original_id=${detail?.id}`);
            }}
          >
            拆分
          </Button>
        )}
        {canShowRefundActions && (
          <Button type="primary" onClick={() => openRefundModal()}>
            退款
          </Button>
        )}
        <Popconfirm title="确认删除这笔交易？" onConfirm={() => void handleDelete()}>
          <Button danger>删除</Button>
        </Popconfirm>
      </div>

      {isOriginalExpense && hasRefundProgress && hasLinkedRefunds && (
        <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>退款进度</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>原始金额</span>
              <span>¥{formatMoney(detail.original_amount ?? detail.amount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>已退款</span>
              <span>¥{formatMoney(detail.refunded_amount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>剩余可退</span>
              <span>¥{formatMoney(detail.remaining_refundable_amount)}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>交易信息</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>类型</span>
            <span>{getTransactionTypeLabel(detail?.transaction_type)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>分类</span>
            <span>{detail?.category_id ? categoryDisplay.label : '未分类'}</span>
          </div>
          {detail?.counterparty_account_id && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>对方账户</span>
              <span>{accountMap.get(detail.counterparty_account_id)?.name || detail.counterparty_account_id}</span>
            </div>
          )}
          {['debt_borrow', 'debt_lend'].includes(detail?.transaction_type) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>报销状态</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {reimbursementLoading ? (
                  <Spin size="small" />
                ) : reimbursement ? (
                  <>
                    <Tag color={getReimbursementStatusMeta(reimbursement.status).color}>
                      {getReimbursementStatusMeta(reimbursement.status).label}
                    </Tag>
                    {reimbursement.status === 'pending' && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => {
                          handleClose();
                          navigate('/reimbursements');
                        }}
                      >
                        查看报销
                      </Button>
                    )}
                    {reimbursement.status === 'approved' && (
                      <Button
                        type="link"
                        size="small"
                        loading={reimbursementSubmitting}
                        onClick={() => void handleMarkReimbursed()}
                      >
                        标记已报销
                      </Button>
                    )}
                  </>
                ) : (
                  <span>未创建</span>
                )}
              </div>
            </div>
          )}
          {detailTags.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--text-secondary)' }}>标签</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
                {detailTags.map((tag) => (
                  <span
                    key={tag.key}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: `1px solid ${hexToRgba(tag.color, 0.32)}`,
                      background: hexToRgba(tag.color, 0.12),
                      color: tag.color,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isOriginalExpense && hasRefundProgress && hasLinkedRefunds && (
        <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>关联退款记录</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {linkedRefunds.map((refund: any) => (
              <div
                key={refund.id}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>¥{formatMoney(refund.amount)}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {toDateInputValue(refund.occurred_at)} · {accountMap.get(refund.account_id)?.name || refund.account_id}
                  </div>
                  {refund.note && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{refund.note}</div>
                  )}
                </div>
                <Tag color="green">退款</Tag>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>备注</div>
        <div style={{ color: detail?.note ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {detail?.note || '无'}
        </div>
      </div>
    </div>
  );

  const renderGenericEditMode = (submitLabel: string, onSubmit: () => void) => (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>金额</div>
        <input
          type="number"
          step="0.01"
          min="0"
          value={editValues.amount}
          onChange={(event) => setEditValues((current) => ({ ...current, amount: event.target.value }))}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)' }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>日期</div>
        <input
          type="date"
          value={editValues.occurred_at}
          onChange={(event) => setEditValues((current) => ({ ...current, occurred_at: event.target.value }))}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)' }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>账户</div>
        <select
          value={editValues.account_id}
          onChange={(event) => setEditValues((current) => ({ ...current, account_id: event.target.value }))}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)' }}
        >
          <option value="">选择账户</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>
      {filteredCategories.length > 0 && (
        <div>
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>分类</div>
          <CategorySelector
            categories={filteredCategories}
            value={editValues.category_id}
            onChange={(value) => setEditValues((current) => ({ ...current, category_id: value }))}
            bookId={bookId}
            onCategoriesUpdated={setCategories}
            placeholder="点击选择类别"
          />
        </div>
      )}
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>商户</div>
        <input
          type="text"
          value={editValues.merchant}
          onChange={(event) => setEditValues((current) => ({ ...current, merchant: event.target.value }))}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)' }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>备注</div>
        <textarea
          rows={4}
          value={editValues.note}
          onChange={(event) => setEditValues((current) => ({ ...current, note: event.target.value }))}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-light)' }}
        />
      </div>
      <div>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>标签</div>
        <TagMultiSelect allTags={tags} value={tagIds} onChange={setTagIds} bookId={bookId} onTagsUpdated={setTags} />
      </div>
      <Space>
        <Button onClick={() => setMode('detail')}>取消</Button>
        <Button type="primary" loading={submitting} onClick={() => void onSubmit()}>
          {submitLabel}
        </Button>
      </Space>
    </div>
  );

  const repaymentInitialValues = useMemo(() => {
    if (!detail) return null;
    return {
      transactionId: detail.id,
      subType: 'repay' as const,
      accountId: detail.account_id || '',
      creditCardAccountId: detail.counterparty_account_id || '',
      amount: String(detail.amount ?? ''),
      memo: detail.note || '',
      tagIds,
      date: toDateInputValue(detail.occurred_at),
    };
  }, [detail, tagIds]);

  const renderEditMode = () => {
    if (!detail) return null;

    if (detail.transaction_type === 'transfer') {
      if (transferLoading || !transferEditValues) {
        return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
      }
      return (
        <TransferPage
          embedded
          isEditMode
          initialValues={transferEditValues}
          onCancel={() => setMode('detail')}
          onSuccess={() => {
            message.success('更新成功');
            setMode('detail');
            void handleRefresh();
          }}
        />
      );
    }

    if (detail.transaction_type === 'repayment_credit_card' && repaymentInitialValues) {
      return (
        <OtherTransactionPage
          embedded
          initialSubType="repay"
          isEditMode
          initialValues={repaymentInitialValues}
          onCancel={() => setMode('detail')}
          onSuccess={() => {
            message.success('更新成功');
            setMode('detail');
            void handleRefresh();
          }}
        />
      );
    }

    if (mode === 'copy') {
      return renderGenericEditMode('创建副本', handleCopySubmit);
    }

    return renderGenericEditMode('保存', handleGenericEditSubmit);
  };

  return (
    <>
      <Modal
        centered
        open={open}
        width={720}
        onCancel={handleClose}
        footer={null}
        destroyOnClose={false}
        styles={{
          body: {
            maxHeight: '78vh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          },
        }}
        title={mode === 'detail' ? '交易详情' : mode === 'copy' ? '复制交易' : '编辑交易'}
      >
        {loading || !detail ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : mode === 'detail' ? renderDetailMode() : renderEditMode()}
      </Modal>

      <Modal
        centered
        open={refundOpen}
        title="退款"
        onCancel={() => {
          setRefundOpen(false);
          refundForm.resetFields();
        }}
        onOk={() => void handleRefundSubmit()}
        okText="确认退款"
        confirmLoading={refundSubmitting}
      >
        <Form form={refundForm} layout="vertical">
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            剩余可退款金额：¥{formatMoney(detail?.remaining_refundable_amount)}
          </div>
          <Form.Item
            name="amount"
            label="退款金额"
            rules={[
              { required: true, message: '请输入退款金额' },
              {
                validator: (_, value) => {
                  if (value == null || value === '') return Promise.resolve();
                  if (Number(value) <= 0) return Promise.reject(new Error('退款金额必须大于 0'));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              precision={2}
              placeholder="请输入退款金额"
            />
          </Form.Item>
          <Form.Item
            name="refund_account_id"
            label="退款账户"
            rules={[{ required: true, message: '请选择退款账户' }]}
          >
            <Select
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              placeholder="请选择退款入账账户"
            />
          </Form.Item>
          <Form.Item
            name="occurred_at"
            label="退款日期"
            rules={[{ required: true, message: '请选择退款日期' }]}
          >
            <Input type="date" />
          </Form.Item>
          <Form.Item name="reason" label="退款原因">
            <Input.TextArea rows={3} placeholder="可选，写入退款交易备注" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
