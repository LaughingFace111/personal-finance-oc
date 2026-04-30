import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Segmented, Typography, Spin, Empty, Select } from 'antd';
import ReactECharts from 'echarts-for-react';
import { apiGet } from '../services/api';
import { useAuth } from '../App';

const { Title, Text } = Typography;

const RANGE_OPTIONS = [
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
  { label: '12个月', value: 365 },
];

export default function AccountBalanceTrendPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const bookId = user?.default_book_id;

  const [range, setRange] = useState(30);
  const [viewType, setViewType] = useState('total');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);

    const params = new URLSearchParams({
      book_id: bookId,
      range: range.toString(),
    });
    if (accountId) {
      params.append('account_id', accountId);
    }

    apiGet(`/api/reports/account-balance-trend?${params}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [bookId, range, accountId]);

  const handleViewTypeChange = (vt: string) => {
    setViewType(vt);
    if (vt === 'total') {
      setAccountId(undefined);
    }
  };

  const handleRangeChange = (r: number) => {
    setRange(r);
  };

  // 图表配置
  const getChartOption = () => {
    if (!data?.points?.length) return {};

    const isMonthly = data.granularity === 'month';
    void isMonthly;
    const points = data.points;

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          return `${p.name}<br/>余额: ¥${p.value.toFixed(2)}`;
        },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: points.map((p: any) => p.label),
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) => `¥${(v / 1000).toFixed(0)}k`,
        },
      },
      series: [{
        type: 'line',
        data: points.map((p: any) => p.balance),
        smooth: true,
        areaStyle: { opacity: 0.1 },
        itemStyle: { color: '#1890ff' },
        lineStyle: { width: 2 },
      }],
    };
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
  }

  const summary = data?.summary || {};
  const accounts = data?.accounts || [];

  return (
    <div style={{ padding: 16 }}>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <Button type="text" onClick={() => navigate('/reports/home')} style={{ padding: 4 }}>
          ← 返回
        </Button>
        <Title level={4} style={{ margin: 0, flex: 1, textAlign: 'center' }}>账户余额趋势</Title>
        <div style={{ width: 60 }} />
      </div>

      {/* 视图切换 */}
      <Segmented
        options={[
          { label: '总资产', value: 'total' },
          { label: '单账户', value: 'account' },
        ]}
        value={viewType}
        onChange={(v) => handleViewTypeChange(v as string)}
        style={{ marginBottom: 16, width: '100%' }}
      />

      {/* 账户选择 */}
      {viewType === 'account' && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择账户"
            value={accountId}
            onChange={setAccountId}
            options={accounts.map((a: any) => ({ label: a.name, value: a.id }))}
          />
        </Card>
      )}

      {/* 时间范围切换 */}
      <Segmented
        options={RANGE_OPTIONS}
        value={range}
        onChange={(v) => handleRangeChange(v as number)}
        style={{ marginBottom: 16, width: '100%' }}
      />

      {/* 汇总信息 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
          <div>
            <Text type="secondary">当前余额</Text>
            <Title level={4} style={{ margin: '4px 0' }}>¥{summary.current_balance?.toFixed(2) || '0.00'}</Title>
          </div>
          <div>
            <Text type="secondary">起点余额</Text>
            <Title level={4} style={{ margin: '4px 0' }}>¥{summary.start_balance?.toFixed(2) || '0.00'}</Title>
          </div>
          <div>
            <Text type="secondary">变化额</Text>
            <Title level={4} style={{ 
              margin: '4px 0',
              color: (summary.change_amount || 0) >= 0 ? '#52c41a' : '#ff4d4f'
            }}>
              {summary.change_amount >= 0 ? '+' : ''}¥{summary.change_amount?.toFixed(2) || '0.00'}
            </Title>
          </div>
        </div>
        {summary.change_rate_label && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text type="secondary">变化率: </Text>
            <Text style={{ color: summary.change_rate && summary.change_rate > 0 ? '#52c41a' : '#ff4d4f' }}>
              {summary.change_rate_label}
            </Text>
          </div>
        )}
      </Card>

      {/* 趋势图 */}
      <Card title="余额趋势">
        {data?.points?.length > 0 ? (
          <ReactECharts option={getChartOption()} style={{ height: 300 }} />
        ) : (
          <Empty description="暂无趋势数据" />
        )}
      </Card>
    </div>
  );
}
