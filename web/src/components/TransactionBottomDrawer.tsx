import { useState, useEffect } from 'react'
import { Drawer, Button, Select, Input, message, Spin, Tag } from 'antd'
import { DeleteOutlined, UndoOutlined, CopyOutlined } from '@ant-design/icons'

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

  // 加载交易数据
  useEffect(() => {
    if (!transaction || !visible) return
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
          const matchedIds = tags.filter((t: any) => tagNames.includes(t.name)).map((t: any) => t.id)
          setSelectedTagIds(matchedIds)
        }
      } catch {}
    }
  }, [transaction, visible, tags])

  const groupedTags = (() => {
    const parents = tags.filter((t: any) => !t.parent_id)
    return parents.map(p => ({
      ...p,
      children: tags.filter((t: any) => t.parent_id === p.id)
    })).filter(g => g.children.length > 0)
  })()

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
      const payload = {
        transaction_type: form.type === 'income' ? 'income' : 'expense',
        amount: Number(form.amount),
        direction: form.type === 'income' ? 'in' : 'out',
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
        book_id: bookId,
        tags: tagsJson
      }
      await (window as any).apiPatch(`/api/transactions/${transaction.id}`, payload)
      message.success('更新成功')
      onRefresh()
      onClose()
    } catch {
      message.error('更新失败')
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
      await (window as any).apiDelete(`/api/transactions/${transaction.id}?book_id=${bookId}`)
      message.success('删除成功')
      onRefresh()
      onClose()
    } catch {
      message.error('删除失败')
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
      await (window as any).apiPost('/api/transactions/refund', {
        book_id: bookId,
        original_transaction_id: transaction.id,
        refund_account_id: transaction.account_id,
        amount: transaction.amount,
        occurred_at: new Date().toISOString()
      })
      message.success('退款成功')
      onRefresh()
      onClose()
    } catch {
      message.error('退款失败')
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
      const today = new Date().toISOString().split('T')[0]
      const payload = {
        transaction_type: form.type === 'income' ? 'income' : 'expense',
        amount: Number(form.amount),
        direction: form.type === 'income' ? 'in' : 'out',
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note,
        occurred_at: new Date().toISOString(),
        book_id: bookId,
        tags: tagsJson
      }
      await (window as any).apiPost('/api/transactions', payload)
      message.success('已复制到今天')
      onRefresh()
      onClose()
    } catch {
      message.error('复制失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!transaction) return null

  const isExpense = form.type === 'expense'
  const accentColor = isExpense ? '#ff4d4f' : '#52c41a'
  const canRefund = transaction.direction === 'out'

  return (
    <Drawer
      open={visible}
      onClose={onClose}
      placement="bottom"
      height="80vh"
      styles={{ body: { padding: 0 } }}
      onOpenChange={(open) => !open && onClose()}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <>
          {/* 顶部操作按钮 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-light)'
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
                disabled={!canRefund}
              >退款</Button>
              <Button 
                size="small" 
                icon={<CopyOutlined />} 
                onClick={handleCopyToToday}
              >复制到今天</Button>
            </div>
          </div>

          {/* 表单内容 */}
          <div style={{ padding: 16, maxHeight: 'calc(80vh - 120px)', overflow: 'auto' }}>
            {/* 支出/收入切换 */}
            <div style={{ display: 'flex', background: 'var(--border-light)', borderRadius: 20, padding: 3, marginBottom: 16 }}>
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
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>账户</div>
              <Select
                placeholder="选择账户"
                value={form.account_id || undefined}
                onChange={v => { setForm(f => ({ ...f, account_id: v || '' })); setErrors(prev => ({ ...prev, account_id: '' })) }}
                style={{ width: '100%' }}
                status={errors.account_id ? 'error' : undefined}
              >
                {accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}
              </Select>
              {errors.account_id && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{errors.account_id}</div>}
            </div>

            {/* 分类选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>分类</div>
              <Select
                placeholder="选择分类（可选）"
                value={form.category_id || undefined}
                onChange={v => setForm(f => ({ ...f, category_id: v || '' }))}
                style={{ width: '100%' }}
                allowClear
              >
                {categories.filter(c => c.category_type === form.type).map(c => (
                  <Select.Option key={c.id} value={c.id}>{c.icon ? c.icon + ' ' : ''}{c.name}</Select.Option>
                ))}
              </Select>
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

            {/* 标签选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>标签</div>
              <Select
                mode="multiple"
                placeholder="选择标签（可选）"
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                style={{ width: '100%' }}
                allowClear
                maxTagCount={3}
              >
                {groupedTags.map(group => (
                  <Select.OptGroup key={group.id} label={<span><Tag color={group.color} style={{ marginRight: 4, fontSize: 12 }}>{group.name}</Tag></span>}>
                    {group.children.map((child: any) => (
                      <Select.Option key={child.id} value={child.id}>
                        <Tag color={group.color} style={{ fontSize: 12 }}>{child.name}</Tag>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                ))}
              </Select>
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
          </div>

          {/* 底部按钮 */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            padding: 16, 
            borderTop: '1px solid var(--border-light)',
            position: 'sticky',
            bottom: 0,
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
        </>
      )}
    </Drawer>
  )
}