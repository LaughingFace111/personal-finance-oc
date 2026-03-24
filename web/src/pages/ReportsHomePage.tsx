import { useNavigate } from 'react-router-dom'
import { Card, Row, Col } from 'antd'
import { PieChartOutlined, DotChartOutlined, TableOutlined, LineChartOutlined } from '@ant-design/icons'

const reports = [
  {
    key: 'monthly-summary',
    title: '月收支统计表',
    path: '/reports/monthly-summary',
    icon: <TableOutlined style={{ fontSize: 32, color: '#1677ff' }} />,
    desc: '查看每月收支汇总与趋势'
  },
  {
    key: 'expense-distribution',
    title: '支出分布图',
    path: '/reports/expense-distribution',
    icon: <PieChartOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />,
    desc: '分析支出类别占比'
  },
  {
    key: 'income-distribution',
    title: '收入分布图',
    path: '/reports/income-distribution',
    icon: <PieChartOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    desc: '分析收入类别占比'
  },
  {
    key: 'monthly-comparison',
    title: '月收支对比表',
    path: '/reports/monthly-comparison',
    icon: <DotChartOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    desc: '对比全年各月收支情况'
  },
  {
    key: 'tag-distribution',
    title: '标签分布图',
    path: '/reports/tag-distribution',
    icon: <PieChartOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
    desc: '分析标签维度金额分布'
  },
  {
    key: 'account-balance-trend',
    title: '账户余额趋势',
    path: '/reports/account-balance-trend',
    icon: <LineChartOutlined style={{ fontSize: 32, color: '#13c2c2' }} />,
    desc: '查看账户资产变化趋势'
  }
]

export default function ReportsHomePage() {
  const navigate = useNavigate()

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
        选择报表类型
      </div>
      <Row gutter={[16, 16]}>
        {reports.map(report => (
          <Col span={12} key={report.key}>
            <Card
              hoverable
              onClick={() => navigate(report.path)}
              style={{ textAlign: 'center', borderRadius: 12 }}
              bodyStyle={{ padding: 20 }}
            >
              <div style={{ marginBottom: 8 }}>{report.icon}</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{report.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{report.desc}</div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
