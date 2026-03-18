import { Card, Row, Col, Statistic, Table, Tag } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, WalletOutlined, CreditCardOutlined, BankOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { reportsAPI } from '../services/api'
import { useAuth } from '../App'
import dayjs from 'dayjs'

export default function Dashboard() {
  const { user } = useAuth()
  const [overview, setOverview] = useState<any>({})
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState<string>('')

  useEffect(() => {
    if (user?.default_book_id) {
      setBookId(user.default_book_id)
    }
  }, [user])

  useEffect(() => {
    if (!bookId) return
    
    const today = dayjs()
    const dateFrom = today.startOf('month').format('YYYY-MM-DD')
    const dateTo = today.format('YYYY-MM-DD')

    Promise.all([
      reportsAPI.overview(bookId, dateFrom, dateTo),
      reportsAPI.expenseByCategory(bookId, dateFrom, dateTo),
    ]).then(([overviewData, expenseData]) => {
      setOverview(overviewData || {})
      setExpenses(expenseData || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [bookId])

  const columns = [
    { title: '分类', dataIndex: 'name', key: 'name', render: (v: string, r: any) => `${r.icon || ''} ${v}` },
    { title: '金额', dataIndex: 'net_amount', key: 'net_amount', 
      render: (v: number) => v !== undefined ? `¥${v?.toFixed(2) || 0}` : '-' },
  ]

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 16 }}>本月概览</h2>
      
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="本月收入"
              value={overview.income || 0}
              precision={2}
              prefix={<ArrowUpOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="本月支出"
              value={overview.net_expense || 0}
              precision={2}
              prefix={<ArrowDownOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: '#f5222d', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="总资产"
              value={overview.total_assets || 0}
              precision={2}
              prefix={<WalletOutlined />}
              valueStyle={{ fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="总负债"
              value={overview.total_debt || 0}
              precision={2}
              prefix={<CreditCardOutlined />}
              valueStyle={{ color: overview.total_debt > 0 ? '#f5222d' : undefined, fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="本月支出分类" loading={loading} style={{ height: '100%' }}>
            <Table
              dataSource={expenses}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ y: 200 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="账户概览" loading={loading} style={{ height: '100%' }}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="现金类账户" value={overview.total_assets || 0} precision={2} prefix={<WalletOutlined />} />
              </Col>
              <Col span={12}>
                <Statistic title="信用负债" value={overview.total_credit_debt || 0} precision={2} prefix={<CreditCardOutlined />} />
              </Col>
              <Col span={12} style={{ marginTop: 16 }}>
                <Statistic title="贷款负债" value={overview.total_loan_debt || 0} precision={2} prefix={<BankOutlined />} />
              </Col>
              <Col span={12} style={{ marginTop: 16 }}>
                <Statistic title="净资产" value={(overview.total_assets || 0) - (overview.total_debt || 0)} precision={2} prefix={<WalletOutlined />} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
