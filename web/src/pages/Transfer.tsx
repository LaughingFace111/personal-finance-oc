import { useState, useEffect } from 'react'
import { Card, Form, Select, InputNumber, Button, DatePicker, message } from 'antd'
import { SwapOutlined } from '@ant-design/icons'
import { transactionsAPI, accountsAPI } from '../services/api'
import { useAuth } from '../App'
import dayjs from 'dayjs'

export default function Transfer() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const [bookId, setBookId] = useState<string>('')

  useEffect(() => {
    if (user?.default_book_id) {
      setBookId(user.default_book_id)
    }
  }, [user])

  useEffect(() => {
    if (bookId) {
      accountsAPI.list(bookId).then(res => {
        setAccounts(res || [])
      })
    }
  }, [bookId])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      await transactionsAPI.transfer({
        ...values,
        occurred_at: values.occurred_at.toISOString(),
        book_id: bookId,
      })
      message.success('转账成功')
      form.resetFields()
    } catch (e: any) {
      message.error(e.message || '转账失败')
    } finally {
      setLoading(false)
    }
  }

  if (!bookId) {
    return <div style={{ padding: 24 }}>请先登录</div>
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>转账</h2>
      <Card style={{ maxWidth: 500 }}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="from_account_id" label="转出账户" rules={[{ required: true, message: '请选择转出账户' }]}>
            <Select 
              placeholder="选择转出账户"
              options={accounts.map(a => ({ value: a.id, label: a.name }))} 
            />
          </Form.Item>
          
          <div style={{ textAlign: 'center', margin: '10px 0' }}>
            <SwapOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          </div>

          <Form.Item name="to_account_id" label="转入账户" rules={[{ required: true, message: '请选择转入账户' }]}>
            <Select 
              placeholder="选择转入账户"
              options={accounts.map(a => ({ value: a.id, label: a.name }))} 
            />
          </Form.Item>

          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber precision={2} style={{ width: '100%' }} min={0} placeholder="0.00" />
          </Form.Item>

          <Form.Item name="occurred_at" label="时间" rules={[{ required: true }]} initialValue={dayjs()}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block>
            确认转账
          </Button>
        </Form>
      </Card>
    </div>
  )
}
