import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Spin, Empty } from 'antd'
import { LeftOutlined, RightOutlined, HomeOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { apiGet } from '../services/api'
import { useAuth } from '../App'

export default function IncomeDistributionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const bookId = user?.default_book_id

  const [currentDate, setCurrentDate] = useState(new Date())
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const monthStr = `${year}年${month}月`

  const formatLocalDate = (value: Date) => {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 生成前后各3个月的选项
  const getMonthOptions = () => {
    const options: { value: Date; label: string }[] = []
    for (let i = -3; i <= 3; i++) {
      const d = new Date(year, month - 1 + i, 1)
      options.push({
        value: d,
        label: `${d.getFullYear()}/${d.getMonth() + 1}`
      })
    }
    return options
  }

  useEffect(() => {
    if (!bookId) return
    setLoading(true)

    const firstDay = formatLocalDate(new Date(year, month - 1, 1))
    const lastDay = formatLocalDate(new Date(year, month, 0))

    apiGet(`/api/reports/income-by-category?book_id=${bookId}&date_from=${firstDay}&date_to=${lastDay}`)
      .then(data => {
        const list = (data || []).map((item: any) => ({
          ...item,
          amount: Number(item.amount)
        }))
        setCategoryData(list)
      })
      .catch(() => setCategoryData([]))
      .finally(() => setLoading(false))
  }, [bookId, year, month])

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1))
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1))
  const goToCurrentMonth = () => setCurrentDate(new Date())

  // 按金额降序排序
  const sortedData = categoryData.slice().sort((a, b) => b.amount - a.amount)
  const totalIncome = sortedData.reduce((sum, item) => sum + item.amount, 0)

  // 饼图配置
  const getChartOption = () => {
    if (sortedData.length === 0) return {}

    const chartData = sortedData.map(item => ({
      name: item.name,
      value: item.amount
    }))

    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { orient: 'vertical', right: 10, top: 'center', show: false },
      series: [{
        type: 'pie',
        radius: '60%',
        center: ['50%', '50%'],
        data: chartData,
        label: {
          show: true,
          formatter: '{b}: {d}%',
          fontSize: 12
        },
        labelLine: { show: true },
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 }
      }]
    }
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  const monthOptions = getMonthOptions()

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 顶部导航 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-light)',
        margin: '-16px -16px 16px -16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/reports/home')} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>收入分布图</span>
        </div>
        <Button type="text" icon={<HomeOutlined />} onClick={goToCurrentMonth} />
      </div>

      {/* 月份切换条 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '8px 12px',
        background: 'var(--bg-card)',
        borderRadius: 12
      }}>
        <Button type="text" icon={<LeftOutlined />} onClick={goToPrevMonth} />
        <span style={{ fontWeight: 500 }}>{monthStr}</span>
        <Button type="text" icon={<RightOutlined />} onClick={goToNextMonth} />
      </div>

      {/* 月份快捷选择 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        overflowX: 'auto',
        paddingBottom: 4
      }}>
        {monthOptions.map((opt, idx) => (
          <div
            key={idx}
            onClick={() => setCurrentDate(opt.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 16,
              background: opt.value.getFullYear() === year && opt.value.getMonth() + 1 === month
                ? 'var(--accent-color)'
                : 'var(--bg-elevated)',
              color: opt.value.getFullYear() === year && opt.value.getMonth() + 1 === month
                ? '#fff'
                : 'var(--text-primary)',
              fontSize: 13,
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>

      {/* 统计概览 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderRadius: 12
      }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>收入合计</span>
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-green)' }}>
          ¥{totalIncome.toFixed(2)}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : sortedData.length === 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="本月暂无收入" />
        </Card>
      ) : (
        <>
          {/* 主图表 - 饼图 */}
          <Card style={{ marginBottom: 16, borderRadius: 12 }}>
            <ReactECharts style={{ height: 300 }} option={getChartOption()} />
          </Card>

          {/* 排名列表 */}
          <Card style={{ borderRadius: 12 }} title="收入排名">
            {sortedData.map((item, idx) => {
              const percent = totalIncome > 0 ? (item.amount / totalIncome * 100).toFixed(1) : '0'
              return (
                <div key={item.id || idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: idx < sortedData.length - 1 ? '1px solid var(--border-light)' : 'none'
                }}>
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    background: idx < 3 ? 'var(--accent-green)' : 'var(--bg-elevated)',
                    color: idx < 3 ? '#fff' : 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 500,
                    marginRight: 12
                  }}>
                    {idx + 1}
                  </div>
                  <span style={{ fontSize: 18, marginRight: 8 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{percent}%</div>
                  </div>
                  <div style={{ fontWeight: 500, color: 'var(--accent-green)' }}>
                    ¥{item.amount.toFixed(2)}
                  </div>
                </div>
              )
            })}
          </Card>
        </>
      )}
    </div>
  )
}
