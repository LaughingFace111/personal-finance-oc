import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Modal, Spin, Tabs, Tag, message } from 'antd';

import {
  apiGetReimbursement,
  apiPatchReimbursement,
  type ReimbursementRecord,
  type ReimbursementStatus,
} from '../services/api';
import { getDefaultBookId } from './transactionFormSupport';

type FilterTabKey = 'all' | ReimbursementStatus;

const FILTER_TABS: { key: FilterTabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'approved', label: '待报销' },
  { key: 'rejected', label: '已拒绝' },
];

function formatMoney(value?: string | number | null) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return value.slice(0, 10);
}

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

export default function ReimbursementsPage() {
  const navigate = useNavigate();
  const [bookId, setBookId] = useState('');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ReimbursementRecord[]>([]);
  const [tabKey, setTabKey] = useState<FilterTabKey>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadRequests = async (resolvedBookId: string, nextTabKey: FilterTabKey) => {
    setLoading(true);
    try {
      const statusQuery = nextTabKey === 'all' ? '' : `&status=${nextTabKey}`;
      const data = await apiGetReimbursement<ReimbursementRecord[]>(
        `/api/reimbursements?book_id=${resolvedBookId}${statusQuery}`,
      );
      setRequests(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const resolvedBookId = await getDefaultBookId();
        if (!resolvedBookId) throw new Error('无法获取账本信息');
        setBookId(resolvedBookId);
        await loadRequests(resolvedBookId, 'all');
      } catch (err: any) {
        message.error(err.message || '加载报销申请失败');
        setLoading(false);
      }
    };
    void loadData();
  }, []);

  const summary = useMemo(() => {
    return requests.reduce(
      (acc, item) => {
        acc.total += Number(item.amount || 0);
        return acc;
      },
      { total: 0 },
    );
  }, [requests]);

  const handleTabChange = async (nextTabKey: string) => {
    const resolvedTabKey = nextTabKey as FilterTabKey;
    setTabKey(resolvedTabKey);
    if (!bookId) return;
    await loadRequests(bookId, resolvedTabKey);
  };

  const handleApprove = async (requestId: string) => {
    if (!bookId) return;
    setActionLoadingId(requestId);
    try {
      await apiPatchReimbursement(`/api/reimbursements/${requestId}/approve?book_id=${bookId}`);
      message.success('已审批通过');
      await loadRequests(bookId, tabKey);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!bookId) return;
    setActionLoadingId(requestId);
    try {
      await apiPatchReimbursement(`/api/reimbursements/${requestId}/reject?book_id=${bookId}`);
      message.success('已拒绝');
      await loadRequests(bookId, tabKey);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReimburse = async (requestId: string) => {
    if (!bookId) return;
    setActionLoadingId(requestId);
    try {
      await apiPatchReimbursement(`/api/reimbursements/${requestId}/reimburse?book_id=${bookId}`);
      message.success('已标记为报销完成');
      await loadRequests(bookId, tabKey);
    } finally {
      setActionLoadingId(null);
    }
  };

  const renderActions = (item: ReimbursementRecord) => {
    if (item.status === 'pending') {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            size="small"
            loading={actionLoadingId === item.id}
            onClick={() => void handleApprove(item.id)}
          >
            审批通过
          </Button>
          <Button
            danger
            size="small"
            loading={actionLoadingId === item.id}
            onClick={() => {
              Modal.confirm({
                title: '确认拒绝这条报销申请？',
                okText: '拒绝',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => handleReject(item.id),
              });
            }}
          >
            驳回
          </Button>
          <Button size="small" onClick={() => navigate(`/reimbursements/${item.id}/edit`)}>
            编辑
          </Button>
        </div>
      );
    }

    if (item.status === 'approved') {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            size="small"
            loading={actionLoadingId === item.id}
            onClick={() => void handleReimburse(item.id)}
          >
            标记已报销
          </Button>
          <Button size="small" onClick={() => navigate(`/reimbursements/${item.id}/edit`)}>
            编辑
          </Button>
        </div>
      );
    }

    if (item.status === 'rejected') {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            size="small"
            loading={actionLoadingId === item.id}
            onClick={() => void handleReimburse(item.id)}
          >
            标记已报销
          </Button>
          <Button size="small" onClick={() => navigate(`/reimbursements/${item.id}/edit`)}>
            编辑
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        bordered={false}
        style={{ borderRadius: 16 }}
        bodyStyle={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>报销垫付管理</div>
          <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
            共 {requests.length} 条申请，当前列表金额 {formatMoney(summary.total)}
          </div>
        </div>
        <Button type="primary" onClick={() => navigate('/reimbursements/new')}>
          新建申请
        </Button>
      </Card>

      <Tabs
        activeKey={tabKey}
        onChange={(key) => void handleTabChange(key)}
        items={FILTER_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          children: loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Spin />
            </div>
          ) : requests.length === 0 ? (
            <Empty description="暂无报销申请" />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {requests.map((item) => {
                const statusMeta = getStatusMeta(item.status);
                return (
                  <Card key={item.id} style={{ borderRadius: 16 }}>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 600 }}>{item.contact_name}</div>
                          <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{item.description}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(item.amount)}</div>
                          <Tag color={statusMeta.color} style={{ marginTop: 8 }}>
                            {statusMeta.label}
                          </Tag>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: 13 }}>
                        <span>申请日期：{formatDate(item.occurred_at)}</span>
                        <span>处理时间：{formatDate(item.resolved_at)}</span>
                      </div>

                      {renderActions(item)}
                    </div>
                  </Card>
                );
              })}
            </div>
          ),
        }))}
      />
    </div>
  );
}
