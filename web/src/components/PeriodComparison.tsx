export type ComparisonEntry = {
  compare_value: number
  change_amount: number
  change_rate: number | null
  trend_direction: 'up' | 'down' | 'stable' | 'new' | 'decrease'
  label: string
}

export type PeriodComparisonData = {
  current_value: number
  month_over_month: ComparisonEntry
  year_over_year: ComparisonEntry
}

type PeriodComparisonProps = {
  data?: PeriodComparisonData | null
  compact?: boolean
  inverted?: boolean
  labels?: {
    monthOverMonth?: string
    yearOverYear?: string
  }
}

const trendStyleMap = {
  up: {
    arrow: '↑',
    color: 'var(--accent-green)',
    bg: 'color-mix(in srgb, var(--accent-green) 12%, transparent)',
  },
  down: {
    arrow: '↓',
    color: 'var(--accent-red)',
    bg: 'color-mix(in srgb, var(--accent-red) 12%, transparent)',
  },
  decrease: {
    arrow: '↓',
    color: 'var(--accent-red)',
    bg: 'color-mix(in srgb, var(--accent-red) 12%, transparent)',
  },
  stable: {
    arrow: '→',
    color: 'var(--text-tertiary)',
    bg: 'var(--bg-elevated)',
  },
  new: {
    arrow: '↗',
    color: 'var(--accent-orange)',
    bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)',
  },
} as const

function formatCurrency(amount: number) {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  return `${sign}${Math.abs(amount).toFixed(2)}`
}

function formatRate(rate: number | null) {
  if (rate === null || Number.isNaN(rate)) return ''
  const sign = rate > 0 ? '+' : rate < 0 ? '-' : ''
  return ` (${sign}${Math.abs(rate).toFixed(1)}%)`
}

function getDisplayStyle(trend: ComparisonEntry['trend_direction'], inverted: boolean) {
  if (!inverted) return trendStyleMap[trend] || trendStyleMap.stable
  if (trend === 'up') return trendStyleMap.down
  if (trend === 'down' || trend === 'decrease') return trendStyleMap.up
  return trendStyleMap[trend] || trendStyleMap.stable
}

function ComparisonLine({
  label,
  entry,
  compact = false,
  inverted = false,
}: {
  label: string
  entry: ComparisonEntry
  compact?: boolean
  inverted?: boolean
}) {
  const style = getDisplayStyle(entry.trend_direction, inverted)
  const text = entry.change_rate === null && entry.compare_value === 0 && entry.change_amount !== 0
    ? '新增'
    : `${formatCurrency(entry.change_amount)}${formatRate(entry.change_rate)}`

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: compact ? 'flex-start' : 'space-between',
      gap: 8,
      marginTop: 6,
      flexWrap: 'wrap',
      fontSize: compact ? 11 : 12,
      lineHeight: 1.4,
    }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: compact ? '1px 6px' : '2px 8px',
        borderRadius: 999,
        color: style.color,
        background: style.bg,
        fontWeight: 600,
      }}>
        <span>{style.arrow}</span>
        <span>{text}</span>
      </span>
    </div>
  )
}

export function buildComparisonText(entry: ComparisonEntry) {
  return entry.change_rate === null && entry.compare_value === 0 && entry.change_amount !== 0
    ? '新增'
    : `${formatCurrency(entry.change_amount)}${formatRate(entry.change_rate)}`
}

export function getComparisonDisplayStyle(trend: ComparisonEntry['trend_direction'], inverted: boolean) {
  return getDisplayStyle(trend, inverted)
}

export default function PeriodComparison({
  data,
  compact = false,
  inverted = false,
  labels,
}: PeriodComparisonProps) {
  if (!data) return null

  return (
    <div style={{ marginTop: compact ? 4 : 8 }}>
      <ComparisonLine label={labels?.monthOverMonth || '较上月'} entry={data.month_over_month} compact={compact} inverted={inverted} />
      <ComparisonLine label={labels?.yearOverYear || '较去年同月'} entry={data.year_over_year} compact={compact} inverted={inverted} />
    </div>
  )
}
