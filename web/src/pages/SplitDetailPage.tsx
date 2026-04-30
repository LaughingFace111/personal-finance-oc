import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, List, Popconfirm, Space, Spin, Tag, Typography, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { apiDeleteSplit, apiGetSplit } from '../services/api';
import { getDefaultBookId } from './transactionFormSupport';

interface SplitTransaction {
  id: string;
  amount: number | string;
  transaction_type?: string;
  direction?: string;
  category_name?: string | null;
  category_id?: string | null;
  merchant?: string | null;
  note?: string | null;
  occurred_at?: string | null;
  is_split_parent?: boolean;
  is_split_child?: boolean;
}

interface SplitDetailResponse {
  original_transaction: SplitTransaction;
  children: SplitTransaction[];
}

function formatMoney(value?: number | string | null) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : '-';
}

export default function SplitDetailPage() {
  const navigate = useNavigate();
  const { transactionId } = useParams();
  const [bookId, setBookId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SplitDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!transactionId) {
        setError('缺少 transactionId');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const nextBookId = await getDefaultBookId();
        if (!nextBookId) throw new Error('无法获取账本信息');
        if (cancelled) return;

        setBookId(nextBookId);
        const response = await apiGetSplit<SplitDetailResponse>(
          `/api/transactions/${transactionId}/split?book_id=${nextBookId}`,
        );
        if (!cancelled) {
          setDetail(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || '加载拆分详情失败');
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
  }, [transactionId]);

  const allocated = useMemo(
    () => (detail?.children || []).reduce((sum, child) => sum + Number(child.amount || 0), 0),
    [detail],
  );

  const handleDelete = async () => {
    if (!transactionId || !bookId) return;

    setDeleting(true);
    try {
      await apiDeleteSplit(`/api/transactions/${transactionId}/split?book_id=${bookId}`);
      message.success('已取消拆分');
      navigate('/transactions');
    } catch (err) {
      setError((err as Error).message || '取消拆分失败');
    } finally {
      setDeleting(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            拆分详情
          </Typography.Title>
          <Typography.Text type="secondary">查看原始交易与拆分后的子交易</Typography.Text>
        </div>
        <Space>
          <Button onClick={() => navigate('/transactions')}>返回交易列表</Button>
          <Popconfirm title="确认取消这组拆分？" onConfirm={() => void handleDelete()}>
            <Button danger loading={deleting}>
              取消拆分
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {error && <Alert type="error" showIcon message={error} />}

      {!detail ? (
        <Alert type="warning" showIcon message="未找到拆分详情" />
      ) : (
        <>
          <Card title="原始交易">
            <Space direction="vertical" size={6}>
              <Typography.Text strong>{formatMoney(detail.original_transaction.amount)}</Typography.Text>
              <Typography.Text type="secondary">
                {detail.original_transaction.merchant || '未填写商户'} · {formatDate(detail.original_transaction.occurred_at)}
              </Typography.Text>
              {detail.original_transaction.note ? (
                <Typography.Text type="secondary">备注：{detail.original_transaction.note}</Typography.Text>
              ) : null}
              <div>
                <Tag color="processing">已拆分</Tag>
                <Tag>子交易 {detail.children.length} 条</Tag>
                <Tag color={allocated === Number(detail.original_transaction.amount || 0) ? 'success' : 'warning'}>
                  已分配 {formatMoney(allocated)}
                </Tag>
              </div>
            </Space>
          </Card>

          <Card title="子交易列表">
            <List
              dataSource={detail.children}
              locale={{ emptyText: '暂无子交易' }}
              renderItem={(child, index) => (
                <List.Item>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <Typography.Text strong>
                        拆分 {index + 1} · {child.category_name || child.category_id || '未分类'}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {formatDate(child.occurred_at)} {child.merchant ? `· ${child.merchant}` : ''}
                      </Typography.Text>
                      {child.note ? <Typography.Text type="secondary">备注：{child.note}</Typography.Text> : null}
                    </div>
                    <Typography.Text strong>{formatMoney(child.amount)}</Typography.Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </>
      )}
    </div>
  );
}
