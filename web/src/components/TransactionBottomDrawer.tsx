import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Spin, message } from 'antd'
import { CopyOutlined, DeleteOutlined, EditOutlined, UndoOutlined } from '@ant-design/icons'
import { apiDelete, apiGet, apiPatch, apiPost } from '../services/api'
import { TagMultiSelect } from './TagMultiSelect'
import TransferPage from '../pages/TransferPage'
import OtherTransactionPage from '../pages/OtherTransactionPage'
import {
  mapTagNamesToIds,
  parseTransactionTagNames,
  OtherTransactionFormInitialValues,
  TransferFormInitialValues,
  toDateInputValue,
} from '../pages/transactionFormSupport'

interface TransactionBottomDrawerProps {
  visible: boolean
  transaction: any
  onClose: () => void
  onRefresh: () => void
  accounts: any[]
  categories: any[]
  tags: any[]
  bookId?: string
}

interface TransferEditContextResponse {
  transaction_id: string
  occurred_at: string
  from_account_id: string
  to_account_id: string
  amount: number | string
  note?: string | null
  tags?: string | null
  fee_amount: number | string
  fee_account_id?: string | null
}

type ViewMode = 'detail' | 'edit'
type RefundMode = 'partial' | 'full'

const formatCurrency = (value: number | string | null | undefined) =>
  `¥${Number(value || 0).toFixed(2)}`

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const parseTagLabels = (rawTags: unknown) => {
  if (!rawTags) return [] as string[]

  let parsedTags = rawTags
  if (typeof rawTags === 'string') {
    try {
      parsedTags = JSON.parse(rawTags)
    } catch {
      parsedTags = rawTags.split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean)
    }
  }

  if (!Array.isArray(parsedTags)) return []
  return parsedTags.map((tag) => String(tag).trim()).filter(Boolean)
}

export function TransactionBottomDrawer({
  visible,
  transaction,
  onClose,
  onRefresh,
  accounts,
  categories,
  tags,
  bookId,
}: TransactionBottomDrawerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('detail')
  const [detailTransaction, setDetailTransaction] = useState<any>(transaction)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [specialFormLoading, setSpecialFormLoading] = useState(false)
  const [transferInitialValues, setTransferInitialValues] = useState<TransferFormInitialValues | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundMode, setRefundMode] = useState<RefundMode>('partial')
  const [refundForm, setRefundForm] = useState({ amount: '', note: '', occurred_at: '' })
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    account_id: '',
    category_id: '',
    note: '',
    occurred_at: '',
  })

  const activeTransaction = detailTransaction || transaction
  const isTransferTransaction = activeTransaction?.transaction_type === 'transfer'
  const isRepaymentTransaction = activeTransaction?.transaction_type === 'repayment_credit_card'
  const isSpecialTransaction = isTransferTransaction || isRepaymentTransaction
  const remainingRefundableAmount = Number(activeTransaction?.remaining_refundable_amount || 0)
  const canRefund =
    activeTransaction?.transaction_type === 'expense' &&
    activeTransaction?.direction === 'out' &&
    remainingRefundableAmount > 0

  const repaymentInitialValues = useMemo<OtherTransactionFormInitialValues | null>(() => {
    if (!isRepaymentTransaction || !activeTransaction) return null
    return {
      transactionId: activeTransaction.id,
      subType: 'repay',
      accountId: activeTransaction.account_id || '',
      creditCardAccountId: activeTransaction.counterparty_account_id || '',
      amount: String(activeTransaction.amount ?? ''),
      memo: activeTransaction.note || '',
      tagIds: mapTagNamesToIds(tags as any, parseTransactionTagNames(activeTransaction.tags)),
      date: toDateInputValue(activeTransaction.occurred_at),
    }
  }, [activeTransaction, isRepaymentTransaction, tags])

  const filteredCategories = useMemo(() => {
    return categories.filter((category: any) => {
      if (form.type === 'income') {
        return category.category_type === 'income' || category.category_type === 'income_expense'
      }
      return category.category_type === 'expense' || category.category_type === 'income_expense'
    })
  }, [categories, form.type])

  const selectedTagLabels = useMemo(() => {
    return selectedTagIds
      .map((id) => {
        const tag = tags.find((item: any) => item.id === id)
        if (!tag) return ''
        if (!tag.parent_id) return tag.name
        const parent = tags.find((item: any) => item.id === tag.parent_id)
        return parent ? `${parent.name} / ${tag.name}` : tag.name
      })
      .filter(Boolean)
  }, [selectedTagIds, tags])

  useEffect(() => {
    if (!visible || !transaction?.id || !bookId) return

    let cancelled = false
    setViewMode('detail')
    setLoading(true)
    apiGet(`/api/transactions/${transaction.id}?book_id=${bookId}`)
      .then((data) => {
        if (cancelled) return
        setDetailTransaction(data)
      })
      .catch((error: any) => {
        if (cancelled) return
        message.error(error?.message || '加载交易详情失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId, transaction?.id, visible])

  useEffect(() => {
    if (!visible) {
      setDetailTransaction(transaction)
      setTransferInitialValues(null)
      setSelectedTagIds([])
      setErrors({})
      setRefundModalOpen(false)
      return
    }

    if (!activeTransaction || isSpecialTransaction) return

    setForm({
      type: activeTransaction.direction === 'in' ? 'income' : 'expense',
      amount: String(activeTransaction.amount ?? ''),
      account_id: activeTransaction.account_id || '',
      category_id: activeTransaction.category_id || '',
      note: activeTransaction.note || '',
      occurred_at: activeTransaction.occurred_at ? activeTransaction.occurred_at.split('T')[0] : '',
    })
    setSelectedTagIds(mapTagNamesToIds(tags as any, parseTransactionTagNames(activeTransaction.tags)))
  }, [activeTransaction, isSpecialTransaction, tags, transaction, visible])

  useEffect(() => {
    if (!visible || !activeTransaction) return

    const scrollY = window.scrollY
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    document.body.style.top = `-${scrollY}px`
    document.body.style.touchAction = 'none'

    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      document.body.style.touchAction = previousTouchAction
      window.scrollTo(0, scrollY)
    }
  }, [activeTransaction, visible])

  useEffect(() => {
    if (!visible || !activeTransaction?.id || !bookId || !isTransferTransaction) {
      setTransferInitialValues(null)
      setSpecialFormLoading(false)
      return
    }

    let cancelled = false
    setSpecialFormLoading(true)
    apiGet<TransferEditContextResponse>(`/api/transactions/transfer/${activeTransaction.id}/edit?book_id=${bookId}`)
      .then((context) => {
        if (cancelled) return
        setTransferInitialValues({
          transactionId: context.transaction_id,
          fromAccountId: context.from_account_id,
          toAccountId: context.to_account_id,
          amount: String(context.amount),
          feeAmount: String(context.fee_amount ?? 0),
          feeAccountId: context.fee_account_id ?? '',
          memo: context.note ?? '',
          tagIds: mapTagNamesToIds(tags as any, parseTransactionTagNames(context.tags)),
          occurredAt: toDateInputValue(context.occurred_at),
        })
      })
      .catch((error: any) => {
        if (!cancelled) {
          setTransferInitialValues(null)
          message.error(error?.message || '加载转账编辑数据失败')
        }
      })
      .finally(() => {
        if (!cancelled) setSpecialFormLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTransaction?.id, bookId, isTransferTransaction, tags, visible])

  const refreshDetail = async () => {
    if (!activeTransaction?.id || !bookId) return
    const fresh = await apiGet(`/api/transactions/${activeTransaction.id}?book_id=${bookId}`)
    setDetailTransaction(fresh)
    return fresh
  }

  const validateEditForm = () => {
    const nextErrors: Record<string, string> = {}
    if (!form.amount || Number(form.amount) <= 0) nextErrors.amount = '请输入金额'
    if (!form.account_id) nextErrors.account_id = '请选择账户'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSave = async () => {
    if (!activeTransaction || !validateEditForm()) return
    setSubmitting(true)
    try {
      const tagsJson = selectedTagIds.length > 0
        ? JSON.stringify(selectedTagIds.map((id) => tags.find((tag: any) => tag.id === id)?.name || '').filter(Boolean))
        : null
      await apiPatch(`/api/transactions/${activeTransaction.id}?book_id=${bookId}`, {
        amount: parseFloat(form.amount),
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note || null,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
        tags: tagsJson,
      })
      message.success('更新成功')
      await refreshDetail()
      onRefresh()
      setViewMode('detail')
    } catch (error: any) {
      message.error(error?.message || '更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!activeTransaction) return
    if (!confirm('确定要删除这条交易吗？')) return
    setSubmitting(true)
    try {
      await apiDelete(`/api/transactions/${activeTransaction.id}?book_id=${bookId}`)
      message.success('删除成功')
      onRefresh()
      onClose()
    } catch (error: any) {
      message.error(error?.message || '删除失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopyToToday = async () => {
    if (!activeTransaction || isSpecialTransaction || !validateEditForm()) return
    setSubmitting(true)
    try {
      const tagsJson = selectedTagIds.length > 0
        ? JSON.stringify(selectedTagIds.map((id) => tags.find((tag: any) => tag.id === id)?.name || '').filter(Boolean))
        : null
      await apiPost(`/api/transactions?book_id=${bookId}`, {
        transaction_type: form.type === 'income' ? 'income' : 'expense',
        direction: form.type === 'income' ? 'in' : 'out',
        amount: parseFloat(form.amount),
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note || null,
        occurred_at: new Date().toISOString(),
        tags: tagsJson,
      })
      message.success('已复制到今天')
      onRefresh()
      onClose()
    } catch (error: any) {
      message.error(error?.message || '复制失败')
    } finally {
      setSubmitting(false)
    }
  }

  const openRefundModal = (mode: RefundMode) => {
    const today = new Date().toISOString().split('T')[0]
    setRefundMode(mode)
    setRefundForm({
      amount: mode === 'full' ? String(remainingRefundableAmount.toFixed(2)) : '',
      note: '',
      occurred_at: today,
    })
    setRefundModalOpen(true)
  }

  const handleRefundSubmit = async () => {
    if (!activeTransaction) return
    const amount = Number(refundForm.amount)

    if (!refundForm.amount || Number.isNaN(amount) || amount <= 0) {
      message.error('请输入有效退款金额')
      return
    }

    if (amount > remainingRefundableAmount) {
      message.error(`退款金额不能超过剩余可退 ${formatCurrency(remainingRefundableAmount)}`)
      return
    }

    if (!refundForm.occurred_at) {
      message.error('请选择退款日期')
      return
    }

    setSubmitting(true)
    try {
      await apiPost('/api/transactions/refund', {
        original_transaction_id: activeTransaction.id,
        refund_account_id: activeTransaction.account_id,
        amount,
        note: refundForm.note || null,
        occurred_at: new Date(refundForm.occurred_at).toISOString(),
      })
      message.success(refundMode === 'full' ? '退款完成' : '部分退款已记录')
      setRefundModalOpen(false)
      await refreshDetail()
      onRefresh()
    } catch (error: any) {
      message.error(error?.message || '退款失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!transaction) return null

  const tagsForDetail = parseTagLabels(activeTransaction?.tags)
  const hasLinkedRefunds = Array.isArray(activeTransaction?.linked_refunds) && activeTransaction.linked_refunds.length > 0
  const hasRefundProgress = Boolean(activeTransaction?.has_refund) || hasLinkedRefunds
  const refundSummaryVisible =
    activeTransaction?.transaction_type === 'expense' &&
    hasRefundProgress &&
    hasLinkedRefunds
  const refundProgressLabel = activeTransaction?.is_fully_refunded
    ? '已全额退款'
    : '部分退款'

  return (
    <>
      <Modal
        open={visible}
        onCancel={onClose}
        footer={null}
        centered
        width={isSpecialTransaction && viewMode === 'edit' ? 980 : 860}
        destroyOnHidden
        styles={{
          body: {
            maxHeight: '78vh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: 20,
          },
        }}
        title={viewMode === 'detail' ? '交易详情' : '编辑交易'}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : viewMode === 'edit' ? (
          isTransferTransaction ? (
            specialFormLoading ? (
              <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
            ) : transferInitialValues ? (
              <TransferPage
                embedded
                isEditMode
                initialValues={transferInitialValues}
                onCancel={() => setViewMode('detail')}
                onSuccess={async () => {
                  message.success('更新成功')
                  await refreshDetail()
                  onRefresh()
                  setViewMode('detail')
                }}
              />
            ) : null
          ) : isRepaymentTransaction ? (
            repaymentInitialValues ? (
              <OtherTransactionPage
                embedded
                isEditMode
                initialSubType="repay"
                initialValues={repaymentInitialValues}
                onCancel={() => setViewMode('detail')}
                onSuccess={async () => {
                  message.success('更新成功')
                  await refreshDetail()
                  onRefresh()
                  setViewMode('detail')
                }}
              />
            ) : null
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                <div
                  onClick={() => {
                    setForm((current) => ({ ...current, type: 'expense' }))
                    setErrors({})
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    background: form.type === 'expense' ? 'var(--accent-red)' : 'var(--bg-elevated)',
                    color: form.type === 'expense' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  支出
                </div>
                <div
                  onClick={() => {
                    setForm((current) => ({ ...current, type: 'income' }))
                    setErrors({})
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    background: form.type === 'income' ? 'var(--accent-green)' : 'var(--bg-elevated)',
                    color: form.type === 'income' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  收入
                </div>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>金额</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, amount: event.target.value }))
                      setErrors((current) => ({ ...current, amount: '' }))
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: errors.amount ? '1px solid #ff4d4f' : '1px solid var(--border-color)',
                      background: 'var(--bg-input)',
                    }}
                  />
                  {errors.amount ? <div style={{ color: '#ff4d4f', marginTop: 6, fontSize: 12 }}>{errors.amount}</div> : null}
                </div>

                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>账户</div>
                  <select
                    value={form.account_id}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, account_id: event.target.value }))
                      setErrors((current) => ({ ...current, account_id: '' }))
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: errors.account_id ? '1px solid #ff4d4f' : '1px solid var(--border-color)',
                      background: 'var(--bg-input)',
                    }}
                  >
                    <option value="">请选择账户</option>
                    {accounts.map((account: any) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                  {errors.account_id ? <div style={{ color: '#ff4d4f', marginTop: 6, fontSize: 12 }}>{errors.account_id}</div> : null}
                </div>

                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>分类</div>
                  <select
                    value={form.category_id}
                    onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-input)',
                    }}
                  >
                    <option value="">不设置分类</option>
                    {filteredCategories.map((category: any) => (
                      <option key={category.id} value={category.id}>
                        {category.icon ? `${category.icon} ` : ''}{category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>日期</div>
                  <input
                    type="date"
                    value={form.occurred_at}
                    onChange={(event) => setForm((current) => ({ ...current, occurred_at: event.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-input)',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>标签</div>
                  <TagMultiSelect
                    allTags={tags}
                    value={selectedTagIds}
                    onChange={setSelectedTagIds}
                    onTagsUpdated={() => {}}
                    bookId={bookId}
                    placeholder="搜索、选择或创建标签"
                  />
                  {selectedTagLabels.length > 0 ? (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {selectedTagLabels.map((label) => (
                        <span
                          key={label}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-elevated)',
                            fontSize: 12,
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>备注</div>
                  <textarea
                    value={form.note}
                    onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-input)',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
                <Button onClick={() => setViewMode('detail')}>取消</Button>
                <Button type="primary" loading={submitting} onClick={handleSave}>保存修改</Button>
              </div>
            </div>
          )
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            <div
              style={{
                padding: 18,
                borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.01))',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                    {activeTransaction?.merchant || activeTransaction?.note || '交易记录'}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 30,
                      fontWeight: 700,
                      color: activeTransaction?.direction === 'in' || activeTransaction?.transaction_type === 'refund'
                        ? 'var(--accent-green)'
                        : 'var(--accent-red)',
                    }}
                  >
                    {activeTransaction?.direction === 'in' || activeTransaction?.transaction_type === 'refund' ? '+' : '-'}
                    {formatCurrency(activeTransaction?.amount)}
                  </div>
                </div>
                {hasRefundProgress ? (
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: activeTransaction?.is_fully_refunded ? '#dcfce7' : '#fef3c7',
                      color: activeTransaction?.is_fully_refunded ? '#166534' : '#92400e',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {refundProgressLabel}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                <Button icon={<EditOutlined />} onClick={() => setViewMode('edit')}>编辑</Button>
                <Button
                  icon={<UndoOutlined />}
                  onClick={() => openRefundModal('partial')}
                  disabled={!canRefund}
                >
                  部分退款
                </Button>
                <Button
                  onClick={() => openRefundModal('full')}
                  disabled={!canRefund}
                >
                  退款剩余全部
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={handleCopyToToday}
                  disabled={isSpecialTransaction}
                >
                  复制到今天
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <DetailCard label="日期" value={formatDate(activeTransaction?.occurred_at)} />
              <DetailCard label="账户" value={accounts.find((account: any) => account.id === activeTransaction?.account_id)?.name || activeTransaction?.account_id || '-'} />
              <DetailCard label="分类" value={categories.find((category: any) => category.id === activeTransaction?.category_id)?.name || '-'} />
              <DetailCard label="交易类型" value={activeTransaction?.transaction_type || '-'} />
            </div>

            {refundSummaryVisible ? (
              <section
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-card)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>退款信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <DetailCard label="原始金额" value={formatCurrency(activeTransaction?.original_amount ?? activeTransaction?.amount)} />
                  <DetailCard label="已退款" value={formatCurrency(activeTransaction?.refunded_amount)} />
                  <DetailCard label="剩余可退" value={formatCurrency(activeTransaction?.remaining_refundable_amount)} />
                </div>

                {Array.isArray(activeTransaction?.linked_refunds) && activeTransaction.linked_refunds.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>关联退款记录</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {activeTransaction.linked_refunds.map((refund: any) => (
                        <div
                          key={refund.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 14px',
                            borderRadius: 12,
                            background: 'var(--bg-elevated)',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{formatDate(refund.occurred_at)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                              {refund.note || '无退款原因'}
                            </div>
                          </div>
                          <div style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                            +{formatCurrency(refund.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section
              style={{
                padding: 16,
                borderRadius: 16,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>备注</div>
              <div style={{ color: activeTransaction?.note ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {activeTransaction?.note || '暂无备注'}
              </div>
            </section>

            {tagsForDetail.length > 0 ? (
              <section
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-card)',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>标签</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tagsForDetail.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        open={refundModalOpen}
        title={refundMode === 'full' ? '退款剩余全部' : '部分退款'}
        onCancel={() => setRefundModalOpen(false)}
        onOk={handleRefundSubmit}
        okText="确认退款"
        cancelText="取消"
        confirmLoading={submitting}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            当前剩余可退：<strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(remainingRefundableAmount)}</strong>
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>退款金额</div>
            <input
              type="number"
              inputMode="decimal"
              value={refundForm.amount}
              onChange={(event) => setRefundForm((current) => ({ ...current, amount: event.target.value }))}
              placeholder={refundMode === 'partial' ? '请输入退款金额' : ''}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>退款日期</div>
            <input
              type="date"
              value={refundForm.occurred_at}
              onChange={(event) => setRefundForm((current) => ({ ...current, occurred_at: event.target.value }))}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>退款原因（可选）</div>
            <textarea
              rows={3}
              value={refundForm.note}
              onChange={(event) => setRefundForm((current) => ({ ...current, note: event.target.value }))}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
