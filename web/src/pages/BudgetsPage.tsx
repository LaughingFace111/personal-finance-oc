import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Segmented, Spin, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

import { useAuth } from '../App'
import BudgetProgressCard, { type BudgetSummary } from '../components/BudgetProgressCard'
import { apiGet } from '../services/api'

export default function BudgetsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const bookId = user?.default_book_id

  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'archived' | 'category' | 'tag'>('all')

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    apiGet<BudgetSummary[]>(`/api/budgets?book_id=${bookId}`)
      .then((data) => setBudgets(data || []))
      .catch((err: any) => message.error(err.message || '加载预算失败'))
      .finally(() => setLoading(false))
  }, [bookId])

  const filteredBudgets = useMemo(() => {
    if (filter === 'all') return budgets
    if (filter === 'category') return budgets.filter((budget) => budget.dimension_type === 'category')
    if (filter === 'tag') return budgets.filter((budget) => budget.dimension_type === 'tag')
    return budgets.filter((budget) => budget.status === filter)
  }, [budgets, filter])

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-2xl border p-5 shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">预算</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">管理总预算、分类预算和标签预算，并查看 80% / 100% 预警。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/budgets/new')}>
          新建预算
        </Button>
      </div>

      <Segmented
        value={filter}
        onChange={(value) => setFilter(value as 'all' | 'active' | 'archived' | 'category' | 'tag')}
        options={[
          { label: '全部', value: 'all' },
          { label: '进行中', value: 'active' },
          { label: '已归档', value: 'archived' },
          { label: '分类预算', value: 'category' },
          { label: '标签预算', value: 'tag' },
        ]}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : filteredBudgets.length === 0 ? (
        <div className="rounded-2xl border p-8 shadow-sm" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <Empty description="还没有预算，先创建一个吧" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBudgets.map((budget) => (
            <div key={budget.id} onClick={() => navigate(`/budgets/${budget.id}`)} style={{ cursor: 'pointer' }}>
              <BudgetProgressCard budget={budget} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
