import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Segmented, Spin, Empty } from 'antd'
import { LeftOutlined, RightOutlined, HomeOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { apiGet } from '../services/api'
import { useAuth } from '../App'

export default function MonthlySummaryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const bookId = user?.default_book_id

  const [currentDate, setCurrentDate] = useState(new Date())
  const [overview, setOverview] = useState<any>({})
  const [categoryData, setCategoryData] = useState<{ expense: any[]; income: any[] }>({ expense: [], income: [] })
  const [loading, setLoading] = useState(true)
  const [viewType, setViewType] = useState<'expense' | 'income'>('expense')

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

    Promise.all([
      apiGet(`/api/reports/overview?book_id=${bookId}&date_from=${firstDay}&date_to=${lastDay}`),
      apiGet(`/api/reports/expense-by-category?book_id=${bookId}&date_from=${firstDay}&date_to=${lastDay}`),
      apiGet(`/api/reports/income-by-category?book_id=${bookId}&date_from=${firstDay}&date_to=${lastDay}`)
    ]).then(([overviewData, expenseData, incomeData]) => {
      setOverview(overviewData || {})
      // 合并支出和收入数据
      const expenseList = (expenseData || []).map((item: any) => ({ ...item, type: 'expense' }))
      const incomeList = (incomeData || []).map((item: any) => ({ ...item, type: 'income' }))
      setCategoryData({ expense: expenseList, income: incomeList })
    }).catch(() => {
      setOverview({})
      setCategoryData({ expense: [], income: [] })
    }).finally(() => setLoading(false))
  }, [bookId, year, month])

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1))
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1))
  const goToCurrentMonth = () => setCurrentDate(new Date())

  const income = Number(overview.income || 0)
  const expense = Number(overview.net_expense || 0)
  const net = income - expense
  const total = viewType === 'expense' ? expense : income

  // 排序数据
  const sortedData = categoryData[viewType]?.slice().sort((a: any, b: any) => {
    const aVal = viewType === 'expense' ? a.net_amount : a.amount
    const bVal = viewType === 'expense' ? b.net_amount : b.amount
    return bVal - aVal
  }) || []

  // 环形图配置
  const getChartOption = () => {
    if (sortedData.length === 0) return {}

    const chartData = sortedData.map((item: any) => ({
      name: item.name,
      value: viewType === 'expense' ? Number(item.net_amount) : Number(item.amount)
    }))

    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        data: chartData,
        label: { show: false },
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 }
      }]
    }
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  // 生成横向月份切换条
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
          <span style={{ fontSize: 16, fontWeight: 600 }}>收支统计表</span>
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <Card style={{ marginBottom: 16, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>结余</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  ¥{net.toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>收入</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent-green)' }}>¥{income.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>支出</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent-red)' }}>¥{expense.toFixed(2)}</div>
              </div>
            </div>
            {/* 收支比例条 */}
            <div style={{ height: 8, borderRadius: 4, background: 'var(--border-light)', overflow: 'hidden', display: 'flex' }}>
              {expense > 0 && (
                <div style={{
                  width: `${Math.min(100, (expense / (income + expense || 1)) * 100)}%`,
                  background: 'var(--accent-red)',
                  transition: 'width 0.3s'
                }} />
              )}
              {income > 0 && (
                <div style={{ flex: 1, background: 'var(--accent-green)', transition: 'width 0.3s' }} />
              )}
            </div>
          </Card>

          {/* 切换区 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Segmented
              value={viewType}
              onChange={(val) => setViewType(val as 'expense' | 'income')}
              options={[
                { label: '支出', value: 'expense' },
                { label: '收入', value: 'income' }
              ]}
            />
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>按金额排序</span>
          </div>

          {/* 主图表 - 环形图 */}
          {sortedData.length > 0 ? (
            <Card style={{ marginBottom: 16, borderRadius: 12 }}>
              <ReactECharts
                style={{ height: 280 }}
                option={{
                  ...getChartOption(),
                  graphic: [{
                    type: 'text',
                    left: 'center',
                    top: 'center',
                    style: {
                      text: `¥${total.toFixed(0)}`,
                      fontSize: 20,
                      fontWeight: 600,
                      fill: 'var(--text-primary)'
                    }
                  }]
                }}
              />
            </Card>
          ) : (
            <Card style={{ marginBottom: 16, borderRadius: 12 }}>
              <Empty description={viewType === 'expense' ? '本月暂无支出' : '本月暂无收入'} />
            </Card>
          )}

          {/* 分类明细列表 */}
          <Card style={{ borderRadius: 12 }} title="分类明细">
            {sortedData.length > 0 ? sortedData.map((item: any, idx: number) => {
              const amount = viewType === 'expense' ? Number(item.net_amount) : Number(item.amount)
              const percent = total > 0 ? (amount / total * 100).toFixed(1) : '0'
              return (
                <div key={item.id || idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: idx < sortedData.length - 1 ? '1px solid var(--border-light)' : 'none'
                }}>
                  <span style={{ fontSize: 18, marginRight: 8 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{percent}%</div>
                  </div>
                  <div style={{ fontWeight: 500, color: viewType === 'expense' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    ¥{amount.toFixed(2)}
                  </div>
                </div>
              )
            }) : <Empty description="暂无数据" />}
          </Card>
        </>
      )}
    </div>
  )
}
