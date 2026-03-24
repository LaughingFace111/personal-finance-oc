import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import { apiGet } from '../services/api'

type TrendType = 'INCREASE' | 'DECREASE' | 'STABLE' | 'NEW' | 'CLEARED'

interface TopContributor {
  categoryId: string
  categoryName: string
  monthAmount: number
  prevMonthAmount: number
  changeAmount: number
}

interface CategoryMonthlyInsight {
  categoryId: string
  categoryName: string
  monthAmount: number
  prevMonthAmount: number
  changeAmount: number
  changeRate: number
  trendType: TrendType
  topContributors: TopContributor[]
  summaryText: string
}

interface CategoryMonthlyInsightCardProps {
  bookId: string
  categoryId: string
  year: number
  month: number
  direction?: 'expense' | 'income'
}

const trendMeta: Record<TrendType, { label: string; color: string; background: string }> = {
  INCREASE: {
    label: '上涨',
    color: 'var(--accent-red)',
    background: 'color-mix(in srgb, var(--accent-red) 14%, transparent)',
  },
  DECREASE: {
    label: '下降',
    color: 'var(--accent-green)',
    background: 'color-mix(in srgb, var(--accent-green) 14%, transparent)',
  },
  STABLE: {
    label: '持平',
    color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)',
  },
  NEW: {
    label: '新增',
    color: 'var(--accent-orange)',
    background: 'color-mix(in srgb, var(--accent-orange) 14%, transparent)',
  },
  CLEARED: {
    label: '清零',
    color: 'var(--accent-color)',
    background: 'color-mix(in srgb, var(--accent-color) 14%, transparent)',
  },
}

const formatAmount = (amount: number) => `¥${amount.toFixed(2)}`

export default function CategoryMonthlyInsightCard({
  bookId,
  categoryId,
  year,
  month,
  direction = 'expense',
}: CategoryMonthlyInsightCardProps) {
  const [data, setData] = useState<CategoryMonthlyInsight | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)

    apiGet<CategoryMonthlyInsight>(
      `/api/reports/category-insight?book_id=${bookId}&category_id=${categoryId}&year=${year}&month=${month}&direction=${direction}`
    )
      .then((response) => {
        if (!active) return
        setData(response)
      })
      .catch(() => {
        if (!active) return
        setData(null)
        setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [bookId, categoryId, year, month, direction])

  if (loading) {
    return (
      <div style={{
        marginTop: 10,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-light)',
        textAlign: 'center',
      }}>
        <Spin size="small" />
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const meta = trendMeta[data.trendType]

  return (
    <div style={{
      marginTop: 10,
      padding: '12px 14px',
      borderRadius: 12,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{data.categoryName}月报</div>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: meta.color,
          background: meta.background,
        }}>
          {meta.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>本月</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{formatAmount(data.monthAmount)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>上月</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{formatAmount(data.prevMonthAmount)}</div>
        </div>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {data.summaryText}
      </div>
    </div>
  )
}
