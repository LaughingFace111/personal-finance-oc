import { useState, useEffect } from 'react'
import { Table, Button, Upload, Card, Steps, message, Tag } from 'antd'
import { UploadOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { importsAPI } from '../services/api'

const BOOK_ID = 'test-book-id'

export default function Imports() {
  const [batches, setBatches] = useState<any[]>([])
  const [currentBatch, setCurrentBatch] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)

  const fetchBatches = () => {
    importsAPI.list(BOOK_ID).then(res => {
      setBatches(res || [])
    })
  }

  useEffect(() => {
    fetchBatches()
  }, [])

  const handleUpload = async (file: File) => {
    setLoading(true)
    try {
      const res = await importsAPI.upload(file)
      setCurrentBatch(res)
      setStep(1)
      message.success('文件上传成功')
      // 获取导入行
      const rowsRes = await importsAPI.rows(res.id)
      setRows(rowsRes || [])
    } catch (e: any) {
      message.error(e.message || '上传失败')
    } finally {
      setLoading(false)
    }
    return false
  }

  const handleConfirm = async () => {
    if (!currentBatch) return
    setLoading(true)
    try {
      await importsAPI.confirm(currentBatch.id, {})
      message.success('导入成功')
      setStep(2)
      fetchBatches()
    } catch (e: any) {
      message.error(e.message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    { title: '文件名', dataIndex: 'filename', key: 'filename' },
    { title: '总行数', dataIndex: 'total_rows', key: 'total_rows' },
    { title: '已解析', dataIndex: 'parsed_rows', key: 'parsed_rows' },
    { title: '已确认', dataIndex: 'confirmed_rows', key: 'confirmed_rows' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => 
      <Tag color={v === 'confirmed' ? 'green' : v === 'failed' ? 'red' : 'blue'}>{v}</Tag> },
    { title: '上传时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
  ]

  const rowColumns = [
    { title: '行号', dataIndex: 'row_no', key: 'row_no', width: 60 },
    { title: '金额', dataIndex: 'normalized_data', key: 'amount', 
      render: (v: string) => v ? JSON.parse(v)?.amount : '-' },
    { title: '商户', dataIndex: 'normalized_data', key: 'merchant',
      render: (v: string) => v ? JSON.parse(v)?.merchant : '-' },
    { title: '描述', dataIndex: 'normalized_data', key: 'description',
      render: (v: string) => v ? JSON.parse(v)?.description : '-' },
    { title: '识别结果', dataIndex: 'confirm_status', key: 'confirm_status', render: (v: string) => 
      <Tag color={v === 'confirmed' ? 'green' : v === 'skipped' ? 'default' : 'orange'}>{v}</Tag> },
  ]

  return (
    <div>
      <h2>批量导入</h2>
      
      <Steps current={step} style={{ marginBottom: 24 }}>
        <Steps.Step title="上传文件" description="上传CSV文件" />
        <Steps.Step title="预览确认" description="确认识别结果" />
        <Steps.Step title="完成" description="导入成功" />
      </Steps>

      <Card title="导入批次" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Upload beforeUpload={handleUpload} accept=".csv" showUploadList={false}>
            <Button icon={<UploadOutlined />} loading={loading}>上传CSV文件</Button>
          </Upload>
        </div>
        <Table dataSource={batches} columns={columns} rowKey="id" pagination={false} size="small" />
      </Card>

      {currentBatch && (
        <Card title="导入预览">
          <Table dataSource={rows} columns={rowColumns} rowKey="id" pagination={false} size="small" />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" onClick={handleConfirm} loading={loading} icon={<CheckCircleOutlined />}>
              确认导入
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
