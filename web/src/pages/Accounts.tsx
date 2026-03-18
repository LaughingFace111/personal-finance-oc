import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Tag, Space } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { accountsAPI } from '../services/api'
import { useAuth } from '../App'

const ACCOUNT_TYPES = [
  { value: 'cash', label: '现金' },
  { value: 'debit_card', label: '借记卡' },
  { value: 'ewallet', label: '电子钱包' },
  { value: 'credit_card', label: '信用卡' },
  { value: 'credit_line', label: '信用账户(花呗)' },
  { value: 'loan', label: '贷款账户' },
  { value: 'virtual', label: '虚拟账户' },
]

export default function Accounts() {
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
    accountsAPI.list(bookId).then(res => {
      setData(res || [])
    }).catch(() => setData([])).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (bookId) fetchData()
  }, [bookId])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await accountsAPI.create({ ...values, book_id: bookId })
      message.success('添加成功')
      setModalVisible(false)
      form.resetFields()
      fetchData()
    } catch (e: any) {
      message.error(e.message || '添加失败')
    }
  }

  const columns = [
    { title: '账户名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'account_type', key: 'account_type', 
      render: (v: string) => {
        const type = ACCOUNT_TYPES.find(t => t.value === v)
        return <Tag>{type?.label || v}</Tag>
      }},
    { title: '余额', dataIndex: 'current_balance', key: 'current_balance', 
      render: (v: number) => v?.toFixed(2) || '0.00' },
    { title: '负债', dataIndex: 'debt_amount', key: 'debt_amount',
      render: (v: number) => v > 0 ? <Tag color="red">{v?.toFixed(2)}</Tag> : '-' },
    { title: '信用额度', dataIndex: 'credit_limit', key: 'credit_limit',
      render: (v: number) => v > 0 ? v?.toFixed(2) : '-' },
    { title: '状态', dataIndex: 'is_active', key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '正常' : '停用'}</Tag> },
  ]

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建账户
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>

      <Table columns={columns} dataSource={data} loading={loading} rowKey="id" />

      <Modal title="新建账户" open={modalVisible} onCancel={() => { setModalVisible(false); form.resetFields() }} onOk={handleSubmit}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="账户名称" rules={[{ required: true }]}>
            <Input placeholder="例如：招商银行卡" />
          </Form.Item>
          <Form.Item name="account_type" label="账户类型" rules={[{ required: true }]}>
            <Select options={ACCOUNT_TYPES} placeholder="选择账户类型" />
          </Form.Item>
          <Form.Item name="opening_balance" label="期初余额" initialValue={0}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="credit_limit" label="信用额度（信用卡/贷款用）">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
