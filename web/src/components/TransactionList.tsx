import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiGet } from '../services/api'
import { Skeleton, Empty, Button } from 'antd'
import { useAppStore } from '../stores/appStore'

/** 🛡️ L: 独立 TransactionList 组件 — 支持无限滚动 + 骨架屏 + 按天分组 */

interface TransactionListProps {
  onItemClick?: (item: any) => void
  selectedMonth?: number | null
  items?: TransactionItem[]
  loading?: boolean
  emptyDescription?: string
  refreshToken?: number
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

interface TagItem {
  id: string
  name: string
  color?: string
}

interface TagDisplayItem {
  name: string
  color?: string
  isDeleted?: boolean
}

const NEUTRAL_TRANSACTION_TYPES = new Set([
  'transfer',
  'repayment_credit_card',
  'repayment_loan',
])

export default function TransactionList({
  onItemClick,
  selectedMonth,
  items,
  loading: externalLoading,
  emptyDescription = '暂无交易记录',
  refreshToken,
}: TransactionListProps) {
  const { user } = useAuth()
  const bookId = user?.default_book_id
  const { showHiddenTransactions } = useAppStore()
  const isControlled = Array.isArray(items)

  const [data, setData] = useState<TransactionItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [tags, setTags] = useState<TagItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // 加载单页数据
  const loadPage = useCallback(async (pageNum: number) => {
    if (!bookId || isControlled) return
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
  }, [bookId, isControlled, selectedMonth, showHiddenTransactions])

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

  useEffect(() => {
    if (!bookId) return

    apiGet(`/api/tags?book_id=${bookId}`)
      .then((res) => setTags(Array.isArray(res) ? res : []))
      .catch(() => setTags([]))
  }, [bookId])

  // 首次加载或月份变化时重置
  useEffect(() => {
    if (isControlled) return
    setPage(1)
    setHasMore(true)
    loadPage(1)
  }, [isControlled, loadPage, refreshToken])

  const categoryMap = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]))
  }, [categories])

  const accountMap = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]))
  }, [accounts])

  const tagMap = useMemo(() => {
    const entries = tags.flatMap((tag) => [
      [tag.name, tag] as const,
      [tag.id, tag] as const,
    ])
    return new Map(entries)
  }, [tags])

  const groupedData = useMemo(() => {
    const groups: Record<string, TransactionItem[]> = {}
    const sourceData = isControlled ? items : data
    ;(sourceData || []).forEach((item: TransactionItem) => {
      const date = item.occurred_at?.split('T')[0] || 'unknown'
      if (!groups[date]) groups[date] = []
      groups[date].push(item)
    })
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [data, isControlled, items])

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
    const label = category?.name || '未分类'

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
    // 🛡️ L: SYSTEM 类型余额调整
    if (item.source_type === 'system') {
      // 如果勾选了"计入收支"，按普通收入/支出颜色显示
      if (item.include_in_income === true) {
        return { prefix: '+', color: '#16a34a' }
      }
      if (item.include_in_expense === true) {
        return { prefix: '-', color: '#dc2626' }
      }
      // 未勾选计入收支 → 灰色中性
      return { prefix: item.direction === 'in' ? '+' : '-', color: '#999' }
    }
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

  const getTagList = (item: TransactionItem): TagDisplayItem[] => {
    if (!item.tags) return []

    let parsedTags: unknown = item.tags

    if (typeof item.tags === 'string') {
      try {
        parsedTags = JSON.parse(item.tags)
      } catch {
        parsedTags = item.tags.split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean)
      }
    }

    if (!Array.isArray(parsedTags)) return []

    return parsedTags
      .map((tag): TagDisplayItem | null => {
        if (typeof tag === 'string') {
          const trimmedName = tag.trim()
          if (!trimmedName) return null
          const matchedTag = tagMap.get(trimmedName)
          return {
            name: matchedTag?.name || trimmedName,
            color: matchedTag?.color
          }
        }

        if (tag && typeof tag === 'object' && 'name' in tag) {
          const name = typeof tag.name === 'string' ? tag.name.trim() : ''
          if (!name) return null
          return {
            name,
            color: typeof tag.color === 'string' ? tag.color : tagMap.get(name)?.color,
            isDeleted:
              ('is_deleted' in tag && Boolean(tag.is_deleted)) ||
              ('is_active' in tag && tag.is_active === false)
          }
        }

        return null
      })
      .filter((tag): tag is TagDisplayItem => Boolean(tag))
  }

  const isLightColor = (color?: string) => {
    if (!color || !color.startsWith('#')) return false

    let normalized = color.slice(1)
    if (normalized.length === 3) {
      normalized = normalized.split('').map((char) => `${char}${char}`).join('')
    }

    if (normalized.length !== 6) return false

    const r = Number.parseInt(normalized.slice(0, 2), 16)
    const g = Number.parseInt(normalized.slice(2, 4), 16)
    const b = Number.parseInt(normalized.slice(4, 6), 16)

    if ([r, g, b].some((value) => Number.isNaN(value))) return false

    const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b)
    return luminance >= 186
  }

  const getTagStyle = (color?: string, isDeleted?: boolean) => ({
    background: color || 'var(--bg-elevated)',
    color: color
      ? (isLightColor(color) ? 'var(--text-primary)' : '#ffffff')
      : 'var(--text-secondary)',
    opacity: isDeleted ? 0.6 : 1,
    textDecoration: isDeleted ? 'line-through' : 'none'
  })

  const getFlowAccountLabel = (item: TransactionItem) => {
    const fromName = item.account_id ? accountMap.get(item.account_id)?.name : undefined
    const toName = item.counterparty_account_id ? accountMap.get(item.counterparty_account_id)?.name : undefined

    if (fromName && toName) return `${fromName} -> ${toName}`
    if (fromName) return `${fromName} -> 未知账户`
    if (toName) return `未知账户 -> ${toName}`
    return '账户未匹配'
  }

  // 骨架屏占位
  if (externalLoading ?? loading) {
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
        description={emptyDescription}
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
                const noteText = item.note?.trim() || ''
                const accountText = isNeutral
                  ? getFlowAccountLabel(item)
                  : (accountMap.get(item.account_id)?.name || '未知账户')
                const formattedAmount = Number(isNeutral ? Math.abs(Number(item.amount)) : item.amount).toFixed(2)
                const isFullyRefunded = item.transaction_type === 'expense' && item.is_fully_refunded
                const isPartiallyRefunded = item.transaction_type === 'expense' && item.is_partially_refunded

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 16px',
                      borderTop: index === 0 ? '1px solid var(--border-light)' : '1px solid var(--border-light)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      opacity: isFullyRefunded ? 0.6 : 1,
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
                      flex: '1 1 0',
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
                          minHeight: 24,
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

                          {isFullyRefunded ? (
                            <span
                              style={{
                                flexShrink: 0,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: '#dcfce7',
                                color: '#166534',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              已全额退款
                            </span>
                          ) : null}

                          {!isFullyRefunded && isPartiallyRefunded ? (
                            <span
                              style={{
                                flexShrink: 0,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: '#fef3c7',
                                color: '#92400e',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              已退 {Number(item.refunded_amount || 0).toFixed(2)}
                            </span>
                          ) : null}

                          {tags.length > 0 && (
                            <div
                              className="scrollbar-hide"
                              style={{
                                marginLeft: 'auto',
                                flexShrink: 1,
                                minWidth: 0,
                                overflowX: 'auto',
                                overflowY: 'hidden',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {tags.map((tag, tagIndex) => {
                                  const tagStyle = getTagStyle(tag.color, tag.isDeleted)

                                  return (
                                    <span
                                      key={`${item.id}-tag-${tagIndex}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '2px 8px',
                                        borderRadius: 8,
                                        fontSize: 11,
                                        lineHeight: '16px',
                                        color: tagStyle.color,
                                        background: tagStyle.background,
                                        opacity: tagStyle.opacity,
                                        textDecoration: tagStyle.textDecoration
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {noteText && (
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
                        )}
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
      {!isControlled && hasMore && (
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
