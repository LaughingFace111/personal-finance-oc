import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Space, Spin, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CategorySelector } from '../components/CategorySelector';
import { apiGet, apiPostSplit } from '../services/api';
import {
  type CategoryOption,
  getDefaultBookId,
  loadTransactionFormData,
  toDateInputValue,
} from './transactionFormSupport';

interface TransactionRecord {
  id: string;
  amount: number | string;
  transaction_type: 'income' | 'expense' | string;
  direction?: string;
  occurred_at?: string | null;
  note?: string | null;
  merchant?: string | null;
  account_id?: string | null;
  category_id?: string | null;
}

interface SplitRow {
  key: string;
  amount?: number | null;
  category_id: string;
  note: string;
}

function formatMoney(value?: number | string | null) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function toCents(value?: number | string | null) {
  const numeric = typeof value === 'number' ? value : Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function createRow(index: number): SplitRow {
  return {
    key: `split-row-${Date.now()}-${index}`,
    amount: null,
    category_id: '',
    note: '',
  };
}

export default function SplitFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const originalId = searchParams.get('original_id');

  const [bookId, setBookId] = useState<string | null>(null);
  const [original, setOriginal] = useState<TransactionRecord | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [rows, setRows] = useState<SplitRow[]>([createRow(0), createRow(1)]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!originalId) {
        setError('缺少 original_id');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const nextBookId = await getDefaultBookId();
        if (!nextBookId) {
          throw new Error('无法获取账本信息');
        }
        if (cancelled) return;

        setBookId(nextBookId);
        const [transaction, formData] = await Promise.all([
          apiGet<TransactionRecord>(`/api/transactions/${originalId}?book_id=${nextBookId}`),
          loadTransactionFormData(nextBookId),
        ]);

        if (cancelled) return;

        const filteredCategories = (formData.categories || []).filter((category) => {
          if (transaction.transaction_type === 'income') {
            return category.category_type === 'income' || category.category_type === 'income_expense';
          }
          return category.category_type === 'expense' || category.category_type === 'income_expense';
        });

        setOriginal(transaction);
        setCategories(filteredCategories);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || '加载拆分信息失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [originalId]);

  const originalCents = useMemo(() => toCents(original?.amount), [original?.amount]);
  const allocatedCents = useMemo(
    () => rows.reduce((sum, row) => sum + toCents(row.amount), 0),
    [rows],
  );
  const isBalanced = allocatedCents === originalCents && originalCents > 0;

  const addRow = () => {
    setRows((current) => [...current, createRow(current.length)]);
  };

  const updateRow = (key: string, patch: Partial<SplitRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setRows((current) => {
      if (current.length <= 2) return current;
      return current.filter((row) => row.key !== key);
    });
  };

  const validate = () => {
    if (!originalId || !bookId || !original) {
      setError('原始交易信息未加载完成');
      return false;
    }
    if (rows.length < 2) {
      setError('至少保留 2 条拆分记录');
      return false;
    }
    if (rows.some((row) => !row.category_id || row.amount == null || Number(row.amount) <= 0)) {
      setError('请填写每条拆分的金额和分类');
      return false;
    }
    if (!isBalanced) {
      setError(`拆分金额之和必须精确等于原始金额 ${formatMoney(original.amount)}`);
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !originalId || !bookId) return;

    setSubmitting(true);
    try {
      await apiPostSplit(`/api/transactions/${originalId}/split?book_id=${bookId}`, {
        splits: rows.map((row) => ({
          amount: Number(Number(row.amount || 0).toFixed(2)),
          category_id: row.category_id || null,
          note: row.note.trim() || null,
        })),
      });
      message.success('拆分成功');
      navigate('/transactions');
    } catch (err) {
      setError((err as Error).message || '拆分失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 16, display: 'grid', gap: 16 }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          交易拆分
        </Typography.Title>
        <Typography.Text type="secondary">
          将一笔收入或支出按分类拆成多条子交易
        </Typography.Text>
      </div>

      {error && <Alert type="error" showIcon message={error} />}

      {!original ? (
        <Alert type="warning" showIcon message="未找到原始交易" />
      ) : (
        <>
          <Card>
            <Space direction="vertical" size={6}>
              <Typography.Text strong>原始金额：{formatMoney(original.amount)}</Typography.Text>
              <Typography.Text type="secondary">
                {original.merchant || '未填写商户'} · {toDateInputValue(original.occurred_at)}
              </Typography.Text>
              {original.note ? (
                <Typography.Text type="secondary">备注：{original.note}</Typography.Text>
              ) : null}
            </Space>
          </Card>

          <Card
            title="拆分明细"
            extra={
              <Typography.Text strong style={{ color: isBalanced ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                已分配 {formatMoney(allocatedCents / 100)} / {formatMoney(original.amount)}
              </Typography.Text>
            }
          >
            <div style={{ display: 'grid', gap: 16 }}>
              {rows.map((row, index) => (
                <div
                  key={row.key}
                  style={{
                    display: 'grid',
                    gap: 12,
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-card)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <Typography.Text strong>拆分 {index + 1}</Typography.Text>
                    <Button danger type="text" disabled={rows.length <= 2} onClick={() => removeRow(row.key)}>
                      删除
                    </Button>
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <div>
                      <div style={{ marginBottom: 8 }}>金额</div>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0.01}
                        precision={2}
                        value={row.amount ?? undefined}
                        placeholder="0.00"
                        onChange={(value) => updateRow(row.key, { amount: typeof value === 'number' ? value : null })}
                      />
                    </div>

                    <div>
                      <div style={{ marginBottom: 8 }}>分类</div>
                      <CategorySelector
                        categories={categories}
                        value={row.category_id}
                        onChange={(value) => updateRow(row.key, { category_id: value })}
                        bookId={bookId}
                        onCategoriesUpdated={setCategories}
                        placeholder="点击选择类别"
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ marginBottom: 8 }}>备注</div>
                    <Input
                      value={row.note}
                      placeholder="可选"
                      onChange={(event) => updateRow(row.key, { note: event.target.value })}
                    />
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <Button onClick={addRow}>添加拆分行</Button>
                <Space>
                  <Button onClick={() => navigate('/transactions')}>取消</Button>
                  <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
                    确认拆分
                  </Button>
                </Space>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
