import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Form, Input, InputNumber, Radio, Select, Spin, Switch, message } from 'antd'

import { useAuth } from '../App'
import { CategorySelector, type CategoryOption } from '../components/CategorySelector'
import { TagMultiSelect } from '../components/TagMultiSelect'
import type { TagOption } from './transactionFormSupport'
import { apiGet, apiPatch, apiPost } from '../services/api'

type BudgetFormValues = {
  name: string
  amount: number
  period_type: 'monthly' | 'custom_range'
  dimension_type: 'overall' | 'category' | 'tag'
  start_date: string
  end_date: string
  category_id?: string
  tag_id?: string
  rollup_children: boolean
  note?: string
}

type BudgetDetail = BudgetFormValues & {
  id: string
  status: 'active' | 'archived'
  category_name?: string | null
  tag_name?: string | null
}

const toMonthValue = (dateText?: string) => dateText ? dateText.slice(0, 7) : ''

const getMonthRange = (monthValue: string) => {
  const [yearText, monthText] = monthValue.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  if (!year || !month) return { start: '', end: '' }
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${yearText}-${monthText}-01`,
    end: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  }
}

export default function BudgetFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const bookId = user?.default_book_id

  const [form] = Form.useForm<BudgetFormValues>()
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [monthValue, setMonthValue] = useState('')
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [tags, setTags] = useState<TagOption[]>([])
  const periodType = Form.useWatch('period_type', form) || 'monthly'
  const dimensionType = Form.useWatch('dimension_type', form) || 'overall'
  const selectedCategoryId = Form.useWatch('category_id', form) || ''

  const initialMonth = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    const { start, end } = getMonthRange(initialMonth)
    form.setFieldsValue({
      period_type: 'monthly',
      dimension_type: 'overall',
      start_date: start,
      end_date: end,
      rollup_children: true,
    })
    setMonthValue(initialMonth)
  }, [form, initialMonth])

  useEffect(() => {
    if (!bookId) return
    Promise.all([
      apiGet<CategoryOption[]>(`/api/categories?book_id=${bookId}`),
      apiGet<TagOption[]>(`/api/tags?book_id=${bookId}`),
    ])
      .then(([categoryData, tagData]) => {
        setCategories((categoryData || []).filter((item) => item.category_type === 'expense'))
        setTags((tagData || []).filter((item) => item.is_active !== false))
      })
      .catch(() => {
        setCategories([])
        setTags([])
      })
  }, [bookId])

  useEffect(() => {
    if (!bookId || !isEdit || !id) return
    setLoading(true)
    apiGet<BudgetDetail>(`/api/budgets/${id}?book_id=${bookId}`)
      .then((budget) => {
        form.setFieldsValue({
          name: budget.name,
          amount: Number(budget.amount),
          period_type: budget.period_type,
          dimension_type: budget.dimension_type,
          start_date: budget.start_date,
          end_date: budget.end_date,
          category_id: budget.category_id || undefined,
          tag_id: budget.tag_id || undefined,
          rollup_children: budget.rollup_children,
          note: budget.note || '',
        })
        if (budget.period_type === 'monthly') {
          setMonthValue(toMonthValue(budget.start_date))
        }
      })
      .catch((err: any) => message.error(err.message || '加载预算失败'))
      .finally(() => setLoading(false))
  }, [bookId, form, id, isEdit])

  const handlePeriodTypeChange = (nextType: 'monthly' | 'custom_range') => {
    if (nextType === 'monthly') {
      const month = monthValue || initialMonth
      const { start, end } = getMonthRange(month)
      setMonthValue(month)
      form.setFieldsValue({ period_type: nextType, start_date: start, end_date: end })
      return
    }
    form.setFieldsValue({ period_type: nextType })
  }

  const handleMonthChange = (value: string) => {
    setMonthValue(value)
    const { start, end } = getMonthRange(value)
    form.setFieldsValue({ start_date: start, end_date: end })
  }

  const handleDimensionChange = (nextType: 'overall' | 'category' | 'tag') => {
    if (nextType === 'overall') {
      form.setFieldsValue({
        dimension_type: 'overall',
        category_id: undefined,
        tag_id: undefined,
        rollup_children: true,
      })
      return
    }
    if (nextType === 'tag') {
      form.setFieldsValue({
        dimension_type: 'tag',
        category_id: undefined,
        tag_id: form.getFieldValue('tag_id'),
        rollup_children: true,
      })
      return
    }
    form.setFieldsValue({
      dimension_type: 'category',
      tag_id: undefined,
      rollup_children: form.getFieldValue('rollup_children') ?? true,
    })
  }

  const handleSubmit = async (values: BudgetFormValues) => {
    if (!bookId) return
    if (Number(values.amount) <= 0) {
      message.error('预算金额必须大于 0')
      return
    }
    if (values.period_type === 'custom_range' && values.start_date >= values.end_date) {
      message.error('自定义区间的开始日期必须早于结束日期')
      return
    }
    if (values.dimension_type === 'category' && !values.category_id) {
      message.error('请选择预算分类')
      return
    }
    if (values.dimension_type === 'tag' && !values.tag_id) {
      message.error('请选择预算标签')
      return
    }

    const payload = {
      name: values.name.trim(),
      amount: values.amount,
      period_type: values.period_type,
      dimension_type: values.dimension_type,
      start_date: values.start_date,
      end_date: values.end_date,
      category_id: values.dimension_type === 'category' ? values.category_id || null : null,
      tag_id: values.dimension_type === 'tag' ? values.tag_id || null : null,
      rollup_children: values.dimension_type === 'category' ? values.rollup_children : true,
      note: values.note || null,
    }

    try {
      setSubmitting(true)
      if (isEdit && id) {
        await apiPatch(`/api/budgets/${id}?book_id=${bookId}`, {
          name: payload.name,
          amount: payload.amount,
          dimension_type: payload.dimension_type,
          start_date: payload.start_date,
          end_date: payload.end_date,
          category_id: payload.category_id,
          tag_id: payload.tag_id,
          rollup_children: payload.rollup_children,
          note: payload.note,
        })
        message.success('预算已更新')
        navigate(`/budgets/${id}`)
      } else {
        const created = await apiPost<{ id: string }>(`/api/budgets?book_id=${bookId}`, payload)
        message.success('预算已创建')
        navigate(`/budgets/${created.id}`)
      }
    } catch {
      // error handled by api layer
    } finally {
      setSubmitting(false)
    }
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>
  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>

  return (
    <Card style={{ borderRadius: 16, borderColor: 'var(--border-color)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{isEdit ? '编辑预算' : '新建预算'}</div>
        <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>支持总预算、分类预算和标签预算，自然月与自定义区间逻辑保持不变。</div>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="name" label="预算名称" rules={[{ required: true, message: '请输入预算名称' }]}>
          <Input placeholder="例如：4 月餐饮预算" maxLength={100} />
        </Form.Item>

        <Form.Item name="amount" label="预算金额" rules={[{ required: true, message: '请输入预算金额' }]}>
          <InputNumber style={{ width: '100%' }} min={0.01} precision={2} prefix="¥" placeholder="例如：5000" />
        </Form.Item>

        <Form.Item name="dimension_type" label="预算维度" rules={[{ required: true, message: '请选择预算维度' }]}>
          <Radio.Group onChange={(event) => handleDimensionChange(event.target.value)}>
            <Radio.Button value="overall">总预算</Radio.Button>
            <Radio.Button value="category">分类预算</Radio.Button>
            <Radio.Button value="tag">标签预算</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {dimensionType === 'category' && (
          <>
            <Form.Item name="category_id" label="预算分类" rules={[{ required: true, message: '请选择预算分类' }]}>
              <CategorySelector
                categories={categories}
                value={selectedCategoryId}
                onChange={(value) => form.setFieldValue('category_id', value)}
                bookId={bookId}
                onCategoriesUpdated={setCategories}
                placeholder="点击选择分类"
              />
            </Form.Item>

            <Form.Item name="rollup_children" label="包含子分类" valuePropName="checked">
              <Switch checkedChildren="包含" unCheckedChildren="仅当前" />
            </Form.Item>
            <div style={{ marginTop: -12, marginBottom: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
              开启后会把所选分类下所有子分类的交易一起计入预算。
            </div>
          </>
        )}

        {dimensionType === 'tag' && (
          <Form.Item name="tag_id" label="预算标签" rules={[{ required: true, message: '请选择预算标签' }]}>
            <TagMultiSelect
              tags={tags}
              value={[form.getFieldValue('tag_id') || ''].filter(Boolean)}
              onChange={([id]) => form.setFieldValue('tag_id', id || undefined)}
              bookId={bookId}
              maxSelect={1}
              placeholder="点击选择标签"
            />
          </Form.Item>
        )}

        <Form.Item name="period_type" label="预算周期" rules={[{ required: true, message: '请选择预算周期' }]}>
          <Radio.Group onChange={(event) => handlePeriodTypeChange(event.target.value)}>
            <Radio.Button value="monthly">自然月</Radio.Button>
            <Radio.Button value="custom_range">自定义时间段</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {periodType === 'monthly' ? (
          <>
            <Form.Item label="预算月份">
              <Input type="month" value={monthValue} onChange={(event) => handleMonthChange(event.target.value)} />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
                <Input type="date" readOnly />
              </Form.Item>
              <Form.Item name="end_date" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}>
                <Input type="date" readOnly />
              </Form.Item>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="end_date" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}>
              <Input type="date" />
            </Form.Item>
          </div>
        )}

        <Form.Item name="note" label="备注">
          <Input.TextArea rows={4} placeholder="可选，记录预算用途或提醒" maxLength={500} showCount />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={() => navigate(isEdit && id ? `/budgets/${id}` : '/budgets')}>取消</Button>
          <Button type="primary" htmlType="submit" loading={submitting}>
            {isEdit ? '保存' : '创建'}
          </Button>
        </div>
      </Form>
    </Card>
  )
}
