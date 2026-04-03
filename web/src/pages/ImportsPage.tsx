import { Button, Card, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import { StagingImportTable } from '../components/StagingImportTable'

export default function ImportsPage() {
  const navigate = useNavigate()

  return (
    <div>
      <Card
        title="批量导入"
        extra={
          <Space>
            <Button onClick={() => navigate('/dashboard')}>返回首页</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        解析账单文件后，可在缓冲区确认、修正并导入交易记录。
      </Card>

      <StagingImportTable />
    </div>
  )
}
