import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiGet } from '../services/api'
import { Skeleton, Empty, Button } from 'antd'
import { useAppStore } from '../stores/appStore'

/** 🛡️ L: 独立 TransactionList 组件 — 支持无限滚动 + 骨架屏 + 按天分组 */

interface TransactionListProps {
  onItemClick?: (item: any) => void
  selectedMonth?: number | null
}

interface TransactionItem {
  id: string
  occurred_at: string
  direction: string
  amount: string | number
  category_id?: string
  merchant?: string
  note?: string
  account_id: string
  tags?: string
  [key: string]: any
}

export default function TransactionList({ onItemClick, selectedMonth }: TransactionListProps) {
  const { user } = useAuth()
  const bookId = user?.default_book_id
  const { showHiddenTransactions } = useAppStore()

  const [data, setData] = useState<TransactionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // 加载单页数据
  const loadPage = useCallback(async (pageNum: number) => {
    if (!bookId) return
    if (pageNum === 1) setLoading(true)
    else setLoadingMore(true)

    const year = new Date().getFullYear()
    let url = `/api/transactions?book_id=${bookId}&year=${year}&page=${pageNum}&page_size=50&include_hidden=${showHiddenTransactions}`
    if (selectedMonth) url += `&month=${selectedMonth}`

    try {
      const res = await apiGet(url)
      const items: TransactionItem[] = res.items || []
      setData(prev => pageNum === 1 ? items : [...prev, ...items])
      setHasMore(items.length >= 50)
      setPage(pageNum)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [bookId, selectedMonth])

  // 首次加载或月份变化时重置
  useEffect(() => {
    setPage(1)
    setHasMore(true)
    loadPage(1)
  }, [loadPage])

  // 按天分组
  const groupedData = (() => {
    const groups: Record<string, TransactionItem[]> = {}
    data.forEach((item: TransactionItem) => {
      const date = item.occurred_at?.split('T')[0] || 'unknown'
      if (!groups[date]) groups[date] = []
      groups[date].push(item)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  })()

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return '今天'
    if (date.toDateString() === yesterday.toDateString()) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  // 骨架屏占位
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16 }}>
            <Skeleton active paragraph={{ rows: 1 }} />
          </div>
        ))}
      </div>
    )
  }

  if (groupedData.length === 0) {
    return (
      <Empty
        description="暂无交易记录"
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groupedData.map(([date, items]) => (
          <div
            key={date}
            style={{ background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}
          >
            {/* 日期标题 */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-light)',
              fontWeight: 500,
              color: 'var(--text-primary)'
            }}>
              {formatDateDisplay(date)}
            </div>

            {/* 交易列表 */}
            <div>
              {items.map((item: TransactionItem) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onClick={() => onItemClick?.(item)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 15, color: 'var(--text-primary)', flexShrink: 0 }}>
                        {item.merchant || '-'}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      minHeight: 20,
                      lineHeight: '20px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.note || ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 16, flexShrink: 0 }}>
                    <div style={{
                      color: item.direction === 'in' ? '#52c41a'
                        : item.direction === 'refund' ? '#1890ff'
                        : '#ff4d4f',
                      fontWeight: 600,
                      fontSize: 16
                    }}>
                      {item.direction === 'in' ? '+' : item.direction === 'refund' ? '↩' : '-'}
                      ¥{Number(item.amount).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {item.account_id ? `[账户]` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 无限滚动加载更多 */}
      {hasMore && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Button
            onClick={() => loadPage(page + 1)}
            loading={loadingMore}
            type="default"
            style={{ borderRadius: 20 }}
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </Button>
        </div>
      )}

      {/* 到底提示 */}
      {!hasMore && data.length > 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#999', fontSize: 13 }}>
          — 已加载全部 {data.length} 条记录 —
        </div>
      )}
    </>
  )
}
