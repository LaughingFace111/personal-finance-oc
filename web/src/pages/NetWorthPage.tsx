import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Col, Empty, List, Row, Spin, Table, Tag, Typography, message } from 'antd';
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { apiGet, type NetWorthAccount, type NetWorthResponse } from '../services/api';
import { getDefaultBookId } from './transactionFormSupport';

const { Title, Text } = Typography;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: '现金',
  debit_card: '借记卡',
  ewallet: '电子钱包',
  virtual: '虚拟账户',
  credit_card: '信用卡',
  credit_line: '信用额度',
  loan: '贷款',
};

const ROLE_LABELS: Record<NetWorthAccount['role'], string> = {
  asset: '资产',
  liability: '负债',
};

const formatMoney = (value?: number | string | null) => `¥${Number(value || 0).toFixed(2)}`;
const formatTypeLabel = (value: string) => ACCOUNT_TYPE_LABELS[value] || value;

export default function NetWorthPage() {
  const navigate = useNavigate();
  const [bookId, setBookId] = useState<string | null>(null);
  const [data, setData] = useState<NetWorthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const resolvedBookId = bookId || (await getDefaultBookId());
      if (!resolvedBookId) {
        throw new Error('无法获取账本信息');
      }

      if (!bookId) {
        setBookId(resolvedBookId);
      }

      const response = await apiGet<NetWorthResponse>(`/api/accounts/net-worth?book_id=${resolvedBookId}`);
      setData(response);
    } catch (error) {
      setData(null);
      message.error((error as Error).message || '加载净资产失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const assetRows = useMemo(
    () => Object.entries(data?.assets_by_type || {}).map(([type, amount]) => ({ type, amount })),
    [data],
  );
  const liabilityRows = useMemo(
    () => Object.entries(data?.liabilities_by_type || {}).map(([type, amount]) => ({ type, amount })),
    [data],
  );

  const chartOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number }) => `${params.name}: ${formatMoney(params.value)}`,
    },
    color: ['#52c41a', '#ff4d4f', '#1677ff'],
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '50%'],
        label: { formatter: '{b}' },
        data: [
          { name: '总资产', value: Number(data?.total_assets || 0) },
          { name: '总负债', value: Number(data?.total_liabilities || 0) },
          { name: '净资产', value: Math.abs(Number(data?.net_worth || 0)) },
        ],
      },
    ],
  }), [data]);

  const columns = [
    {
      title: '账户',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, record: NetWorthAccount) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatTypeLabel(record.account_type)}
          </Text>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: NetWorthAccount['role']) => (
        <Tag color={role === 'asset' ? 'green' : 'red'}>{ROLE_LABELS[role]}</Tag>
      ),
    },
    {
      title: '价值',
      dataIndex: 'value',
      key: 'value',
      align: 'right' as const,
      render: (value: number | string, record: NetWorthAccount) => (
        <span style={{ color: record.role === 'asset' ? '#389e0d' : '#cf1322', fontWeight: 600 }}>
          {formatMoney(value)}
        </span>
      ),
    },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-light)',
          margin: '-16px -16px 16px -16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/reports/home')} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>净资产总览</span>
        </div>
        <Button type="text" icon={<ReloadOutlined spin={refreshing} />} onClick={() => void loadData(true)}>
          刷新
        </Button>
      </div>

      {!data ? (
        <Empty description="暂无净资产数据" />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12 }}>
                <Text type="secondary">总资产</Text>
                <Title level={3} style={{ margin: '8px 0 0', color: '#389e0d' }}>
                  {formatMoney(data.total_assets)}
                </Title>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12 }}>
                <Text type="secondary">总负债</Text>
                <Title level={3} style={{ margin: '8px 0 0', color: '#cf1322' }}>
                  {formatMoney(data.total_liabilities)}
                </Title>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12 }}>
                <Text type="secondary">净资产</Text>
                <Title level={3} style={{ margin: '8px 0 0', color: '#1677ff' }}>
                  {formatMoney(data.net_worth)}
                </Title>
              </Card>
            </Col>
          </Row>

          <Card title="资产 vs 负债" style={{ marginBottom: 16, borderRadius: 12 }}>
            <ReactECharts option={chartOption} style={{ height: 280 }} />
            <Text type="secondary">计算时间：{new Date(data.calculated_at).toLocaleString()}</Text>
          </Card>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card title="资产分类" style={{ borderRadius: 12 }}>
                {assetRows.length === 0 ? (
                  <Empty description="暂无资产账户" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <List
                    dataSource={assetRows}
                    renderItem={(item) => (
                      <List.Item>
                        <Text>{formatTypeLabel(item.type)}</Text>
                        <Text strong style={{ color: '#389e0d' }}>{formatMoney(item.amount)}</Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="负债分类" style={{ borderRadius: 12 }}>
                {liabilityRows.length === 0 ? (
                  <Empty description="暂无负债账户" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <List
                    dataSource={liabilityRows}
                    renderItem={(item) => (
                      <List.Item>
                        <Text>{formatTypeLabel(item.type)}</Text>
                        <Text strong style={{ color: '#cf1322' }}>{formatMoney(item.amount)}</Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>

          <Card title="账户明细" style={{ borderRadius: 12 }}>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={data.accounts}
              pagination={false}
              scroll={{ x: 520 }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
