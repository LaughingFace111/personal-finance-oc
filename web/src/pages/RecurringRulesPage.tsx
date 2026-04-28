import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Form, Input, InputNumber, List, Modal, Popconfirm, Select, Space, Spin, Switch, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { CategorySelector } from '../components/CategorySelector'
import { apiDelete, apiGet, apiPatch, apiPost } from '../services/api'
import { getDefaultBookId } from './transactionFormSupport'

interface AccountOption {
  id: string
  name: string
  account_type: string
}

interface CategoryOption {
  id: string
  name: string
  category_type: string
  parent_id?: string | null
}

interface RecurringRuleRecord {
  id: string
  rule_name: string
  transaction_type: string
  direction: 'in' | 'out' | 'internal'
  amount: number
  currency: string
  account_id: string
  counterparty_account_id?: string | null
  category_id?: string | null
  merchant?: string | null
  note?: string | null
  tags?: string | null
  extra?: string | null
  schedule_type: 'daily' | 'weekly' | 'monthly'
  interval_value: number
  day_of_month?: number | null
  weekday?: number | null
  start_date: string
  end_date?: string | null
  next_occurs_on: string
  auto_confirm: boolean
  is_active: boolean
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface RecurringRuleFormValues {
  rule_name: string
  direction: 'in' | 'out'
  amount: number
  account_id: string
  category_id?: string
  period_type: PeriodType
  start_date: string
  weekday?: number
  day_of_month?: number
  note?: string
  merchant?: string
  auto_confirm: boolean
  is_active: boolean
}

function getPeriodType(rule: RecurringRuleRecord): PeriodType {
  if (rule.schedule_type === 'monthly' && rule.interval_value === 12) {
    return 'yearly'
  }
  return rule.schedule_type
}

function toPayload(values: RecurringRuleFormValues) {
  const direction = values.direction
  const periodType = values.period_type
  const scheduleType = periodType === 'yearly' ? 'monthly' : periodType
  const intervalValue = periodType === 'yearly' ? 12 : 1

  return {
    rule_name: values.rule_name.trim(),
    transaction_type: direction === 'in' ? 'income' : 'expense',
    direction,
    amount: values.amount,
    currency: 'CNY',
    account_id: values.account_id,
    category_id: values.category_id || null,
    merchant: values.merchant?.trim() || null,
    note: values.note?.trim() || null,
    schedule_type: scheduleType,
    interval_value: intervalValue,
    weekday: periodType === 'weekly' ? values.weekday ?? 0 : null,
    day_of_month: periodType === 'monthly' || periodType === 'yearly' ? values.day_of_month ?? 1 : null,
    start_date: values.start_date,
    auto_confirm: values.auto_confirm,
    is_active: values.is_active,
  }
}

function getInitialValues(rule?: RecurringRuleRecord | null): RecurringRuleFormValues {
  if (!rule) {
    return {
      rule_name: '',
      direction: 'out',
      amount: 0,
      account_id: '',
      category_id: undefined,
      period_type: 'monthly',
      start_date: new Date().toISOString().slice(0, 10),
      weekday: 0,
      day_of_month: 1,
      note: '',
      merchant: '',
      auto_confirm: false,
      is_active: true,
    }
  }

  return {
    rule_name: rule.rule_name,
    direction: rule.direction === 'in' ? 'in' : 'out',
    amount: Number(rule.amount),
    account_id: rule.account_id,
    category_id: rule.category_id || undefined,
    period_type: getPeriodType(rule),
    start_date: rule.start_date,
    weekday: rule.weekday ?? 0,
    day_of_month: rule.day_of_month ?? 1,
    note: rule.note || '',
    merchant: rule.merchant || '',
    auto_confirm: rule.auto_confirm,
    is_active: rule.is_active,
  }
}

function getCategoryLabel(categories: CategoryOption[], categoryId?: string | null) {
  if (!categoryId) return '未设置分类'
  const category = categories.find((item) => item.id === categoryId)
  if (!category) return '未设置分类'
  if (!category.parent_id) return category.name
  const parent = categories.find((item) => item.id === category.parent_id)
  return parent ? `${parent.name} / ${category.name}` : category.name
}

function getPeriodText(rule: RecurringRuleRecord) {
  const type = getPeriodType(rule)
  if (type === 'daily') return '每天'
  if (type === 'weekly') return `每周${['一', '二', '三', '四', '五', '六', '日'][rule.weekday ?? 0]}`
  if (type === 'yearly') return `每年 ${rule.day_of_month ?? 1} 日`
  return `每月 ${rule.day_of_month ?? 1} 日`
}

export default function RecurringRulesPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm<RecurringRuleFormValues>()
  const [bookId, setBookId] = useState<string | null>(null)
  const [rules, setRules] = useState<RecurringRuleRecord[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RecurringRuleRecord | null>(null)

  const activeRuleCount = useMemo(() => rules.filter((item) => item.is_active).length, [rules])

  const loadData = async (currentBookId?: string | null) => {
    const targetBookId = currentBookId ?? bookId
    if (!targetBookId) return
    setLoading(true)
    try {
      const [ruleData, accountData, categoryData] = await Promise.all([
        apiGet<RecurringRuleRecord[]>(`/api/recurring-rules?book_id=${targetBookId}`),
        apiGet<AccountOption[]>(`/api/accounts?book_id=${targetBookId}`),
        apiGet<CategoryOption[]>(`/api/categories?book_id=${targetBookId}`),
      ])
      setRules(ruleData || [])
      setAccounts(accountData || [])
      setCategories(categoryData || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const currentBookId = await getDefaultBookId()
        setBookId(currentBookId)
        if (currentBookId) {
          await loadData(currentBookId)
        } else {
          setLoading(false)
        }
      } catch {
        setLoading(false)
      }
    }
    void init()
  }, [])

  const openCreateModal = () => {
    setEditingRule(null)
    form.setFieldsValue(getInitialValues())
    setModalOpen(true)
  }

  const openEditModal = (rule: RecurringRuleRecord) => {
    setEditingRule(rule)
    form.setFieldsValue(getInitialValues(rule))
    setModalOpen(true)
  }

  const handleSubmit = async (values: RecurringRuleFormValues) => {
    if (!bookId) {
      message.error('未找到默认账本')
      return
    }
    if (values.amount <= 0) {
      message.error('金额必须大于 0')
      return
    }

    const payload = toPayload(values)
    setSaving(true)
    try {
      if (editingRule) {
        await apiPatch(`/api/recurring-rules/${editingRule.id}?book_id=${bookId}`, payload)
        message.success('规则已更新')
      } else {
        await apiPost(`/api/recurring-rules?book_id=${bookId}`, payload)
        message.success('规则已创建')
      }
      setModalOpen(false)
      form.resetFields()
      await loadData(bookId)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (rule: RecurringRuleRecord, checked: boolean) => {
    if (!bookId) return
    await apiPatch(`/api/recurring-rules/${rule.id}?book_id=${bookId}`, { is_active: checked })
    message.success(checked ? '规则已启用' : '规则已停用')
    await loadData(bookId)
  }

  const handleDelete = async (ruleId: string) => {
    if (!bookId) return
    await apiDelete(`/api/recurring-rules/${ruleId}?book_id=${bookId}`)
    message.success('规则已删除')
    await loadData(bookId)
  }

  const periodType = Form.useWatch('period_type', form)
  const direction = Form.useWatch('direction', form)

  const filteredCategories = categories.filter(
    (category) => !direction || category.category_type === (direction === 'in' ? 'income' : 'expense'),
  )

  return (
    <div>
      <Card
        title="周期记账"
        extra={
          <Space>
            <Button onClick={() => navigate('/settings')}>返回设置</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新建规则</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ color: 'var(--text-secondary)' }}>
          维护固定周期的收支规则，系统可按设定日期生成待处理记账事项。
        </div>
      </Card>

      <Card title={`共 ${rules.length} 条规则，已启用 ${activeRuleCount} 条`}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : rules.length === 0 ? (
          <Empty description="还没有周期规则" />
        ) : (
          <List
            itemLayout="vertical"
            dataSource={rules}
            renderItem={(rule) => {
              const accountName = accounts.find((item) => item.id === rule.account_id)?.name || '未知账户'
              return (
                <List.Item
                  key={rule.id}
                  actions={[
                    <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openEditModal(rule)}>编辑</Button>,
                    <Popconfirm key="delete" title="确认删除该规则？" onConfirm={() => void handleDelete(rule.id)}>
                      <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>,
                  ]}
                  extra={<Switch checked={rule.is_active} checkedChildren="启用" unCheckedChildren="停用" onChange={(checked) => void handleToggleActive(rule, checked)} />}
                >
                  <Space wrap style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{rule.rule_name}</span>
                    <Tag color={rule.direction === 'in' ? 'green' : 'red'}>{rule.direction === 'in' ? '收入' : '支出'}</Tag>
                    <Tag>{getPeriodText(rule)}</Tag>
                  </Space>
                  <div style={{ marginBottom: 8 }}>
                    金额 {Number(rule.amount).toFixed(2)} {rule.currency} · 账户 {accountName} · 分类 {getCategoryLabel(categories, rule.category_id)}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    开始日期 {rule.start_date} · 下次执行 {rule.next_occurs_on}
                    {rule.note ? ` · 备注 ${rule.note}` : ''}
                  </div>
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <Modal
        title={editingRule ? '编辑周期规则' : '新建周期规则'}
        open={modalOpen}
        width={720}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          <Form.Item name="rule_name" label="名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="如：房租、会员订阅、工资发放" />
          </Form.Item>
          <Form.Item name="direction" label="收支方向" rules={[{ required: true, message: '请选择收支方向' }]}>
            <Select
              options={[
                { value: 'out', label: '支出' },
                { value: 'in', label: '收入' },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="请输入金额" />
          </Form.Item>
          <Form.Item name="account_id" label="账户" rules={[{ required: true, message: '请选择账户' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={accounts.map((account) => ({
                value: account.id,
                label: account.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="category_id" label="类别">
            <CategorySelector
              categories={filteredCategories as any}
              value={form.getFieldValue('category_id') || ''}
              onChange={(value) => form.setFieldValue('category_id', value || undefined)}
              bookId={bookId || null}
              onCategoriesUpdated={(nextItems) => setCategories(nextItems as CategoryOption[])}
              placeholder="可选"
            />
          </Form.Item>
          <Form.Item name="period_type" label="周期类型" rules={[{ required: true, message: '请选择周期类型' }]}>
            <Select
              options={[
                { value: 'daily', label: '每天' },
                { value: 'weekly', label: '每周' },
                { value: 'monthly', label: '每月' },
                { value: 'yearly', label: '每年' },
              ]}
            />
          </Form.Item>
          {periodType === 'weekly' ? (
            <Form.Item name="weekday" label="执行星期">
              <Select
                options={[
                  { value: 0, label: '星期一' },
                  { value: 1, label: '星期二' },
                  { value: 2, label: '星期三' },
                  { value: 3, label: '星期四' },
                  { value: 4, label: '星期五' },
                  { value: 5, label: '星期六' },
                  { value: 6, label: '星期日' },
                ]}
              />
            </Form.Item>
          ) : null}
          {periodType === 'monthly' || periodType === 'yearly' ? (
            <Form.Item name="day_of_month" label={periodType === 'yearly' ? '执行日期' : '每月日期'}>
              <InputNumber min={1} max={31} style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="merchant" label="对方名称">
            <Input placeholder="如：房东、公司、平台商户" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} placeholder="补充说明" />
          </Form.Item>
          <Form.Item name="auto_confirm" label="自动确认" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="is_active" label="启用规则" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
