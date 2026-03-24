import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Spin, Switch, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { apiDelete, apiGet, apiPatch, apiPost } from '../services/api'
import { getDefaultBookId } from './transactionFormSupport'

interface ImportTemplateRecord {
  id: string
  template_name: string
  source_name?: string | null
  file_type: string
  sheet_name?: string | null
  field_mapping: string
  default_values?: string | null
  notes?: string | null
  is_active: boolean
  updated_at: string
}

interface MappingItem {
  source: string
  target: string
}

interface TemplateFormValues {
  template_name: string
  source_name?: string
  file_type: string
  sheet_name?: string
  mappings: MappingItem[]
  date_format?: string
  income_rule?: string
  expense_rule?: string
  notes?: string
  is_active: boolean
}

const emptyMapping = (): MappingItem => ({ source: '', target: '' })

function parseJsonObject<T>(value?: string | null): Partial<T> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Partial<T>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function parseMappings(value: string): MappingItem[] {
  const parsed = parseJsonObject<Record<string, string>>(value)
  const mappings = Object.entries(parsed).map(([source, target]) => ({ source, target }))
  return mappings.length > 0 ? mappings : [emptyMapping()]
}

function buildPayload(values: TemplateFormValues) {
  const fieldMapping = values.mappings.reduce<Record<string, string>>((acc, item) => {
    const source = item.source?.trim()
    const target = item.target?.trim()
    if (source && target) acc[source] = target
    return acc
  }, {})

  const defaultValues = {
    dateFormat: values.date_format?.trim() || undefined,
    incomeRule: values.income_rule?.trim() || undefined,
    expenseRule: values.expense_rule?.trim() || undefined,
  }

  return {
    template_name: values.template_name.trim(),
    source_name: values.source_name?.trim() || null,
    file_type: values.file_type,
    sheet_name: values.sheet_name?.trim() || null,
    field_mapping: JSON.stringify(fieldMapping),
    default_values: JSON.stringify(defaultValues),
    notes: values.notes?.trim() || null,
    is_active: values.is_active,
  }
}

function getTemplateInitialValues(template?: ImportTemplateRecord | null): TemplateFormValues {
  if (!template) {
    return {
      template_name: '',
      source_name: '',
      file_type: 'csv',
      sheet_name: '',
      mappings: [emptyMapping()],
      date_format: 'YYYY-MM-DD',
      income_rule: '',
      expense_rule: '',
      notes: '',
      is_active: true,
    }
  }

  const defaults = parseJsonObject<{ dateFormat?: string; incomeRule?: string; expenseRule?: string }>(template.default_values)
  return {
    template_name: template.template_name,
    source_name: template.source_name || '',
    file_type: template.file_type,
    sheet_name: template.sheet_name || '',
    mappings: parseMappings(template.field_mapping),
    date_format: defaults.dateFormat || 'YYYY-MM-DD',
    income_rule: defaults.incomeRule || '',
    expense_rule: defaults.expenseRule || '',
    notes: template.notes || '',
    is_active: template.is_active,
  }
}

export default function ImportTemplatesPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm<TemplateFormValues>()
  const [bookId, setBookId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<ImportTemplateRecord[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ImportTemplateRecord | null>(null)

  const templateCountText = useMemo(() => `${templates.length} 个模板`, [templates.length])

  const loadTemplates = async (currentBookId?: string | null) => {
    const targetBookId = currentBookId ?? bookId
    if (!targetBookId) return
    setLoading(true)
    try {
      const data = await apiGet<ImportTemplateRecord[]>(`/api/import-templates?book_id=${targetBookId}`)
      setTemplates(data || [])
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
          await loadTemplates(currentBookId)
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
    setEditingTemplate(null)
    form.setFieldsValue(getTemplateInitialValues())
    setModalOpen(true)
  }

  const openEditModal = (template: ImportTemplateRecord) => {
    setEditingTemplate(template)
    form.setFieldsValue(getTemplateInitialValues(template))
    setModalOpen(true)
  }

  const handleSubmit = async (values: TemplateFormValues) => {
    if (!bookId) {
      message.error('未找到默认账本')
      return
    }

    const payload = buildPayload(values)
    if (payload.field_mapping === '{}') {
      message.error('请至少填写一组列映射')
      return
    }

    setSaving(true)
    try {
      if (editingTemplate) {
        await apiPatch(`/api/import-templates/${editingTemplate.id}?book_id=${bookId}`, payload)
        message.success('模板已更新')
      } else {
        await apiPost(`/api/import-templates?book_id=${bookId}`, payload)
        message.success('模板已创建')
      }
      setModalOpen(false)
      form.resetFields()
      await loadTemplates(bookId)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!bookId) return
    await apiDelete(`/api/import-templates/${templateId}?book_id=${bookId}`)
    message.success('模板已删除')
    await loadTemplates(bookId)
  }

  const handleToggleActive = async (template: ImportTemplateRecord, checked: boolean) => {
    if (!bookId) return
    await apiPatch(`/api/import-templates/${template.id}?book_id=${bookId}`, { is_active: checked })
    message.success(checked ? '模板已启用' : '模板已停用')
    await loadTemplates(bookId)
  }

  return (
    <div>
      <Card
        title="导入模板管理"
        extra={
          <Space>
            <Button onClick={() => navigate('/settings')}>返回设置</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新建模板</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ color: 'var(--text-secondary)' }}>
          维护不同账单文件的解析模板，统一列映射、日期格式和收支识别规则。
        </div>
      </Card>

      <Card title={templateCountText}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : templates.length === 0 ? (
          <Empty description="还没有导入模板" />
        ) : (
          <List
            itemLayout="vertical"
            dataSource={templates}
            renderItem={(template) => {
              const mappingCount = Object.keys(parseJsonObject<Record<string, string>>(template.field_mapping)).length
              const defaults = parseJsonObject<{ dateFormat?: string; incomeRule?: string; expenseRule?: string }>(template.default_values)
              return (
                <List.Item
                  key={template.id}
                  actions={[
                    <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openEditModal(template)}>编辑</Button>,
                    <Popconfirm key="delete" title="确认删除该模板？" onConfirm={() => void handleDelete(template.id)}>
                      <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>,
                  ]}
                  extra={<Switch checked={template.is_active} checkedChildren="启用" unCheckedChildren="停用" onChange={(checked) => void handleToggleActive(template, checked)} />}
                >
                  <Space wrap style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{template.template_name}</span>
                    <Tag color="blue">{template.file_type.toUpperCase()}</Tag>
                    {template.source_name ? <Tag>{template.source_name}</Tag> : null}
                  </Space>
                  <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {mappingCount} 个列映射
                    {defaults.dateFormat ? ` · 日期格式 ${defaults.dateFormat}` : ''}
                  </div>
                  {(defaults.incomeRule || defaults.expenseRule) && (
                    <div style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>
                      收支规则: {[defaults.incomeRule ? `收入=${defaults.incomeRule}` : '', defaults.expenseRule ? `支出=${defaults.expenseRule}` : ''].filter(Boolean).join(' / ')}
                    </div>
                  )}
                  {template.notes ? <div style={{ color: 'var(--text-tertiary)' }}>{template.notes}</div> : null}
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      <Modal
        title={editingTemplate ? '编辑导入模板' : '新建导入模板'}
        open={modalOpen}
        width={760}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          <Form.Item name="template_name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="如：招商银行信用卡 CSV" />
          </Form.Item>
          <Form.Item name="source_name" label="来源名称">
            <Input placeholder="如：招商银行" />
          </Form.Item>
          <Form.Item name="file_type" label="文件格式" rules={[{ required: true, message: '请选择文件格式' }]}>
            <Select
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'xlsx', label: 'XLSX' },
                { value: 'xls', label: 'XLS' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => form.getFieldValue('file_type') === 'xlsx' || form.getFieldValue('file_type') === 'xls' ? (
              <Form.Item name="sheet_name" label="工作表名称">
                <Input placeholder="如：Sheet1" />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Card size="small" title="列映射" style={{ marginBottom: 16 }}>
            <Form.List name="mappings">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="start" style={{ display: 'flex', marginBottom: 8 }}>
                      <Form.Item
                        {...field}
                        name={[field.name, 'source']}
                        rules={[{ required: true, message: '请输入源列名' }]}
                      >
                        <Input placeholder="源列名，如：交易时间" />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'target']}
                        rules={[{ required: true, message: '请输入目标字段' }]}
                      >
                        <Input placeholder="目标字段，如：occurred_at" />
                      </Form.Item>
                      <Button danger onClick={() => remove(field.name)}>删除</Button>
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add(emptyMapping())} block>
                    添加列映射
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
          <Form.Item name="date_format" label="日期格式">
            <Input placeholder="如：YYYY-MM-DD HH:mm:ss" />
          </Form.Item>
          <Form.Item name="income_rule" label="收入规则">
            <Input placeholder="如：金额大于 0 记为收入" />
          </Form.Item>
          <Form.Item name="expense_rule" label="支出规则">
            <Input placeholder="如：金额小于 0 记为支出" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="补充模板用途、适用文件说明等" />
          </Form.Item>
          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
