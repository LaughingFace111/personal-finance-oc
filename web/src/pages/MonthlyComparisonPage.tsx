import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Spin, Empty, Row, Col } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { apiGet } from '../services/api'
import { useAuth } from '../App'

export default function MonthlyComparisonPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const bookId = user?.default_book_id

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [yearData, setYearData] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bookId) return
    setLoading(true)

    apiGet(`/api/reports/monthly-comparison?book_id=${bookId}&year=${currentYear}`)
      .then(data => {
        setYearData(data || {})
      })
      .catch(() => setYearData({}))
      .finally(() => setLoading(false))
  }, [bookId, currentYear])

  const goToPrevYear = () => setCurrentYear(currentYear - 1)
  const goToNextYear = () => setCurrentYear(currentYear + 1)

  const months = yearData.months || []
  const totalIncome = yearData.total_income || 0
  const totalExpense = yearData.total_expense || 0
  const totalNet = yearData.total_net || 0

  // 横向条形图配置
  const getChartOption = () => {
    if (months.length === 0) return {}

    const monthLabels = months.map((m: any) => m.month_str)
    const incomeData = months.map((m: any) => m.income)
    const expenseData = months.map((m: any) => m.expense)
    const netData = months.map((m: any) => m.net)

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const idx = params[0].dataIndex
          const m = months[idx]
          return `${m.month_str}<br/>
            收入: ¥${m.income.toFixed(2)}<br/>
            支出: ¥${m.expense.toFixed(2)}<br/>
            节余: ¥${m.net.toFixed(2)}`
        }
      },
      legend: {
        data: ['收入', '支出', '节余'],
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => `¥${value}`
        }
      },
      yAxis: {
        type: 'category',
        data: monthLabels
      },
      series: [
        {
          name: '收入',
          type: 'bar',
          data: incomeData,
          itemStyle: { color: '#ff4d4f' },
          barGap: '5%'
        },
        {
          name: '支出',
          type: 'bar',
          data: expenseData,
          itemStyle: { color: '#52c41a' }
        },
        {
          name: '节余',
          type: 'bar',
          data: netData,
          itemStyle: { color: '#722ed1' }
        }
      ]
    }
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 顶部导航 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-light)',
        margin: '-16px -16px 16px -16px',
      }}>
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/reports/home')} />
        <span style={{ fontSize: 16, fontWeight: 600, marginLeft: 8 }}>月收支对比表</span>
      </div>

      {/* 年份选择 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '8px 12px',
        background: 'var(--bg-card)',
        borderRadius: 12
      }}>
        <Button type="text" icon={<LeftOutlined />} onClick={goToPrevYear} />
        <span style={{ fontWeight: 500 }}>{currentYear}年</span>
        <Button type="text" icon={<RightOutlined />} onClick={goToNextYear} />
      </div>

      {/* 图例说明 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ff4d4f' }} />
          <span style={{ fontSize: 13 }}>收入</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: '#52c41a' }} />
          <span style={{ fontSize: 13 }}>支出</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: '#722ed1' }} />
          <span style={{ fontSize: 13 }}>节余</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : months.length === 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="暂无数据" />
        </Card>
      ) : (
        <>
          {/* 年度汇总卡片 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>总收入</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#ff4d4f' }}>
                  ¥{totalIncome.toFixed(2)}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>总支出</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#52c41a' }}>
                  ¥{totalExpense.toFixed(2)}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>总节余</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: totalNet >= 0 ? '#722ed1' : '#ff4d4f' }}>
                  ¥{totalNet.toFixed(2)}
                </div>
              </Card>
            </Col>
          </Row>

          {/* 主图表 - 横向条形图 */}
          <Card style={{ borderRadius: 12 }}>
            <ReactECharts style={{ height: 450 }} option={getChartOption()} />
          </Card>

          {/* 月度明细表格 */}
          <Card style={{ borderRadius: 12, marginTop: 16 }} title="月度明细">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid var(--border-light)',
              fontSize: 12,
              color: 'var(--text-tertiary)'
            }}>
              <span style={{ width: 50 }}>月份</span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                <span style={{ width: 90, textAlign: 'right' }}>收入</span>
                <span style={{ width: 90, textAlign: 'right' }}>支出</span>
                <span style={{ width: 90, textAlign: 'right' }}>节余</span>
              </div>
            </div>
            {months.map((m: any, idx: number) => (
              <div key={m.month} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: idx < months.length - 1 ? '1px solid var(--border-light)' : 'none'
              }}>
                <span style={{ width: 50, fontWeight: 500 }}>{m.month_str}</span>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                  <span style={{ color: '#ff4d4f', width: 90, textAlign: 'right' }}>
                    ¥{m.income.toFixed(2)}
                  </span>
                  <span style={{ color: '#52c41a', width: 90, textAlign: 'right' }}>
                    ¥{m.expense.toFixed(2)}
                  </span>
                  <span style={{ 
                    color: m.net >= 0 ? '#722ed1' : '#ff4d4f', 
                    width: 90, 
                    textAlign: 'right',
                    fontWeight: 500 
                  }}>
                    ¥{m.net.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
