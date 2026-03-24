import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Empty, Segmented, Spin } from 'antd'
import { LeftOutlined, RightOutlined, TagsOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { apiGet } from '../services/api'
import { useAuth } from '../App'

type ReportDirection = 'expense' | 'income'

interface TagDistributionItem {
  tag_id: string
  tag_name: string
  tag_color: string
  parent_id: string | null
  amount: number
  transaction_count: number
  avg_amount: number
  ratio: number
}

interface TagDistributionResponse {
  direction: ReportDirection
  date_from: string
  date_to: string
  total_direction_amount: number
  items: TagDistributionItem[]
  note: string
}

const directionMeta: Record<ReportDirection, { label: string; totalLabel: string; emptyText: string; accent: string }> = {
  expense: { label: '支出', totalLabel: '支出总额', emptyText: '本月暂无标签支出', accent: 'var(--accent-red)' },
  income: { label: '收入', totalLabel: '收入总额', emptyText: '本月暂无标签收入', accent: 'var(--accent-green)' },
}

const formatLocalDate = (value: Date) => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function TagDistributionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const bookId = user?.default_book_id

  const [currentDate, setCurrentDate] = useState(new Date())
  const [direction, setDirection] = useState<ReportDirection>('expense')
  const [data, setData] = useState<TagDistributionResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const monthStr = `${year}年${month}月`
  const meta = directionMeta[direction]

  const getMonthOptions = () => {
    const options: { value: Date; label: string }[] = []
    for (let i = -3; i <= 3; i++) {
      const d = new Date(year, month - 1 + i, 1)
      options.push({ value: d, label: `${d.getFullYear()}/${d.getMonth() + 1}` })
    }
    return options
  }

  useEffect(() => {
    if (!bookId) {
      return
    }

    setLoading(true)
    const firstDay = formatLocalDate(new Date(year, month - 1, 1))
    const lastDay = formatLocalDate(new Date(year, month, 0))

    apiGet<TagDistributionResponse>(
      `/api/reports/tags-by-category?book_id=${bookId}&date_from=${firstDay}&date_to=${lastDay}&direction=${direction}`
    )
      .then((response) => {
        setData({
          ...response,
          total_direction_amount: Number(response.total_direction_amount),
          items: (response.items || []).map((item) => ({
            ...item,
            amount: Number(item.amount),
            avg_amount: Number(item.avg_amount),
            ratio: Number(item.ratio),
          })),
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [bookId, direction, month, year])

  const sortedItems = (data?.items || []).slice().sort((a, b) => b.amount - a.amount)

  const openDetail = (tagId: string) => {
    const firstDay = formatLocalDate(new Date(year, month - 1, 1))
    const lastDay = formatLocalDate(new Date(year, month, 0))
    navigate(`/reports/tag-detail/${tagId}?direction=${direction}&date_from=${firstDay}&date_to=${lastDay}`)
  }

  const getChartOption = () => {
    if (sortedItems.length === 0) {
      return {}
    }

    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: ['36%', '66%'],
        center: ['50%', '46%'],
        data: sortedItems.map((item) => ({
          name: item.tag_name,
          value: item.amount,
          itemStyle: { color: item.tag_color || undefined },
          tagId: item.tag_id,
        })),
        label: {
          show: true,
          formatter: '{b}: {d}%',
          color: 'var(--text-primary)',
        },
        itemStyle: {
          borderRadius: 10,
          borderColor: 'var(--bg-card)',
          borderWidth: 2,
        },
      }],
    }
  }

  if (!bookId) {
    return <div style={{ padding: 16 }}>加载中...</div>
  }

  return (
    <div style={{ paddingBottom: 80 }}>
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
          <span style={{ fontSize: 16, fontWeight: 600 }}>标签分布图</span>
        </div>
        <Segmented
          size="small"
          value={direction}
          onChange={(value) => setDirection(value as ReportDirection)}
          options={[
            { label: '支出', value: 'expense' },
            { label: '收入', value: 'income' },
          ]}
        />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '8px 12px',
        background: 'var(--bg-card)',
        borderRadius: 12,
      }}>
        <Button type="text" icon={<LeftOutlined />} onClick={() => setCurrentDate(new Date(year, month - 2, 1))} />
        <span style={{ fontWeight: 500 }}>{monthStr}</span>
        <Button type="text" icon={<RightOutlined />} onClick={() => setCurrentDate(new Date(year, month, 1))} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {getMonthOptions().map((opt, idx) => {
          const selected = opt.value.getFullYear() === year && opt.value.getMonth() + 1 === month
          return (
            <div
              key={idx}
              onClick={() => setCurrentDate(opt.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 16,
                background: selected ? 'var(--accent-color)' : 'var(--bg-elevated)',
                color: selected ? '#fff' : 'var(--text-primary)',
                fontSize: 13,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </div>
          )
        })}
      </div>

      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{meta.totalLabel}</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: meta.accent }}>
            ¥{Number(data?.total_direction_amount || 0).toFixed(2)}
          </span>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
          命中标签 {sortedItems.length} 个
        </div>
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 12 }}
        message={data?.note || '一笔交易可命中多个标签，标签金额之和可能大于总额。'}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : sortedItems.length === 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description={meta.emptyText} />
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16, borderRadius: 12 }}>
            <ReactECharts
              style={{ height: 320 }}
              option={getChartOption()}
              onEvents={{
                click: (params: { data?: { tagId?: string } }) => {
                  const tagId = params.data?.tagId
                  if (tagId) {
                    openDetail(tagId)
                  }
                },
              }}
            />
          </Card>

          <Card style={{ borderRadius: 12 }} title={`${meta.label}标签排名`}>
            {sortedItems.map((item, idx) => (
              <div
                key={item.tag_id}
                onClick={() => openDetail(item.tag_id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 0',
                  borderBottom: idx < sortedItems.length - 1 ? '1px solid var(--border-light)' : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: item.tag_color || '#1677ff',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TagsOutlined style={{ color: 'var(--text-tertiary)' }} />
                    {item.tag_name}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {item.transaction_count} 笔 | 均额 ¥{item.avg_amount.toFixed(2)} | 占比 {(item.ratio * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: meta.accent }}>
                  ¥{item.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
