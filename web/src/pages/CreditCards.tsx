import { useState, useEffect } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, Card, Row, Col, Statistic, Tag } from 'antd'
import { PlusOutlined, CreditCardOutlined } from '@ant-design/icons'
import { accountsAPI, installmentsAPI } from '../services/api'

const BOOK_ID = 'test-book-id'

export default function CreditCards() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [installments, setInstallments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    accountsAPI.list(BOOK_ID).then(res => {
      setAccounts((res || []).filter((a: any) => ['credit_card', 'credit_line'].includes(a.account_type)))
    })
    installmentsAPI.list(BOOK_ID).then(res => {
      setInstallments(res || [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, [])

  const accountColumns = [
    { title: '账户名称', dataIndex: 'name', key: 'name' },
    { title: '机构', dataIndex: 'institution_name', key: 'institution_name' },
    { title: '信用额度', dataIndex: 'credit_limit', key: 'credit_limit', render: (v: number) => `¥${v?.toFixed(2) || 0}` },
    { title: '当前欠款', dataIndex: 'debt_amount', key: 'debt_amount', render: (v: number) => `¥${v?.toFixed(2) || 0}` },
    { title: '可用额度', dataIndex: 'credit_limit', key: 'available', 
      render: (_: any, record: any) => `¥${((record.credit_limit || 0) - (record.debt_amount || 0)).toFixed(2)}` },
  ]

  const installmentColumns = [
    { title: '分期名称', dataIndex: 'plan_name', key: 'plan_name' },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', render: (v: number) => `¥${v?.toFixed(2) || 0}` },
    { title: '期数', dataIndex: 'total_periods', key: 'total_periods' },
    { title: '已还期数', dataIndex: 'current_period', key: 'current_period' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => 
      <Tag color={v === 'active' ? 'blue' : v === 'completed' ? 'green' : 'red'}>{v}</Tag> },
  ]

  const totalDebt = accounts.reduce((sum, a) => sum + (a.debt_amount || 0), 0)
  const totalLimit = accounts.reduce((sum, a) => sum + (a.credit_limit || 0), 0)

  return (
    <div>
      <h2>信用账户</h2>
      
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="总信用额度" value={totalLimit} precision={2} prefix={<CreditCardOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="总欠款" value={totalDebt} precision={2} prefix={<CreditCardOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="可用额度" value={totalLimit - totalDebt} precision={2} prefix={<CreditCardOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title="信用卡/信用账户" style={{ marginBottom: 16 }}>
        <Table dataSource={accounts} columns={accountColumns} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Card title="分期计划">
        <Table dataSource={installments} columns={installmentColumns} rowKey="id" loading={loading} pagination={false} />
      </Card>
    </div>
  )
}
