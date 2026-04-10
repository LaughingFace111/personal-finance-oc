import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Tag, Empty, Spin, message, Progress, Popconfirm } from 'antd'
import { useAuth } from '../App'
import { apiDelete, apiGet, apiPost } from '../services/api'
import { useAppStore } from '../stores/appStore'

interface InstallmentSchedule {
  id: string
  installment_plan_id: string
  period_no: number
  due_date: string
  principal_amount: number
  fee_amount: number
  total_due: number
  paid_amount: number
  paid_at: string | null
  payment_transaction_id: string | null
  status: string
}

interface InstallmentPlan {
  id: string
  plan_name: string
  account_name?: string
  total_amount: number | string
  installment_amount: number | string
  total_periods: number
  executed_periods: number
  status: string
  start_date: string
  next_execution_date?: string | null
  schedules?: InstallmentSchedule[]
}

export default function InstallmentTasksPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<InstallmentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const bookId = user?.default_book_id

  const triggerRefresh = useAppStore((s) => s.triggerRefresh)

  useEffect(() => {
    if (!bookId) return
    void loadPlans()
  }, [bookId])

  const loadPlans = async () => {
    try {
      setLoading(true)
      const data = await apiGet<InstallmentPlan[]>('/api/installments')
      const enrichedPlans = await Promise.all(
        (data || []).map(async (plan) => {
          const schedules = await apiGet<InstallmentSchedule[]>(`/api/installments/${plan.id}/schedules`)
          return { ...plan, schedules: schedules || [] }
        }),
      )
      setPlans(enrichedPlans)
    } catch (err) {
      console.error('加载分期计划失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const executePeriod = async (planId: string) => {
    try {
      setExecutingId(planId)
      await apiPost(`/api/installments/${planId}/execute`, {})
      message.success('执行成功')
      await loadPlans()
      triggerRefresh()
    } catch (err: any) {
      message.error(err.message || '执行失败')
    } finally {
      setExecutingId(null)
    }
  }

  const revertPeriod = async (periodId: string) => {
    try {
      setRevertingId(periodId)
      await apiPost(`/api/installments/periods/${periodId}/revert`, {})
      message.success('撤回成功')
      await loadPlans()
      triggerRefresh()
    } catch (err: any) {
      message.error(err.message || '撤回失败')
    } finally {
      setRevertingId(null)
    }
  }

  const deletePlan = async (planId: string) => {
    try {
      setDeletingId(planId)
      await apiDelete(`/api/installments/${planId}`)
      message.success('删除成功')
      await loadPlans()
      triggerRefresh()
    } catch (err: any) {
      message.error(err.message || '删除失败')
    } finally {
      setDeletingId(null)
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
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>分期任务</h2>
        <button
          onClick={() => navigate('/installments/new')}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#1677ff', color: '#fff', cursor: 'pointer',
            fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4
          }}
        >
          + 新增分期
        </button>
      </div>

      {plans.length === 0 ? (
        <Empty description="暂无进行中的分期任务" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map((plan) => {
            const isCompleted = plan.status === 'completed'
            const progress = plan.total_periods > 0
              ? Math.round(((plan.executed_periods || 0) / plan.total_periods) * 100)
              : 0
            const canDelete = (plan.executed_periods || 0) === 0
            const nextPendingSchedule = plan.schedules?.find((schedule) => schedule.status === 'pending')

            return (
              <Card
                key={plan.id}
                size="small"
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: 16 } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{plan.plan_name}</div>
                    <div style={{ fontSize: 12, color: '#1677ff', marginTop: 2 }}>
                      {plan.account_name ? `🏦 ${plan.account_name}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      总金额: ¥{Number(plan.total_amount).toFixed(2)} | 每期: ¥{Number(plan.installment_amount).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => navigate(`/installments/${plan.id}/edit`)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title={canDelete ? '确认删除该分期计划？' : '已执行期次的分期计划禁止删除'}
                      onConfirm={() => deletePlan(plan.id)}
                      disabled={!canDelete}
                    >
                      <Button size="small" danger disabled={!canDelete} loading={deletingId === plan.id}>
                        删除
                      </Button>
                    </Popconfirm>
                    <Tag color={isCompleted ? 'green' : plan.status === 'active' ? 'blue' : 'orange'}>
                      {isCompleted ? '已结清' : '进行中'}
                    </Tag>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <Progress
                    percent={progress}
                    size="small"
                    status={isCompleted ? 'success' : 'active'}
                    format={() => `${plan.executed_periods || 0}/${plan.total_periods}期`}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 12 }}>
                  <div>分期创建日期: {plan.start_date}</div>
                  <div>下次执行: {plan.next_execution_date || '-'}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {(plan.schedules || []).map((schedule) => {
                    const isExecuted = schedule.status === 'executed'
                    const isCurrentPending = nextPendingSchedule?.id === schedule.id

                    return (
                      <div
                        key={schedule.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                          border: '1px solid var(--border-color)',
                          borderRadius: 10,
                          padding: '10px 12px',
                        }}
                      >
                        <div style={{ fontSize: 12, color: '#666' }}>
                          第 {schedule.period_no} 期 | 账单日 {schedule.due_date} | ¥{Number(schedule.total_due).toFixed(2)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Tag color={isExecuted ? 'green' : 'default'}>
                            {isExecuted ? '已执行' : '待执行'}
                          </Tag>
                          {isExecuted && (
                            <Button
                              size="small"
                              onClick={() => revertPeriod(schedule.id)}
                              loading={revertingId === schedule.id}
                            >
                              撤回
                            </Button>
                          )}
                          {isCurrentPending && !isCompleted && (
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
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
