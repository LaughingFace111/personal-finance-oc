import { Avatar, Button, Card, Col, List, Radio, Row, Space, Switch } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../hooks/useTheme'
import { useAppStore } from '../stores/appStore'

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { mode, setMode } = useTheme()
  const navigate = useNavigate()
  const { showHiddenTransactions, toggleHiddenTransactions } = useAppStore()

  return (
    <div>
      <Card title="个人设置" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Avatar size={64} style={{ backgroundColor: '#1677ff', marginRight: 16 }}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </Avatar>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{user?.email || '用户'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>默认账本</div>
          </div>
        </div>
        {user?.default_book_id && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            账本ID: {user.default_book_id}
          </div>
        )}
      </Card>

      <Card title="外观" style={{ marginBottom: 16 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio value="system">跟随系统</Radio>
            <Radio value="light">浅色模式</Radio>
            <Radio value="dark">深色模式</Radio>
          </Space>
        </Radio.Group>
      </Card>

      <Card title="隐私" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 500 }}>显示已隐藏的交易</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              开启后，备注含"隐藏"的交易将在流水列表中显示
            </div>
          </div>
          <Switch checked={showHiddenTransactions} onChange={toggleHiddenTransactions} />
        </div>
      </Card>

      <Card title="功能入口" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card size="small" title="导入匹配规则">
              <Button type="primary" onClick={() => navigate('/settings/rules')}>
                进入规则维护
              </Button>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card size="small" title="导入模板管理">
              <Button type="primary" onClick={() => navigate('/settings/import-templates')}>
                进入模板管理
              </Button>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card size="small" title="周期记账">
              <Button type="primary" onClick={() => navigate('/settings/recurring-rules')}>
                进入周期记账
              </Button>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card title="关于" style={{ marginBottom: 16 }}>
        <List size="small">
          <List.Item>版本: 1.0.0</List.Item>
          <List.Item>个人记账 Web 应用</List.Item>
        </List>
      </Card>

      <Button type="primary" danger block onClick={logout}>
        退出登录
      </Button>
    </div>
  )
}
