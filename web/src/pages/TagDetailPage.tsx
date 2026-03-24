import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Empty, Spin, Tag as AntTag } from 'antd'
import { LeftOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { apiGet } from '../services/api'
import { useAuth } from '../App'

type ReportDirection = 'expense' | 'income'

interface CategoryBreakdownItem {
  category_id: string | null
  category_name: string
  category_icon: string
  category_color: string
  amount: number
  transaction_count: number
  ratio: number
}

interface TagDetailTransaction {
  id: string
  occurred_at: string
  amount: number
  merchant: string | null
  note: string | null
  transaction_type: string
  category_id: string | null
  category_name: string
  category_icon: string
  category_color: string
  tags: string[]
}

interface TagDetailResponse {
  direction: ReportDirection
  date_from: string
  date_to: string
  tag: {
    id: string
    name: string
    color: string
    parent_id: string | null
  }
  summary: {
    amount: number
    transaction_count: number
    avg_amount: number
    ratio: number
  }
  category_breakdown: CategoryBreakdownItem[]
  transactions: TagDetailTransaction[]
  note: string
}

const directionMeta: Record<ReportDirection, { label: string; accent: string }> = {
  expense: { label: '支出', accent: 'var(--accent-red)' },
  income: { label: '收入', accent: 'var(--accent-green)' },
}

export default function TagDetailPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { tagId } = useParams<{ tagId: string }>()
  const [searchParams] = useSearchParams()
  const bookId = user?.default_book_id

  const [data, setData] = useState<TagDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const direction = (searchParams.get('direction') === 'income' ? 'income' : 'expense') as ReportDirection
  const dateFrom = searchParams.get('date_from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const dateTo = searchParams.get('date_to') || new Date().toISOString().slice(0, 10)
  const meta = directionMeta[direction]

  useEffect(() => {
    if (!bookId || !tagId) {
      return
    }

    setLoading(true)
    apiGet<TagDetailResponse>(
      `/api/reports/tag-detail?book_id=${bookId}&tag_id=${tagId}&date_from=${dateFrom}&date_to=${dateTo}&direction=${direction}`
    )
      .then((response) => {
        setData({
          ...response,
          summary: {
            amount: Number(response.summary.amount),
            transaction_count: Number(response.summary.transaction_count),
            avg_amount: Number(response.summary.avg_amount),
            ratio: Number(response.summary.ratio),
          },
          category_breakdown: (response.category_breakdown || []).map((item) => ({
            ...item,
            amount: Number(item.amount),
            transaction_count: Number(item.transaction_count),
            ratio: Number(item.ratio),
          })),
          transactions: (response.transactions || []).map((item) => ({
            ...item,
            amount: Number(item.amount),
          })),
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [bookId, dateFrom, dateTo, direction, tagId])

  const getChartOption = () => {
    if (!data || data.category_breakdown.length === 0) {
      return {}
    }
    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      series: [{
        type: 'pie',
        radius: '62%',
        center: ['50%', '50%'],
        data: data.category_breakdown.map((item) => ({
          name: item.category_name,
          value: item.amount,
          itemStyle: { color: item.category_color || undefined },
        })),
        label: { show: true, formatter: '{b}: {d}%' },
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
        gap: 8,
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-light)',
        margin: '-16px -16px 16px -16px',
      }}>
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate(-1)} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>标签详情</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="标签详情加载失败" />
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 16, borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: 999, background: data.tag.color }} />
              <span style={{ fontSize: 18, fontWeight: 600 }}>{data.tag.name}</span>
              <AntTag color={direction === 'expense' ? 'red' : 'green'}>{meta.label}</AntTag>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>标签金额</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700, color: meta.accent }}>¥{data.summary.amount.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>方向占比</div>
                <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>{(data.summary.ratio * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>交易笔数</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600 }}>{data.summary.transaction_count} 笔</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>平均金额</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600 }}>¥{data.summary.avg_amount.toFixed(2)}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              统计区间：{data.date_from} 至 {data.date_to}
            </div>
          </Card>

          <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 12 }} message={data.note} />

          <Card style={{ marginBottom: 16, borderRadius: 12 }} title="类别构成">
            {data.category_breakdown.length === 0 ? (
              <Empty description="暂无类别数据" />
            ) : (
              <>
                <ReactECharts style={{ height: 280 }} option={getChartOption()} />
                <div style={{ marginTop: 8 }}>
                  {data.category_breakdown.map((item, idx) => (
                    <div
                      key={`${item.category_id || 'uncategorized'}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 0',
                        borderBottom: idx < data.category_breakdown.length - 1 ? '1px solid var(--border-light)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{item.category_icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{item.category_name}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {item.transaction_count} 笔 | 占标签 {(item.ratio * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ fontWeight: 600 }}>¥{item.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card style={{ borderRadius: 12 }} title="交易明细">
            {data.transactions.length === 0 ? (
              <Empty description="暂无交易明细" />
            ) : (
              data.transactions.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx < data.transactions.length - 1 ? '1px solid var(--border-light)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>
                        {item.merchant || item.note || '未命名交易'}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {new Date(item.occurred_at).toLocaleString()}
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <AntTag style={{ marginInlineEnd: 0 }}>
                          {item.category_icon} {item.category_name}
                        </AntTag>
                        {item.tags.map((tagName) => (
                          <AntTag key={`${item.id}-${tagName}`} style={{ marginInlineEnd: 0 }}>
                            #{tagName}
                          </AntTag>
                        ))}
                      </div>
                      {item.note && item.merchant ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>{item.note}</div>
                      ) : null}
                    </div>
                    <div style={{ fontWeight: 700, color: meta.accent }}>
                      ¥{item.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  )
}
