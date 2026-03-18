import { useState, useEffect, useMemo } from 'react'
import { Table, Button, Modal, Form, Input, Select, InputNumber, DatePicker, message, Tag, Space } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { transactionsAPI, accountsAPI, categoriesAPI } from '../services/api'
import { useAuth } from '../App'
import dayjs from 'dayjs'

const TX_TYPES = [
  { value: 'expense', label: '支出', color: 'red' },
  { value: 'income', label: '收入', color: 'green' },
  { value: 'transfer', label: '转账', color: 'blue' },
  { value: 'refund', label: '退款', color: 'orange' },
]

const DIRECTIONS = [
  { value: 'out', label: '支出' },
  { value: 'in', label: '收入' },
]

export default function Transactions() {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [form] = Form.useForm()
  const [filters, setFilters] = useState({ page: 1, page_size: 20 })
  const [bookId, setBookId] = useState<string>('')

  // Get book_id from user
  useEffect(() => {
    if (user?.default_book_id) {
      setBookId(user.default_book_id)
    }
  }, [user])

  const fetchData = () => {
    if (!bookId) return
    setLoading(true)
    transactionsAPI.list({ book_id: bookId, ...filters }).then(res => {
      setData(res.items || [])
    }).catch(() => {
      setData([])
    }).finally(() => setLoading(false))
  }

  const fetchOptions = () => {
    if (!bookId) return
    accountsAPI.list(bookId).then(res => setAccounts(res || []))
    categoriesAPI.list(bookId).then(res => setCategories(res || []))
  }

  useEffect(() => {
    if (bookId) {
      fetchData()
      fetchOptions()
    }
  }, [bookId, filters])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        occurred_at: values.occurred_at.toISOString(),
        transaction_type: values.transaction_type || 'expense',
        direction: values.direction || 'out',
        amount: values.amount,
        book_id: bookId,
      }
      await transactionsAPI.create(payload)
      message.success('添加成功')
      setModalVisible(false)
      form.resetFields()
      fetchData()
    } catch (e: any) {
      message.error(e.message || '添加失败')
    }
  }

  const columns = [
    {
      title: '日期',
      dataIndex: 'occurred_at',
      key: 'occurred_at',
      width: 100,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '类型',
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      width: 80,
      render: (v: string) => {
        const type = TX_TYPES.find(t => t.value === v)
        return <Tag color={type?.color || 'default'}>{type?.label || v}</Tag>
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (v: number, r: any) => (
        <span style={{ color: r.direction === 'in' ? '#52c41a' : '#ff4d4f' }}>
          {r.direction === 'in' ? '+' : '-'}{v}
        </span>
      ),
    },
    {
      title: '账户',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 100,
      render: (v: string) => {
        const acc = accounts.find(a => a.id === v)
        return acc?.name || v
      },
    },
    {
      title: '分类',
      dataIndex: 'category_id',
      key: 'category_id',
      width: 100,
      render: (v: string) => {
        const cat = categories.find(c => c.id === v)
        return cat?.name || '-'
      },
    },
    {
      title: '商户/备注',
      dataIndex: 'merchant',
      key: 'merchant',
      render: (v: string, r: any) => v || r.note || '-',
    },
  ]

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建交易
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        pagination={{
          current: filters.page,
          pageSize: filters.page_size,
          onChange: (page, pageSize) => setFilters({ ...filters, page, page_size: pageSize }),
        }}
      />

      <Modal
        title="新建交易"
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields() }}
        onOk={handleSubmit}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="transaction_type" label="交易类型" initialValue="expense">
            <Select options={TX_TYPES} />
          </Form.Item>
          <Form.Item name="direction" label="收支方向" initialValue="out">
            <Select options={DIRECTIONS} />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="account_id" label="账户" rules={[{ required: true, message: '请选择账户' }]}>
            <Select 
              options={accounts.map(a => ({ value: a.id, label: a.name }))} 
              placeholder="选择账户"
            />
          </Form.Item>
          <Form.Item name="category_id" label="分类">
            <Select 
              options={categories.map(c => ({ value: c.id, label: c.name }))} 
              placeholder="选择分类（可选）"
              allowClear
            />
          </Form.Item>
          <Form.Item name="merchant" label="商户">
            <Input placeholder="商户名称（可选）" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="备注（可选）" />
          </Form.Item>
          <Form.Item name="occurred_at" label="日期" initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
