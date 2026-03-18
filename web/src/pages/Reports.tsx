import { useState, useEffect } from 'react'
import { Card, Row, Col, DatePicker, Button } from 'antd'
import ReactECharts from 'echarts-for-react'
import { reportsAPI } from '../services/api'
import { useAuth } from '../App'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function Reports() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>({})
  const [expenses, setExpenses] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [dateRange, setDateRange] = useState<[string, string]>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD')
  ])
  const [bookId, setBookId] = useState<string>('')

  useEffect(() => {
    if (user?.default_book_id) {
      setBookId(user.default_book_id)
    }
  }, [user])

  const fetchData = () => {
    if (!bookId) return
    setLoading(true)
    Promise.all([
      reportsAPI.overview(bookId, dateRange[0], dateRange[1]),
      reportsAPI.expenseByCategory(bookId, dateRange[0], dateRange[1]),
      reportsAPI.accounts(bookId),
    ]).then(([overviewData, expenseData, accountsData]) => {
      setOverview(overviewData || {})
      setExpenses(expenseData || [])
      setAccounts(accountsData || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (bookId) fetchData()
  }, [bookId, dateRange])

  const expenseChartOption = {
    tooltip: { trigger: 'item' },
    legend: { top: '5%', left: 'center' },
    series: [
      {
        name: '支出分类',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold' } },
        data: expenses.map(e => ({ value: e.net_amount || e.gross_amount || 0, name: e.name }))
      }
    ]
  }

  const accountChartOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: accounts.map(a => a.name) },
    yAxis: { type: 'value' },
    series: [
      { name: '余额', type: 'bar', data: accounts.map(a => a.balance || 0) },
      { name: '负债', type: 'bar', data: accounts.map(a => a.debt || 0) }
    ]
  }

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>报表中心</h2>
        <RangePicker 
          value={[dayjs(dateRange[0]), dayjs(dateRange[1])]} 
          onChange={(dates) => {
            if (dates) {
              setDateRange([dates[0]!.format('YYYY-MM-DD'), dates[1]!.format('YYYY-MM-DD')])
            }
          }} 
        />
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Card.Meta title="收入" description={`¥${overview.income?.toFixed(2) || 0}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Card.Meta title="支出" description={`¥${overview.net_expense?.toFixed(2) || 0}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Card.Meta title="结余" description={`¥${overview.net?.toFixed(2) || 0}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Card.Meta title="总资产" description={`¥${overview.total_assets?.toFixed(2) || 0}`} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="支出分类" loading={loading}>
            <ReactECharts option={expenseChartOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="账户余额" loading={loading}>
            <ReactECharts option={accountChartOption} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
