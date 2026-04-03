import { Button, Card } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'

export default function ImportTemplateEditPage() {
  const navigate = useNavigate()
  const { templateId } = useParams()

  return (
    <Card
      title="编辑导入模板"
      extra={<Button onClick={() => navigate('/settings/import-templates')}>返回模板列表</Button>}
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        模板编辑页预留中{templateId ? `，当前模板 ID: ${templateId}` : ''}。
      </div>
    </Card>
  )
}
