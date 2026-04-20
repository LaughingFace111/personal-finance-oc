import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Empty, List, Popconfirm, Spin, Tag, message } from 'antd'

import { useAuth } from '../App'
import BudgetProgressCard, { type BudgetSummary } from '../components/BudgetProgressCard'
import { apiGet, apiPatch } from '../services/api'

type BudgetDetail = {
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
  rollup_children: boolean
  status: 'active' | 'archived'
  note?: string | null
}

type BudgetCategoryBreakdownItem = {
  category_id?: string | null
  category_name?: string | null
  gross_amount: string | number
  refund_deduction: string | number
  net_amount: string | number
}

type BudgetBreakdownItem = {
  id: string
  occurred_at: string
  transaction_type: string
  merchant?: string | null
  note?: string | null
  category_name?: string | null
  amount: string | number
  impact_amount: string | number
  related_transaction_id?: string | null
}

type BudgetBreakdown = {
  budget_id: string
  dimension_type: 'overall' | 'category' | 'tag'
  category_id?: string | null
  category_name?: string | null
  tag_id?: string | null
  tag_name?: string | null
  rollup_children: boolean
  gross_expense: string | number
  refund_deduction: string | number
  net_expense: string | number
  category_breakdown: BudgetCategoryBreakdownItem[]
  transactions: BudgetBreakdownItem[]
}

const toMoney = (value: string | number) =>
  Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function BudgetDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const bookId = user?.default_book_id

  const [budget, setBudget] = useState<BudgetDetail | null>(null)
  const [summary, setSummary] = useState<BudgetSummary | null>(null)
  const [breakdown, setBreakdown] = useState<BudgetBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)

  const loadData = async () => {
    if (!bookId || !id) return
    setLoading(true)
    try {
      const budgetData = await apiGet<BudgetDetail>(`/api/budgets/${id}?book_id=${bookId}`, {
        showErrorMessage: false,
      })

      const [summaryData, breakdownData] = await Promise.all([
        apiGet<BudgetSummary>(`/api/budgets/${id}/summary?book_id=${bookId}`, {
          showErrorMessage: false,
        }),
        apiGet<BudgetBreakdown>(`/api/budgets/${id}/breakdown?book_id=${bookId}`, {
          showErrorMessage: false,
        }),
      ])

      setBudget(budgetData)
      setSummary(summaryData)
      setBreakdown(breakdownData)
    } catch (err: any) {
      const errorMessage = err?.message || '加载预算详情失败'
      if (errorMessage === 'Budget not found' || errorMessage === '请求失败 (404)') {
        message.error('预算不存在')
        navigate('/budgets', { replace: true })
        return
      }
      message.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [bookId, id])

  const topCategories = useMemo(() => {
    return (breakdown?.category_breakdown || [])
      .map((item) => ({ ...item, net_amount: Number(item.net_amount || 0) }))
      .sort((a, b) => b.net_amount - a.net_amount)
      .slice(0, 5)
  }, [breakdown])

  const archiveBudget = async () => {
    if (!bookId || !id) return
    try {
      setArchiving(true)
      await apiPatch(`/api/budgets/${id}?book_id=${bookId}`, { status: 'archived' })
      message.success('预算已归档')
      loadData()
    } catch {
      // handled by api layer
    } finally {
      setArchiving(false)
    }
  }

if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>
  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
  if (!budget || !summary || !breakdown) return <Empty description="预算不存在" />

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/budgets')}>返回</Button>
      </div>

      <BudgetProgressCard
        budget={summary}
        extra={(
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" onClick={() => navigate(`/budgets/${budget.id}/edit`)}>编辑</Button>
            {budget.status !== 'archived' && (
              <Popconfirm title="确认归档这个预算吗？" onConfirm={archiveBudget} okText="归档" cancelText="取消">
                <Button size="small" loading={archiving}>归档</Button>
              </Popconfirm>
            )}
          </div>
        )}
      />

      <Card style={{ borderRadius: 16, borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>预算状态</div>
            <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
              使用率 {Math.round((summary.usage_ratio || 0) * 100)}%，毛支出 ¥{toMoney(breakdown.gross_expense)}，退款冲减 ¥{toMoney(breakdown.refund_deduction)}
            </div>
            {budget.dimension_type === 'category' && (
              <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                分类 {budget.category_name || '未命名分类'}，{budget.rollup_children ? '包含子分类' : '仅当前分类'}
              </div>
            )}
            {budget.dimension_type === 'tag' && (
              <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                标签 {budget.tag_name || '未命名标签'}
              </div>
            )}
          </div>
          <Tag color={budget.status === 'archived' ? 'default' : 'blue'}>{budget.status === 'archived' ? '已归档' : '进行中'}</Tag>
        </div>
        {budget.note && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {budget.note}
          </div>
        )}
      </Card>

      <Card style={{ borderRadius: 16, borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          {budget.dimension_type === 'category' ? '分类明细' : budget.dimension_type === 'tag' ? '标签预算分类分布' : '分类分布'}
        </div>
        {topCategories.length === 0 ? (
          <Empty description="预算周期内暂无支出分类数据" />
        ) : (
          <div className="space-y-3">
            {topCategories.map((item) => (
              <div key={item.category_id || 'uncategorized'} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: 'var(--text-primary)' }}>{item.category_name || '未分类'}</span>
                <span style={{ fontWeight: 600 }}>¥{toMoney(item.net_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ borderRadius: 16, borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          {budget.dimension_type === 'category' ? '分类预算交易' : budget.dimension_type === 'tag' ? '标签预算交易' : '预算周期交易'}
        </div>
        {breakdown.transactions.length === 0 ? (
          <Empty description="预算周期内暂无交易" />
        ) : (
          <List
            dataSource={breakdown.transactions}
            renderItem={(item) => (
              <List.Item key={item.id}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.merchant || item.category_name || (item.transaction_type === 'refund' ? '退款' : '支出')}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {item.occurred_at.slice(0, 10)}
                      {item.category_name ? ` · ${item.category_name}` : ''}
                      {item.note ? ` · ${item.note}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: Number(item.impact_amount) < 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {Number(item.impact_amount) < 0 ? '+' : '-'}¥{toMoney(Math.abs(Number(item.impact_amount)))}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>{item.transaction_type}</div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  )
}
