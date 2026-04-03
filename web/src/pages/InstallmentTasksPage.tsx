import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Tag, Empty, Spin, message, Progress } from 'antd'
import { useAuth } from '../App'
import { apiGet, apiPost } from '../services/api'
import { useAppStore } from '../stores/appStore'

export default function InstallmentTasksPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const bookId = user?.default_book_id

  useEffect(() => {
    if (!bookId) return
    loadPlans()
  }, [bookId])

  const loadPlans = async () => {
    try {
      setLoading(true)
      const data = await apiGet('/api/installments')
      setPlans(data || [])
    } catch (err) {
      console.error('加载分期计划失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const triggerRefresh = useAppStore((s) => s.triggerRefresh)

  const executePeriod = async (planId: string) => {
    try {
      setExecutingId(planId)
      await apiPost(`/api/installments/${planId}/execute`, {})
      message.success('执行成功')
      loadPlans()
      // 🛡️ L: 通知全局刷新 — Dashboard 等页面无需 F5 即可看到最新额度
      triggerRefresh()
    } catch (err: any) {
      message.error(err.message || '执行失败')
    } finally {
      setExecutingId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      {/* 顶部操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>分期任务</h2>
        <button
          onClick={() => navigate('/other/installment')}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#1677ff', color: '#fff', cursor: 'pointer',
            fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4
          }}
        >
          + 新增分期
        </button>
      </div>

      {/* 分期任务卡片列表 */}
      {plans.length === 0 ? (
        <Empty description="暂无进行中的分期任务" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map((plan: any) => {
            const isCompleted = plan.status === 'completed'
            const progress = plan.total_periods > 0 
              ? Math.round((plan.executed_periods || 0) / plan.total_periods * 100) 
              : 0
            
            return (
              <Card
                key={plan.id}
                size="small"
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: 16 } }}
              >
                {/* 卡片头部 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{plan.plan_name || plan.merchant}</div>
                    <div style={{ fontSize: 12, color: '#1677ff', marginTop: 2 }}>
                      {plan.account_name ? `🏦 ${plan.account_name}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      总金额: ¥{Number(plan.total_amount).toFixed(2)} | 每期: ¥{Number(plan.installment_amount || plan.total_due).toFixed(2)}
                    </div>
                  </div>
                  <Tag color={isCompleted ? 'green' : plan.status === 'active' ? 'blue' : 'orange'}>
                    {isCompleted ? '已结清' : '进行中'}
                  </Tag>
                </div>

                {/* 进度条 */}
                <div style={{ marginBottom: 12 }}>
                  <Progress 
                    percent={progress} 
                    size="small" 
                    status={isCompleted ? 'success' : 'active'}
                    format={(p) => `${plan.executed_periods || 0}/${plan.total_periods}期`}
                  />
                </div>

                {/* 日期信息 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 12 }}>
                  <div>开始日期: {plan.start_date}</div>
                  <div>下次执行: {plan.next_execution_date || '-'}</div>
                </div>

                {/* 操作按钮 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {!isCompleted && (
                    <Button 
                      type="primary" 
                      size="small"
                      loading={executingId === plan.id}
                      onClick={() => executePeriod(plan.id)}
                    >
                      执行本期账单
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
