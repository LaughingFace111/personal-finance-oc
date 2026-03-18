import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, message, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { categoriesAPI } from '../services/api'
import { useAuth } from '../App'

const CATEGORY_TYPES = [
  { value: 'expense', label: '支出', color: 'red' },
  { value: 'income', label: '收入', color: 'green' },
]

export default function Categories() {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [bookId, setBookId] = useState<string>('')

  useEffect(() => {
    if (user?.default_book_id) {
      setBookId(user.default_book_id)
    }
  }, [user])

  const fetchData = () => {
    if (!bookId) return
    setLoading(true)
    categoriesAPI.list(bookId).then(res => {
      setData(res || [])
    }).catch(() => setData([])).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (bookId) fetchData()
  }, [bookId])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await categoriesAPI.create({ ...values, book_id: bookId })
      message.success('添加成功')
      setModalVisible(false)
      form.resetFields()
      fetchData()
    } catch (e: any) {
      message.error(e.message || '添加失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await categoriesAPI.delete(id)
      message.success('删除成功')
      fetchData()
    } catch (e: any) {
      message.error(e.message || '删除失败')
    }
  }

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'category_type', key: 'category_type', 
      render: (v: string) => {
        const type = CATEGORY_TYPES.find(t => t.value === v)
        return <Tag color={type?.color}>{type?.label || v}</Tag>
      }},
    { title: '图标', dataIndex: 'icon', key: 'icon' },
    { title: '状态', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '启用' : '停用'}</Tag> },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Button type="link" danger onClick={() => handleDelete(record.id)}>删除</Button>
      )
    },
  ]

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          新建分类
        </Button>
      </div>

      <Table columns={columns} dataSource={data} loading={loading} rowKey="id" />

      <Modal title="新建分类" open={modalVisible} onCancel={() => { setModalVisible(false); form.resetFields() }} onOk={handleSubmit}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="分类名称" rules={[{ required: true }]}>
            <Input placeholder="例如：餐饮" />
          </Form.Item>
          <Form.Item name="category_type" label="类型" rules={[{ required: true }]}>
            <Select options={CATEGORY_TYPES} placeholder="选择类型" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="例如：🍽️" />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input type="color" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
