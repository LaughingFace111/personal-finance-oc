import { useState, useEffect } from 'react'
import { Table, Card, Row, Col, Statistic, Tag } from 'antd'
import { BankOutlined } from '@ant-design/icons'
import { loansAPI } from '../services/api'
import { useAuth } from '../App'

export default function Loans() {
  const { user } = useAuth()
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState<string>('')

  useEffect(() => {
    if (user?.default_book_id) {
      setBookId(user.default_book_id)
    }
  }, [user])

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    loansAPI.list(bookId).then(res => {
      setLoans(res || [])
    }).catch(() => setLoans([])).finally(() => setLoading(false))
  }, [bookId])

  const columns = [
    { title: '贷款名称', dataIndex: 'loan_name', key: 'loan_name' },
    { title: '总额', dataIndex: 'principal_total', key: 'principal_total', render: (v: number) => `¥${v?.toFixed(2) || 0}` },
    { title: '剩余本金', dataIndex: 'principal_remaining', key: 'principal_remaining', render: (v: number) => `¥${v?.toFixed(2) || 0}` },
    { title: '月供', dataIndex: 'monthly_payment_estimated', key: 'monthly_payment_estimated', render: (v: number) => `¥${v?.toFixed(2) || 0}` },
    { title: '已还期数', dataIndex: 'current_period', key: 'current_period' },
    { title: '总期数', dataIndex: 'total_periods', key: 'total_periods' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => 
      <Tag color={v === 'active' ? 'blue' : v === 'completed' ? 'green' : 'red'}>{v}</Tag> },
  ]

  const totalPrincipal = loans.reduce((sum, l) => sum + (l.principal_remaining || 0), 0)
  const totalPayment = loans.reduce((sum, l) => sum + (l.monthly_payment_estimated || 0), 0)

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>贷款管理</h2>
      
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="贷款笔数" value={loans.length} prefix={<BankOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="剩余本金总额" value={totalPrincipal} precision={2} prefix={<BankOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="月供总额" value={totalPayment} precision={2} prefix={<BankOutlined />} />
          </Card>
        </Col>
      </Row>

      <Table columns={columns} dataSource={loans} loading={loading} rowKey="id" />
    </div>
  )
}
