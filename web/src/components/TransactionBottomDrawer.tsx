import { useState, useEffect, useMemo } from 'react'
import { Drawer, Button, Input, message, Spin } from 'antd'
import { DeleteOutlined, UndoOutlined, CopyOutlined } from '@ant-design/icons'
import { apiDelete, apiGet, apiPatch, apiPost } from '../services/api'
import { HierarchyPickerModal } from './HierarchyPickerModal'
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
  bookId: string
}

interface CategoryOption {
  id: string
  name: string
  icon?: string
  parent_id?: string
  category_type?: string
  color?: string
}

interface TagOption {
  id: string
  name: string
  parent_id?: string
  color?: string
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

export function TransactionBottomDrawer({
  visible,
  transaction,
  onClose,
  onRefresh,
  accounts,
  categories,
  tags,
  bookId
}: TransactionBottomDrawerProps) {
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    account_id: '',
    category_id: '',
    note: '',
    occurred_at: ''
  })
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [specialFormLoading, setSpecialFormLoading] = useState(false)
  const [transferInitialValues, setTransferInitialValues] = useState<TransferFormInitialValues | null>(null)

  // 弹窗状态
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [tagModalOpen, setTagModalOpen] = useState(false)

  const isTransferTransaction = transaction?.transaction_type === 'transfer'
  const isRepaymentTransaction = transaction?.transaction_type === 'repayment_credit_card'
  const isSpecialTransaction = isTransferTransaction || isRepaymentTransaction

  // 🛡️ L: Bug 2 修复 - 强制清理标签状态，防止跨交易泄漏
  useEffect(() => {
    if (!visible) {
      // 弹窗关闭时重置标签状态
      setSelectedTagIds([])
      setTagModalOpen(false)
      setCategoryModalOpen(false)
    }
  }, [visible])

  // 🛡️ L: Bug 2 修复 - 交易切换时立即清理状态
  useEffect(() => {
    if (!transaction || !visible) return
    if (isSpecialTransaction) return
    setForm({
      type: transaction.direction === 'in' ? 'income' : 'expense',
      amount: String(transaction.amount),
      account_id: transaction.account_id || '',
      category_id: transaction.category_id || '',
      note: transaction.note || '',
      occurred_at: transaction.occurred_at ? transaction.occurred_at.split('T')[0] : ''
    })
    // 🛡️ L: 先清理再加载，防止残留
    setSelectedTagIds([])
    // 解析标签
    if (transaction.tags) {
      try {
        const tagNames = typeof transaction.tags === 'string' ? JSON.parse(transaction.tags) : transaction.tags
        if (Array.isArray(tagNames)) {
          setSelectedTagIds(mapTagNamesToIds(tags as any, tagNames.map(String)))
        }
      } catch (error) {
        console.error("Request failed:", error)
      }
    }
  }, [isSpecialTransaction, transaction?.id, visible, tags])  // 依赖 transaction.id 而不是整个 transaction 对象

  // Body滚动锁定 - 防止滚动穿透
  useEffect(() => {
    if (visible) {
      // 记录滚动位置
      const scrollY = window.scrollY
      // 锁定body滚动
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${scrollY}px`
      
      return () => {
        // 恢复滚动
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [visible])

  // 加载交易数据
  useEffect(() => {
    if (!transaction || !visible) return
    if (isSpecialTransaction) return
    setForm({
      type: transaction.direction === 'in' ? 'income' : 'expense',
      amount: String(transaction.amount),
      account_id: transaction.account_id || '',
      category_id: transaction.category_id || '',
      note: transaction.note || '',
      occurred_at: transaction.occurred_at ? transaction.occurred_at.split('T')[0] : ''
    })
    // 解析标签
    if (transaction.tags) {
      try {
        const tagNames = typeof transaction.tags === 'string' ? JSON.parse(transaction.tags) : transaction.tags
        if (Array.isArray(tagNames)) {
          setSelectedTagIds(mapTagNamesToIds(tags as any, tagNames.map(String)))
        }
      } catch (error) {
        console.error("Request failed:", error)
      }
    }
  }, [isSpecialTransaction, transaction, visible, tags])

  useEffect(() => {
    if (!transaction || !visible) {
      setTransferInitialValues(null)
      setSpecialFormLoading(false)
      return
    }

    if (!isTransferTransaction) {
      setTransferInitialValues(null)
      setSpecialFormLoading(false)
      return
    }

    let isCancelled = false
    setSpecialFormLoading(true)
    apiGet<TransferEditContextResponse>(`/api/transactions/transfer/${transaction.id}/edit?book_id=${bookId}`)
      .then((context) => {
        if (isCancelled) return
        const tagIds = mapTagNamesToIds(tags as any, parseTransactionTagNames(context.tags))
        setTransferInitialValues({
          transactionId: context.transaction_id,
          fromAccountId: context.from_account_id,
          toAccountId: context.to_account_id,
          amount: String(context.amount),
          feeAmount: String(context.fee_amount ?? 0),
          feeAccountId: context.fee_account_id ?? '',
          memo: context.note ?? '',
          tagIds,
          occurredAt: toDateInputValue(context.occurred_at),
        })
      })
      .catch((err: any) => {
        if (!isCancelled) {
          setTransferInitialValues(null)
          message.error(err?.message || '加载转账编辑数据失败')
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setSpecialFormLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [bookId, isTransferTransaction, tags, transaction, visible])

  const repaymentInitialValues = useMemo<OtherTransactionFormInitialValues | null>(() => {
    if (!isRepaymentTransaction || !transaction) return null
    const tagIds = mapTagNamesToIds(tags as any, parseTransactionTagNames(transaction.tags))
    return {
      transactionId: transaction.id,
      subType: 'repay',
      accountId: transaction.account_id || '',
      creditCardAccountId: transaction.counterparty_account_id || '',
      amount: String(transaction.amount ?? ''),
      memo: transaction.note || '',
      tagIds,
      date: toDateInputValue(transaction.occurred_at),
    }
  }, [isRepaymentTransaction, tags, transaction])

  // 过滤分类
  const filteredCategories = useMemo(() => {
    return categories.filter((c: any) => {
      if (form.type === 'income') {
        return c.category_type === 'income' || c.category_type === 'income_expense'
      }
      return c.category_type === 'expense' || c.category_type === 'income_expense'
    })
  }, [categories, form.type])

  // 获取分类显示名称
  const getCategoryLabel = (categoryId: string) => {
    const cat = categories.find((c: any) => c.id === categoryId)
    if (!cat) return ''
    if (cat.parent_id) {
      const parent = categories.find((c: any) => c.id === cat.parent_id)
      return parent ? `${parent.name} / ${cat.name}` : cat.name
    }
    return cat.name
  }

  // 获取标签显示名称
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

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.amount || Number(form.amount) <= 0) errs.amount = '请输入金额'
    if (!form.account_id) errs.account_id = '请选择账户'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // 保存修改
  const handleSave = async () => {
    if (!validate() || !transaction) return
    setSubmitting(true)
    try {
      const tagsJson = selectedTagIds.length > 0
        ? JSON.stringify(selectedTagIds.map(id => tags.find((t: any) => t.id === id)?.name || '').filter(Boolean))
        : null
      // 只发送 TransactionUpdate schema 中允许的字段，确保类型正确
      const payload = {
        amount: parseFloat(form.amount),
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note || null,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
        tags: tagsJson
      }
      console.log('PATCH payload:', JSON.stringify(payload))
      await apiPatch(`/api/transactions/${transaction.id}?book_id=${bookId}`, payload)
      message.success('更新成功')
      onRefresh()
      onClose()
    } catch (err: any) {
      console.error('更新失败详细:', err, window.__lastError)
      const errMsg = err?.message || err?.detail || window.__lastError?.detail || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || '更新失败'
      message.error('更新失败: ' + errMsg)
    } finally {
      setSubmitting(false)
    }
  }

  // 删除交易
  const handleDelete = async () => {
    if (!transaction) return
    if (!confirm('确定要删除这条交易吗？')) return
    setLoading(true)
    try {
      await apiDelete(`/api/transactions/${transaction.id}?book_id=${bookId}`)
      message.success('删除成功')
      onRefresh()
      onClose()
    } catch (err: any) {
      console.error('删除失败详细:', err)
      message.error('删除失败: ' + (err?.message || err?.detail || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 退款
  const handleRefund = async () => {
    if (!transaction) return
    if (transaction.direction !== 'out') {
      message.info('只能对支出交易发起退款')
      return
    }
    if (!confirm(`确定要退款 ¥${Number(transaction.amount).toFixed(2)} 吗？`)) return
    setLoading(true)
    try {
      await apiPost('/api/transactions/refund', {
        book_id: bookId,
        original_transaction_id: transaction.id,
        refund_account_id: transaction.account_id,
        amount: transaction.amount,
        occurred_at: new Date().toISOString()
      })
      message.success('退款成功')
      onRefresh()
      onClose()
    } catch (err: any) {
      console.error('退款失败详细:', err)
      message.error('退款失败: ' + (err?.message || err?.detail || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 复制到今天（新增）
  const handleCopyToToday = async () => {
    if (!validate() || !transaction) return
    setSubmitting(true)
    try {
      const tagsJson = selectedTagIds.length > 0
        ? JSON.stringify(selectedTagIds.map(id => tags.find((t: any) => t.id === id)?.name || '').filter(Boolean))
        : null
      const payload = {
        transaction_type: form.type === 'income' ? 'income' : 'expense',
        direction: form.type === 'income' ? 'in' : 'out',
        amount: parseFloat(form.amount),
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note,
        occurred_at: new Date().toISOString(),
        include_in_expense: true,
        include_in_income: true,
        include_in_cashflow: true,
        tags: tagsJson
      }
      await apiPost('/api/transactions?book_id=' + bookId, payload)
      message.success('已复制到今天')
      onRefresh()
      onClose()
    } catch (err: any) {
      console.error('复制失败详细:', err)
      message.error('复制失败: ' + (err?.message || err?.detail || '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!transaction) return null

  const isExpense = form.type === 'expense'
  const accentColor = isExpense ? '#ff4d4f' : '#52c41a'
  const canRefund = transaction.direction === 'out'
  const canCopyToToday = !isSpecialTransaction

  return (
    <Drawer
      open={visible}
      onClose={onClose}
      placement="bottom"
      height="80vh"
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      onOpenChange={(open) => !open && onClose()}
      // 禁止左右滑动，只能上下滑动
      push={{ distance: 0 }}
      motion={null}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <>
          {/* Header 区域 - 固定不滚动 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-light)',
            flexShrink: 0
          }}>
            <span style={{ fontWeight: 500 }}>编辑交易</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button 
                size="small" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={handleDelete}
              >删除</Button>
              <Button 
                size="small" 
                icon={<UndoOutlined />} 
                onClick={handleRefund}
                disabled={!canRefund || isSpecialTransaction}
              >退款</Button>
              <Button 
                size="small" 
                icon={<CopyOutlined />} 
                onClick={handleCopyToToday}
                disabled={!canCopyToToday}
              >复制到今天</Button>
            </div>
          </div>

          {/* Body 滚动区域 - 自适应高度 */}
          <div style={{ 
            flex: 1, 
            overflowX: 'hidden', 
            overflowY: 'auto',
            padding: 16,
            paddingBottom: 24
          }}>
            {isTransferTransaction ? (
              specialFormLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
              ) : transferInitialValues ? (
                <TransferPage
                  embedded
                  isEditMode
                  initialValues={transferInitialValues}
                  onCancel={onClose}
                  onSuccess={() => {
                    message.success('更新成功')
                    onRefresh()
                    onClose()
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
                  onCancel={onClose}
                  onSuccess={() => {
                    message.success('更新成功')
                    onRefresh()
                    onClose()
                  }}
                />
              ) : null
            ) : (
              <>
            {/* 支出/收入切换 */}
            <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--border-light)', borderRadius: 20, padding: 3, marginBottom: 16 }}>
              <div
                onClick={() => { setForm(f => ({ ...f, type: 'expense' })); setErrors({}) }}
                style={{
                  padding: '6px 24px', borderRadius: 18, cursor: 'pointer',
                  background: isExpense ? 'var(--accent-red)' : 'transparent',
                  color: isExpense ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 500, fontSize: 15, transition: 'all 0.2s',
                }}
              >支出</div>
              <div
                onClick={() => { setForm(f => ({ ...f, type: 'income' })); setErrors({}) }}
                style={{
                  padding: '6px 24px', borderRadius: 18, cursor: 'pointer',
                  background: !isExpense ? 'var(--accent-green)' : 'transparent',
                  color: !isExpense ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 500, fontSize: 15, transition: 'all 0.2s',
                }}
              >收入</div>
            </div>

            {/* 金额输入 */}
            <div style={{ 
              textAlign: 'center', 
              padding: '16px', 
              marginBottom: 16,
              background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}15)`,
              borderRadius: 12,
              border: errors.amount ? `2px solid ${accentColor}` : '2px solid transparent'
            }}>
              <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>
                {isExpense ? '支出金额' : '收入金额'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
                <span style={{ fontSize: 28, color: accentColor, fontWeight: 300, marginRight: 4 }}>¥</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setErrors(prev => ({ ...prev, amount: '' })) }}
                  style={{
                    fontSize: 36, fontWeight: 600, color: accentColor,
                    border: 'none', background: 'transparent', outline: 'none',
                    width: '50%', textAlign: 'left',
                  }}
                />
              </div>
              {errors.amount && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 8 }}>{errors.amount}</div>}
            </div>

            {/* 账户选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>账户 *</div>
              <select
                value={form.account_id}
                onChange={e => { setForm(f => ({ ...f, account_id: e.target.value })); setErrors(prev => ({ ...prev, account_id: '' })) }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: errors.account_id ? '1px solid #ff4d4f' : '1px solid var(--border-color)',
                  fontSize: 15, background: 'var(--bg-input)', color: 'var(--text-primary)',
                }}
              >
                <option value="">选择账户</option>
                {accounts.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {errors.account_id && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{errors.account_id}</div>}
            </div>

            {/* 分类选择 - 弹窗选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>类别</div>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(true)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', fontSize: 15,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', textAlign: 'left'
                }}
              >
                <span style={{ color: form.category_id ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {form.category_id ? getCategoryLabel(form.category_id) : '点击选择类别'}
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>›</span>
              </button>
            </div>

            {/* 日期选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>日期</div>
              <input
                type="date"
                value={form.occurred_at}
                onChange={e => setForm(f => ({ ...f, occurred_at: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', fontSize: 15,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* 标签选择 - 弹窗选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>标签</div>
              <button
                type="button"
                onClick={() => setTagModalOpen(true)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', fontSize: 15,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  cursor: 'pointer', textAlign: 'left', minHeight: '42px'
                }}
              >
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
                  {selectedTagLabels.length > 0 ? (
                    selectedTagLabels.map((label) => (
                      <span
                        key={label}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '999px',
                          background: 'var(--bg-elevated)',
                          padding: '2px 10px',
                          fontSize: 12,
                        }}
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>点击选择标签</span>
                  )}
                </span>
                <span style={{ color: 'var(--text-tertiary)', lineHeight: '24px' }}>›</span>
              </button>
            </div>

            {/* 备注输入 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>备注（可选）</div>
              <Input
                placeholder="添加备注"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              />
            </div>
              </>
            )}
          </div>

          {/* Footer 区域 - 固定不滚动 */}
          {!isSpecialTransaction ? (
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            padding: 16, 
            borderTop: '1px solid var(--border-light)',
            flexShrink: 0,
            background: 'var(--bg-primary)'
          }}>
            <Button 
              size="large" 
              style={{ flex: 1, height: 48, borderRadius: 12 }} 
              onClick={onClose}
            >取消</Button>
            <Button
              type="primary"
              size="large"
              loading={submitting}
              style={{ 
                flex: 2, 
                height: 48, 
                borderRadius: 12, 
                background: accentColor, 
                borderColor: accentColor 
              }}
              onClick={handleSave}
            >保存</Button>
          </div>
          ) : null}

          {/* 分类选择弹窗 */}
          {!isSpecialTransaction ? <HierarchyPickerModal
            open={categoryModalOpen}
            title="选择类别"
            items={filteredCategories as any}
            value={form.category_id}
            emptyText="暂无可选类别"
            onCancel={() => setCategoryModalOpen(false)}
            onConfirm={(nextValue) => {
              setForm(f => ({ ...f, category_id: typeof nextValue === 'string' ? nextValue : '' }))
              setCategoryModalOpen(false)
            }}
          /> : null}

          {/* 标签选择弹窗 */}
          {!isSpecialTransaction ? <HierarchyPickerModal
            open={tagModalOpen}
            title="选择标签"
            items={tags as any}
            value={selectedTagIds}
            multiple
            emptyText="暂无可选标签"
            onCancel={() => setTagModalOpen(false)}
            onConfirm={(nextValue) => {
              setSelectedTagIds(Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [])
              setTagModalOpen(false)
            }}
          /> : null}
        </>
      )}
    </Drawer>
  )
}
