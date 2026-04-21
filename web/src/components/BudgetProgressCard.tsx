import type { ReactNode } from 'react'
import { Card, Progress, Tag } from 'antd'

export interface BudgetSummary {
  id: string
  name: string
  period_type: 'monthly' | 'custom_range'
  dimension_type: 'overall' | 'category' | 'tag'
  amount: string | number
  start_date: string
  end_date: string
  category_id?: string | null
  category_name?: string | null
  tag_id?: string | null
  tag_name?: string | null
  rollup_children?: boolean
  status: 'active' | 'archived'
  spent_amount: string | number
  remaining_amount: string | number
  usage_ratio: number
  alert_status: 'normal' | 'warning' | 'exceeded'
}

const alertMeta = {
  normal: { color: '#1677ff', tag: '正常' },
  warning: { color: '#fa8c16', tag: '预警' },
  exceeded: { color: '#ff4d4f', tag: '超支' },
} as const

const toMoney = (value: string | number) =>
  Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatBudgetPeriod = (budget: Pick<BudgetSummary, 'period_type' | 'start_date' | 'end_date'>) => {
  if (budget.period_type === 'monthly') {
    const [year, month] = budget.start_date.split('-')
    return `${year}年${Number(month)}月`
  }
  return `${budget.start_date} 至 ${budget.end_date}`
}

export default function BudgetProgressCard({
  budget,
  extra,
}: {
  budget: BudgetSummary
  extra?: ReactNode
}) {
  const meta = alertMeta[budget.alert_status] || alertMeta.normal
  const percent = Math.min(100, Math.round((budget.usage_ratio || 0) * 100))
  const dimensionLabel = budget.dimension_type === 'category'
    ? `分类预算${budget.category_name ? ` · ${budget.category_name}` : ''}`
    : budget.dimension_type === 'tag'
      ? `标签预算${budget.tag_name ? ` · ${budget.tag_name}` : ''}`
      : '总预算'

  return (
    <Card
      size="small"
      style={{
        borderRadius: 16,
        borderColor: 'var(--border-color)',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-card)',
      }}
      bodyStyle={{ padding: 18 }}
      extra={extra}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{budget.name}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            {formatBudgetPeriod(budget)}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {dimensionLabel}
          </div>
        </div>
        <Tag color={meta.color}>{meta.tag}</Tag>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>预算</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600 }}>¥{toMoney(budget.amount)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>已花费</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: meta.color }}>¥{toMoney(budget.spent_amount)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>剩余</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600, color: Number(budget.remaining_amount) < 0 ? '#ff4d4f' : 'var(--text-primary)' }}>
            ¥{toMoney(budget.remaining_amount)}
          </div>
        </div>
      </div>

      <Progress
        percent={percent}
        strokeColor={meta.color}
        trailColor="var(--border-light)"
        status={budget.alert_status === 'exceeded' ? 'exception' : 'active'}
      />
    </Card>
  )
}
