import { useState, useEffect, useCallback, useMemo } from 'react'
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
  transaction_type?: string
  amount: string | number
  category_id?: string
  merchant?: string
  note?: string
  account_id: string
  tags?: string
  [key: string]: any
}

interface CategoryItem {
  id: string
  name: string
  icon?: string
  color?: string
  parent_id?: string
}

interface AccountItem {
  id: string
  name: string
}

const NEUTRAL_TRANSACTION_TYPES = new Set([
  'transfer',
  'repayment_credit_card',
  'repayment_loan',
])

export default function TransactionList({ onItemClick, selectedMonth }: TransactionListProps) {
  const { user } = useAuth()
  const bookId = user?.default_book_id
  const { showHiddenTransactions } = useAppStore()

  const [data, setData] = useState<TransactionItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
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
  }, [bookId, selectedMonth, showHiddenTransactions])

  useEffect(() => {
    if (!bookId) return

    apiGet(`/api/categories?book_id=${bookId}`)
      .then((res) => setCategories(Array.isArray(res) ? res : []))
      .catch(() => setCategories([]))
  }, [bookId])

  useEffect(() => {
    if (!bookId) return

    apiGet(`/api/accounts?book_id=${bookId}`)
      .then((res) => setAccounts(Array.isArray(res) ? res : []))
      .catch(() => setAccounts([]))
  }, [bookId])

  // 首次加载或月份变化时重置
  useEffect(() => {
    setPage(1)
    setHasMore(true)
    loadPage(1)
  }, [loadPage])

  const categoryMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]))
  }, [categories])

  const accountMap = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]))
  }, [accounts])

  const groupedData = useMemo(() => {
    const groups: Record<string, TransactionItem[]> = {}
    data.forEach((item: TransactionItem) => {
      const date = item.occurred_at?.split('T')[0] || 'unknown'
      if (!groups[date]) groups[date] = []
      groups[date].push(item)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [data])

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return '今天'
    if (date.toDateString() === yesterday.toDateString()) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const formatDateSubline = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }

  const getCategoryMeta = (item: TransactionItem) => {
    const isNeutral = NEUTRAL_TRANSACTION_TYPES.has(item.transaction_type)
    const isIncome = item.direction === 'in'
    const category = item.category_id ? categoryMap.get(item.category_id) : undefined
    const parent = category?.parent_id ? categoryMap.get(category.parent_id) : undefined
    const label = category
      ? parent ? `${parent.name} / ${category.name}` : category.name
      : '未分类'

    return {
      icon: isNeutral ? '⇄' : (category?.icon || (isIncome ? '↗' : '↘')),
      label,
      color: category?.color || (isNeutral ? 'var(--text-secondary)' : (isIncome ? '#16a34a' : '#dc2626')),
      background: category?.color
        ? `${category.color}18`
        : (isNeutral ? 'var(--bg-elevated)' : (isIncome ? '#16a34a18' : '#dc262618'))
    }
  }

  const getAmountMeta = (item: TransactionItem) => {
    const isNeutral = NEUTRAL_TRANSACTION_TYPES.has(item.transaction_type)
    const isIncome = item.direction === 'in'
    return {
      prefix: isNeutral ? '' : (isIncome ? '+' : '-'),
      color: isNeutral ? 'var(--text-secondary)' : (isIncome ? '#16a34a' : '#dc2626')
    }
  }

  const getDefaultNeutralTitle = (item: TransactionItem) => {
    if (item.merchant?.trim()) return item.merchant.trim()

    switch (item.transaction_type) {
      case 'repayment_credit_card':
        return '信用卡还款'
      case 'repayment_loan':
        return '贷款还款'
      case 'transfer':
        return '账户转账'
      default:
        return '内部流转'
    }
  }

  const getTagList = (item: TransactionItem) => {
    if (!item.tags) return []

    return item.tags
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  const getFlowAccountLabel = (item: TransactionItem) => {
    const fromName = item.account_id ? accountMap.get(item.account_id)?.name : undefined
    const toName = item.counterparty_account_id ? accountMap.get(item.counterparty_account_id)?.name : undefined

    if (fromName && toName) return `${fromName} -> ${toName}`
    if (fromName) return `${fromName} -> 未知账户`
    if (toName) return `未知账户 -> ${toName}`
    return '账户未匹配'
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
      <style>
        {`
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }

          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groupedData.map(([date, items]) => (
          <div
            key={date}
            style={{
              background: 'var(--bg-card)',
              borderRadius: 18,
              overflow: 'hidden',
              border: '1px solid var(--border-light)',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)'
            }}
          >
            <div style={{
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              background: 'linear-gradient(180deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0))'
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatDateDisplay(date)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatDateSubline(date)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {items.length} 笔
              </div>
            </div>

            <div>
              {items.map((item: TransactionItem, index) => {
                const isNeutral = NEUTRAL_TRANSACTION_TYPES.has(item.transaction_type)
                const categoryMeta = getCategoryMeta(item)
                const amountMeta = getAmountMeta(item)
                const tags = getTagList(item)
                const primaryTitle = isNeutral
                  ? getDefaultNeutralTitle(item)
                  : categoryMeta.label
                const noteText = item.note?.trim() || '暂无备注'
                const accountText = isNeutral
                  ? getFlowAccountLabel(item)
                  : (accountMap.get(item.account_id)?.name || '未知账户')
                const formattedAmount = Number(isNeutral ? Math.abs(Number(item.amount)) : item.amount).toFixed(2)

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 16px',
                      borderTop: index === 0 ? '1px solid var(--border-light)' : '1px solid var(--border-light)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14
                    }}
                    onClick={() => onItemClick?.(item)}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: 20,
                        background: categoryMeta.background,
                        color: categoryMeta.color
                      }}
                    >
                      {categoryMeta.icon}
                    </div>

                    <div style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          minWidth: 0,
                          gap: 8
                        }}>
                          <div style={{
                            flexShrink: 0,
                            fontWeight: 700,
                            fontSize: 15,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {primaryTitle}
                          </div>

                          <div
                            className="scrollbar-hide"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflowX: 'auto',
                              overflowY: 'hidden',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {tags.length > 0 ? (
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {tags.map((tag, tagIndex) => (
                                  <span
                                    key={`${item.id}-tag-${tagIndex}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      fontSize: 11,
                                      lineHeight: '16px',
                                      color: 'var(--text-secondary)',
                                      background: 'var(--bg-elevated)'
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                无标签
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {noteText}
                        </div>
                      </div>

                      <div style={{
                        flex: '0 0 132px',
                        width: 132,
                        textAlign: 'right'
                      }}>
                        <div style={{
                          color: amountMeta.color,
                          fontWeight: 700,
                          fontSize: 17,
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {amountMeta.prefix}¥{formattedAmount}
                        </div>

                        <div style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {accountText}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
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
