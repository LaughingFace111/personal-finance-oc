import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, InputNumber, List, Modal, Popconfirm, Select, Space, Switch, Tag } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { CategorySelector } from '../components/CategorySelector'
import { TagMultiSelect } from '../components/TagMultiSelect'
import { apiDelete, apiGet, apiPatch, apiPost } from '../services/api'
import { CategoryOption, TagOption, getDefaultBookId, loadTransactionFormData } from './transactionFormSupport'

interface TransactionTemplateRecord {
  id: string
  name: string
  transaction_type: 'income' | 'expense'
  category_id: string
  amount?: string | number | null
  tags?: string | null
  is_active: boolean
}

interface TemplateFormValues {
  name: string
  transaction_type: 'income' | 'expense'
  category_id: string
  amount?: number | null
  tag_ids?: string[]
}

function parseTemplateTagIds(value?: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

function getInitialValues(template?: TransactionTemplateRecord | null): TemplateFormValues {
  if (!template) {
    return {
      name: '',
      transaction_type: 'expense',
      category_id: '',
      amount: null,
      tag_ids: [],
    }
  }

  return {
    name: template.name,
    transaction_type: template.transaction_type,
    category_id: template.category_id,
    amount: template.amount == null ? null : Number(template.amount),
    tag_ids: parseTemplateTagIds(template.tags),
  }
}

export default function TransactionTemplatesPage() {
  const [bookId, setBookId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TransactionTemplateRecord[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [tags, setTags] = useState<TagOption[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TransactionTemplateRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<TemplateFormValues>()

  const loadAll = async (targetBookId?: string | null) => {
    const resolvedBookId = targetBookId ?? bookId
    if (!resolvedBookId) return

    setLoading(true)
    try {
      const [templateData, formData] = await Promise.all([
        apiGet<TransactionTemplateRecord[]>(`/api/transaction-templates?book_id=${resolvedBookId}`),
        loadTransactionFormData(resolvedBookId),
      ])
      setTemplates(templateData ?? [])
      setCategories(formData.categories)
      setTags(formData.tags)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const bootstrap = async () => {
      const nextBookId = await getDefaultBookId()
      setBookId(nextBookId)
      await loadAll(nextBookId)
    }
    void bootstrap()
  }, [])

  const templateCountText = useMemo(() => `${templates.length} 个快捷模板`, [templates.length])

  const openCreateModal = () => {
    setEditingTemplate(null)
    form.setFieldsValue(getInitialValues())
    setModalOpen(true)
  }

  const openEditModal = (template: TransactionTemplateRecord) => {
    setEditingTemplate(template)
    form.setFieldsValue(getInitialValues(template))
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!bookId) return
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const payload = {
        name: values.name.trim(),
        transaction_type: values.transaction_type,
        category_id: values.category_id,
        amount: values.amount ?? null,
        tags: values.tag_ids && values.tag_ids.length > 0 ? JSON.stringify(values.tag_ids) : null,
      }

      if (editingTemplate) {
        await apiPatch(`/api/transaction-templates/${editingTemplate.id}?book_id=${bookId}`, payload)
      } else {
        await apiPost(`/api/transaction-templates?book_id=${bookId}`, payload)
      }

      setModalOpen(false)
      setEditingTemplate(null)
      form.resetFields()
      await loadAll(bookId)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!bookId) return
    await apiDelete(`/api/transaction-templates/${templateId}?book_id=${bookId}`)
    await loadAll(bookId)
  }

  const handleToggleActive = async (template: TransactionTemplateRecord, checked: boolean) => {
    if (!bookId) return
    await apiPatch(`/api/transaction-templates/${template.id}?book_id=${bookId}`, { is_active: checked })
    await loadAll(bookId)
  }

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const selectedType = Form.useWatch('transaction_type', form) || 'expense'
  const selectedCategoryId = Form.useWatch('category_id', form) || ''
  const selectedTagIds = Form.useWatch('tag_ids', form) || []
  const filteredCategories = useMemo(
    () => categories.filter((category) => {
      if (selectedType === 'income') {
        return category.category_type === 'income' || category.category_type === 'income_expense'
      }
      return category.category_type === 'expense' || category.category_type === 'income_expense'
    }),
    [categories, selectedType],
  )

  return (
    <div>
      <Card
        title={templateCountText}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新增模板</Button>}
      >
        <List
          loading={loading}
          locale={{ emptyText: '暂无快捷模板' }}
          dataSource={templates}
          renderItem={(template) => {
            const category = categoriesById.get(template.category_id)
            const tagCount = parseTemplateTagIds(template.tags).length

            return (
              <List.Item
                key={template.id}
                actions={[
                  <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openEditModal(template)}>编辑</Button>,
                  <Popconfirm key="delete" title="确认删除该快捷模板？" onConfirm={() => void handleDelete(template.id)}>
                    <Button type="link" danger>删除</Button>
                  </Popconfirm>,
                ]}
                extra={
                  <Switch
                    checked={template.is_active}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                    onChange={(checked) => void handleToggleActive(template, checked)}
                  />
                }
              >
                <List.Item.Meta
                  title={
                    <Space size={8} wrap>
                      <span style={{ fontWeight: 600 }}>{template.name}</span>
                      <Tag color={template.transaction_type === 'income' ? 'green' : 'red'}>
                        {template.transaction_type === 'income' ? '收入' : '支出'}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space size={[8, 8]} wrap>
                      <span>{category?.icon ? `${category.icon} ` : ''}{category?.name || '未分类'}</span>
                      {template.amount != null ? <span>¥{Number(template.amount).toFixed(2)}</span> : <span>未预设金额</span>}
                      {tagCount > 0 ? <span>{tagCount} 个标签</span> : <span>无标签</span>}
                    </Space>
                  }
                />
              </List.Item>
            )
          }}
        />
      </Card>

      <Modal
        title={editingTemplate ? '编辑快捷模板' : '新增快捷模板'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingTemplate(null)
          form.resetFields()
        }}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        okText={editingTemplate ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" initialValues={getInitialValues()}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="例如：早餐、通勤打车" maxLength={100} />
          </Form.Item>
          <Form.Item name="transaction_type" label="类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select
              options={[
                { label: '支出', value: 'expense' },
                { label: '收入', value: 'income' },
              ]}
            />
          </Form.Item>
          <Form.Item name="category_id" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <CategorySelector
              categories={filteredCategories}
              value={selectedCategoryId}
              onChange={(value) => form.setFieldValue('category_id', value)}
              bookId={bookId}
              onCategoriesUpdated={setCategories}
              placeholder="点击选择类别"
            />
          </Form.Item>
          <Form.Item name="amount" label="默认金额">
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="可选，不填则使用空金额" />
          </Form.Item>
          <Form.Item name="tag_ids" label="标签">
            <TagMultiSelect
              allTags={tags}
              value={selectedTagIds}
              onChange={(value) => form.setFieldValue('tag_ids', value)}
              onTagsUpdated={setTags}
              bookId={bookId}
              placeholder="可选，搜索、选择或创建标签"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
