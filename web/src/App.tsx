import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Drawer, FloatButton, message, Form, Input, Card, Row, Col, List, Avatar, Tag, Button, Empty, Spin, Select, InputNumber, Checkbox, Modal } from 'antd'
const { Content } = Layout
import { DashboardOutlined, WalletOutlined, TagsOutlined, SwapOutlined, BankOutlined, UploadOutlined, BarChartOutlined, SettingOutlined, PlusOutlined, MenuOutlined, CloseOutlined, ArrowUpOutlined, ArrowDownOutlined, ImportOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect, createContext, useContext } from 'react'
import { apiGet, apiPost, apiDelete, apiUpload, apiPatch } from './services/api'

interface AuthContextType {
  token: string | null;
  user: any;
  login: (token: string, user: any) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: () => {},
  logout: () => {},
  loading: true,
})

export const useAuth = () => useContext(AuthContext)

const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{email?: string; password?: string}>({})
  const { login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as any)?.from?.pathname || '/dashboard'

  const validate = () => {
    const newErrors: {email?: string; password?: string} = {}
    if (!email.trim()) newErrors.email = '请输入邮箱'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = '邮箱格式错误'
    if (!password) newErrors.password = '请输入密码'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        // Use user data from login response (now includes default_book_id)
        login(data.access_token, data.user)
        message.success('登录成功')
        navigate(from, { replace: true })
      } else {
        message.error(data.detail || '登录失败')
      }
    } catch { message.error('网络错误') } 
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, fontSize: 24 }}>个人记账</h2>
        <div style={{ marginBottom: 16 }}>
          <input style={{ width: '100%', padding: '12px', borderRadius: 8, border: errors.email ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="邮箱" value={email} onChange={e => { setEmail(e.target.value); setErrors({...errors, email: undefined}) }} />
          {errors.email && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{errors.email}</div>}
        </div>
        <div style={{ marginBottom: 24 }}>
          <input type="password" style={{ width: '100%', padding: '12px', borderRadius: 8, border: errors.password ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="密码" value={password} onChange={e => { setPassword(e.target.value); setErrors({...errors, password: undefined}) }} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {errors.password && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{errors.password}</div>}
        </div>
        <Button type="primary" block size="large" loading={loading} onClick={handleLogin} style={{ borderRadius: 8 }}>登录</Button>
        <div style={{ marginTop: 16, textAlign: 'center' }}>还没有账号？<a onClick={() => navigate('/register')}>立即注册</a></div>
      </Card>
    </div>
  )
}

const RegisterPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{email?: string; password?: string; confirmPwd?: string}>({})
  const navigate = useNavigate()

  const validate = () => {
    const newErrors: typeof errors = {}
    if (!email.trim()) newErrors.email = '请输入邮箱'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = '邮箱格式错误'
    if (!password) newErrors.password = '请输入密码'
    else if (password.length < 6) newErrors.password = '密码至少6位'
    if (password !== confirmPwd) newErrors.confirmPwd = '两次密码不一致'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleRegister = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, nickname: nickname || undefined }) })
      const data = await res.json()
      if (res.ok) { message.success('注册成功，请登录'); navigate('/login') }
      else { message.error(data.detail || '注册失败') }
    } catch { message.error('网络错误') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, fontSize: 24 }}>注册账号</h2>
        <input style={{ width: '100%', padding: '12px', marginBottom: 12, borderRadius: 8, border: errors.email ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="邮箱" value={email} onChange={e => { setEmail(e.target.value); setErrors({...errors, email: undefined}) }} />
        {errors.email && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.email}</div>}
        <input style={{ width: '100%', padding: '12px', marginBottom: 12, borderRadius: 8, border: '1px solid #d9d9d9' }} placeholder="昵称（可选）" value={nickname} onChange={e => setNickname(e.target.value)} />
        <input type="password" style={{ width: '100%', padding: '12px', marginBottom: 12, borderRadius: 8, border: errors.password ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="密码（至少6位）" value={password} onChange={e => { setPassword(e.target.value); setErrors({...errors, password: undefined}) }} />
        {errors.password && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.password}</div>}
        <input type="password" style={{ width: '100%', padding: '12px', marginBottom: 12, borderRadius: 8, border: errors.confirmPwd ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="确认密码" value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setErrors({...errors, confirmPwd: undefined}) }} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
        {errors.confirmPwd && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.confirmPwd}</div>}
        <Button type="primary" block size="large" loading={loading} onClick={handleRegister} style={{ borderRadius: 8, marginTop: 8 }}>注册</Button>
        <div style={{ marginTop: 16, textAlign: 'center' }}>已有账号？<a onClick={() => navigate('/login')}>立即登录</a></div>
      </Card>
    </div>
  )
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth()
  const location = useLocation()
  
  // Simple check - if no token, go to login
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  
  return <>{children}</>
}

const DRAWER_WIDTH = 280
const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <SwapOutlined />, label: '交易' },
  { key: '/accounts', icon: <WalletOutlined />, label: '账户' },
  { key: '/categories', icon: <TagsOutlined />, label: '分类' },
  { key: '/tags', icon: <TagsOutlined />, label: '标签' },
  { key: '/loans', icon: <BankOutlined />, label: '贷款' },
  { key: '/imports', icon: <UploadOutlined />, label: '导入' },
  { key: '/reports', icon: <BarChartOutlined />, label: '报表' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]
const pageTitles: Record<string, string> = { '/dashboard': '首页', '/transactions': '交易记录', '/transactions/new': '记一笔', '/transactions/:id': '编辑交易', '/accounts': '账户管理', '/accounts/:id': '账户详情', '/accounts/:id/edit': '编辑账户', '/categories': '分类管理', '/categories/:id': '编辑分类', '/tags': '标签管理', '/categories/new': '新建分类', '/accounts/new': '新建账户', '/tags/new': '新建标签', '/loans': '贷款管理', '/loans/new': '添加贷款', '/imports': '批量导入', '/reports': '报表中心', '/transfer': '转账', '/settings': '设置' }

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const currentTitle = pageTitles[location.pathname] || '个人记账'

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  const handleFabClick = (action: string) => {
    setFabMenuOpen(false)
    if (action === 'expense') navigate('/transactions/new?type=expense')
    else if (action === 'income') navigate('/transactions/new?type=income')
    else if (action === 'transfer') navigate('/transfer')
    else if (action === 'import') navigate('/imports')
  }

  // 根据页面上下文动态生成 FAB 按钮
  const getFabButtons = () => {
    const path = location.pathname
    const buttons: { key: string; label: string; icon: React.ReactNode; action: () => void }[] = []

    // 首页 /dashboard - 显示全部 4 个按钮
    if (path === '/dashboard') {
      buttons.push(
        { key: 'expense', label: '记支出', icon: <ArrowDownOutlined />, action: () => handleFabClick('expense') },
        { key: 'income', label: '记收入', icon: <ArrowUpOutlined />, action: () => handleFabClick('income') },
        { key: 'transfer', label: '转账', icon: <SwapOutlined />, action: () => handleFabClick('transfer') },
        { key: 'import', label: '批量导入', icon: <ImportOutlined />, action: () => handleFabClick('import') }
      )
    }
    // 交易页 /transactions - 只显示 2 个按钮
    else if (path === '/transactions') {
      buttons.push(
        { key: 'expense', label: '记支出', icon: <ArrowDownOutlined />, action: () => handleFabClick('expense') },
        { key: 'income', label: '记收入', icon: <ArrowUpOutlined />, action: () => handleFabClick('income') }
      )
    }
    // 账户页 /accounts - 只显示 1 个按钮
    else if (path === '/accounts') {
      buttons.push(
        { key: 'add', label: '添加账户', icon: <PlusOutlined />, action: () => navigate('/accounts/new') }
      )
    }
    // 类别页 /categories - 只显示 1 个按钮
    else if (path === '/categories') {
      buttons.push(
        { key: 'add', label: '添加类别', icon: <PlusOutlined />, action: () => navigate('/categories/new') }
      )
    }
    // 贷款页 /loans - 只显示 1 个按钮
    else if (path === '/loans') {
      buttons.push(
        { key: 'add', label: '添加贷款', icon: <PlusOutlined />, action: () => navigate('/loans/new') }
      )
    }
    // 标签页 /tags - 只显示 1 个按钮
    else if (path === '/tags') {
      buttons.push(
        { key: 'add', label: '添加标签', icon: <PlusOutlined />, action: () => navigate('/tags/new') }
      )
    }
    // 报表页 /reports - 不显示 FAB
    // 设置页 /settings - 不显示 FAB
    // 看板页（就是首页）- 不需要额外 FAB

    return buttons
  }

  const fabButtons = getFabButtons()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 100 }}>
        <Button type="text" icon={<MenuOutlined style={{ fontSize: 20 }} />} onClick={() => setDrawerOpen(true)} style={{ marginRight: 16 }} />
        <span style={{ fontSize: 18, fontWeight: 500 }}>{currentTitle}</span>
      </div>
      <Drawer title={<span style={{ fontSize: 18, fontWeight: 600 }}>个人记账</span>} placement="left" onClose={() => setDrawerOpen(false)} open={drawerOpen} width={DRAWER_WIDTH} bodyStyle={{ padding: 0 }} extra={<Button type="text" icon={<CloseOutlined />} onClick={() => setDrawerOpen(false)} />}>
        <div style={{ padding: '16px 0' }}>
          <div style={{ padding: '0 24px 16px', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
            <Avatar style={{ backgroundColor: '#1677ff', marginRight: 12 }}>{user?.email?.[0]?.toUpperCase() || 'U'}</Avatar>
            <span>{user?.email || '用户'}</span>
          </div>
          <Menu mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={({ key }) => navigate(key)} style={{ border: 'none' }} />
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, borderTop: '1px solid #f0f0f0' }}>
          <Button block onClick={logout} icon={<SettingOutlined />}>退出登录</Button>
        </div>
      </Drawer>
      <Layout style={{ marginTop: 56, marginBottom: 80 }}>
        <Content style={{ padding: 16, maxWidth: 840, margin: '0 auto', width: '100%', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/new" element={<TransactionFormPage />} />
            <Route path="/transactions/:id" element={<TransactionFormPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/accounts/new" element={<AccountFormPage />} />
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
            <Route path="/accounts/:id/edit" element={<AccountEditPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/categories/new" element={<CategoryFormPage />} />
            <Route path="/categories/:id" element={<CategoryEditPage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/tags/new" element={<TagFormPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/loans/new" element={<LoanFormPage />} />
            <Route path="/imports" element={<ImportsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
      {/* 动态 FAB：按页面上下文显示不同按钮 */}
      {fabButtons.length > 0 && (
        <FloatButton.Group trigger="click" style={{ right: 24, bottom: 24 }} icon={<PlusOutlined />} open={fabMenuOpen} onOpenChange={setFabMenuOpen}>
          {fabButtons.map(btn => (
            <FloatButton key={btn.key} tooltip={btn.label} icon={btn.icon} onClick={btn.action} />
          ))}
        </FloatButton.Group>
      )}
    </Layout>
  )
}

const DashboardPage = () => {
  const { user, token } = useAuth()
  const [overview, setOverview] = useState<any>({})
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bookId = user?.default_book_id

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    setError(null)
    const today = new Date()
    const dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const dateTo = today.toISOString().split('T')[0]
    
    Promise.all([
      apiGet(`/api/reports/overview?book_id=${bookId}&date_from=${dateFrom}&date_to=${dateTo}`),
      apiGet(`/api/reports/expense-by-category?book_id=${bookId}&date_from=${dateFrom}&date_to=${dateTo}`)
    ]).then(([ov, ex]) => { 
      setOverview(ov || {}); 
      setExpenses(ex || []) 
    }).catch((err) => { 
      if (err.message !== 'AUTH_EXPIRED') {
        setError(err.message)
      }
    }).finally(() => setLoading(false))
  }, [bookId])

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>
  
  return (
    <div>
      {error && <Card style={{ marginBottom: 16, backgroundColor: '#fff2f0', borderColor: '#ffccc7' }}><span style={{ color: '#ff4d4f' }}>⚠️ {error}</span></Card>}
      <Row gutter={[16, 16]}>
        <Col span={12} xs={24}><Card size="small" title="本月收入"><div style={{ color: '#52c41a', fontSize: 20, fontWeight: 600 }}>¥{(overview.income || 0).toFixed(2)}</div></Card></Col>
        <Col span={12} xs={24}><Card size="small" title="本月支出"><div style={{ color: '#ff4d4f', fontSize: 20, fontWeight: 600 }}>¥{(overview.net_expense || 0).toFixed(2)}</div></Card></Col>
        <Col span={12} xs={24}><Card size="small" title="总资产"><div style={{ fontSize: 20, fontWeight: 600 }}>¥{(overview.total_assets || 0).toFixed(2)}</div></Card></Col>
        <Col span={12} xs={24}><Card size="small" title="总负债"><div style={{ color: overview.total_debt > 0 ? '#ff4d4f' : undefined, fontSize: 20, fontWeight: 600 }}>¥{(overview.total_debt || 0).toFixed(2)}</div></Card></Col>
      </Row>
      <Card size="small" title="支出分类" style={{ marginTop: 16 }}>{loading ? <Spin /> : expenses.length === 0 ? <Empty description="暂无数据" /> : <List size="small" dataSource={expenses.slice(0, 5)} renderItem={item => <List.Item><span>{item.icon} {item.name}</span><span style={{ color: '#ff4d4f' }}>¥{(item.net_amount || 0).toFixed(2)}</span></List.Item>} />}</Card>
    </div>
  )
}

const TransactionsPage = () => {
  const { user, token } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  
  // 标签筛选
  const [tags, setTags] = useState<any[]>([])
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  
  // 批量操作状态
  const [selectionMode, setSelectionMode] = useState<'none' | 'delete' | 'refund'>('none')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 加载标签列表
  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/tags?book_id=${bookId}`)
      .then(res => setTags(res || []))
      .catch(() => {})
  }, [bookId])

  const loadData = () => {
    if (!bookId) return
    let url = `/api/transactions?book_id=${bookId}&page=1&page_size=50`
    // 将 tag ID 转换为 tag name（后端按名称筛选）
    if (selectedTagId) {
      const tag = tags.find((t: any) => t.id === selectedTagId)
      if (tag) {
        url += `&tag=${encodeURIComponent(tag.name)}`
      }
    }
    apiGet(url)
      .then(res => setData(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [bookId, selectedTagId, tags])

  // 切换选择模式
  const enterSelectionMode = (mode: 'delete' | 'refund') => {
    setSelectionMode(mode)
    setSelectedIds([])
  }

  const cancelSelectionMode = () => {
    setSelectionMode('none')
    setSelectedIds([])
  }

  // 切换单选
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.length === data.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(data.map(i => i.id))
    }
  }

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 条交易吗？`)) return
    
    setSubmitting(true)
    try {
      await Promise.all(selectedIds.map(id => apiDelete(`/api/transactions/${id}`)))
      message.success('删除成功')
      cancelSelectionMode()
      loadData()
    } catch { message.error('删除失败') }
    finally { setSubmitting(false) }
  }

  // 退款（单笔限制）
  const handleRefund = async (txId: string, amount: number, accountId: string) => {
    if (!confirm(`确定要退款 ¥${Number(amount).toFixed(2)} 吗？`)) return
    
    setSubmitting(true)
    try {
      // 调用专用退款接口
      await apiPost('/api/transactions/refund', {
        book_id: bookId,
        original_transaction_id: txId,
        refund_account_id: accountId,
        amount: amount,
        occurred_at: new Date().toISOString()
      })
      message.success('退款成功')
      cancelSelectionMode()
      loadData()
    } catch { message.error('退款失败') }
    finally { setSubmitting(false) }
  }

  // 批量选择模式进入时，渲染退款按钮（单笔）
  const handleBatchRefund = async () => {
    if (selectedIds.length === 0) return
    if (selectedIds.length > 1) {
      message.info('退款暂只支持单笔操作，请只选择一条记录')
      return
    }
    
    const tx = data.find(i => i.id === selectedIds[0])
    if (!tx) return
    if (tx.direction !== 'out') {
      message.info('只能对支出交易发起退款')
      return
    }
    
    // 直接调用单笔退款
    await handleRefund(tx.id, tx.amount, tx.account_id)
  }

  // 点击交易项进入编辑页
  const handleItemClick = (item: any) => {
    if (selectionMode !== 'none') {
      toggleSelect(item.id)
    } else {
      navigate(`/transactions/${item.id}`)
    }
  }

  return (
    <div>
      {/* 标签筛选器 */}
      {tags.length > 0 && selectionMode === 'none' && (
        <div style={{ marginBottom: 16 }}>
          <Select
            placeholder="按标签筛选"
            value={selectedTagId}
            onChange={setSelectedTagId}
            style={{ width: 160 }}
            allowClear
            size="small"
          >
            {tags.map(t => (
              <Select.Option key={t.id} value={t.id}>
                <Tag color={t.color || 'blue'}>{t.name}</Tag>
              </Select.Option>
            ))}
          </Select>
        </div>
      )}

      {/* 顶部操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {selectionMode === 'none' ? (
          <>
            <span style={{ fontSize: 14, color: '#666' }}>{data.length} 条记录</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" onClick={() => enterSelectionMode('refund')}>退款</Button>
              <Button size="small" danger onClick={() => enterSelectionMode('delete')}>删除</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox 
                checked={selectedIds.length === data.length && data.length > 0} 
                indeterminate={selectedIds.length > 0 && selectedIds.length < data.length}
                onChange={toggleSelectAll}
              />
              <span>已选 {selectedIds.length} 项</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" onClick={cancelSelectionMode}>取消</Button>
              {selectionMode === 'delete' && (
                <Button size="small" danger onClick={handleBatchDelete} loading={submitting}>确认删除</Button>
              )}
              {selectionMode === 'refund' && (
                <Button size="small" type="primary" onClick={handleBatchRefund} loading={submitting}>确认退款</Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 交易列表 */}
      {loading ? <Spin /> : data.length === 0 ? 
        <Empty description="暂无交易记录" extra={<Button type="primary" onClick={() => navigate('/transactions/new')}>记一笔</Button>} /> : 
        <List 
          size="small" 
          dataSource={data} 
          renderItem={item => (
            <List.Item 
              style={{ padding: '12px 0', cursor: 'pointer', background: selectedIds.includes(item.id) ? '#f5f5f5' : undefined }}
              onClick={() => handleItemClick(item)}
            >
              {selectionMode !== 'none' && (
                <Checkbox 
                  checked={selectedIds.includes(item.id)} 
                  onChange={() => toggleSelect(item.id)}
                  style={{ marginRight: 8 }}
                  onClick={e => e.stopPropagation()}
                />
              )}
              <div style={{ flex: 1 }}>
                <div>{item.merchant || item.note || '-'}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {new Date(item.occurred_at).toLocaleDateString()}
                  {item.tags && item.tags.length > 0 && item.tags.map((t: any) => (
                    <Tag key={t.id} color={t.color} style={{ marginLeft: 4 }}>{t.name}</Tag>
                  ))}
                </div>
              </div>
              <div style={{ color: item.direction === 'in' ? '#52c41a' : item.direction === 'refund' ? '#1890ff' : '#ff4d4f', fontWeight: 500 }}>
                {item.direction === 'in' ? '+' : item.direction === 'refund' ? '↩' : '-'}¥{Number(item.amount).toFixed(2)}
              </div>
            </List.Item>
          )} 
        />
      }
    </div>
  )
}

const TransactionFormPage = () => {
  const { user, token } = useAuth()
  const [accounts, setAccounts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [form, setForm] = useState({ type: 'expense', amount: '', account_id: '', category_id: '', note: '', occurred_at: '' })
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const bookId = user?.default_book_id
  
  // 判断是编辑模式还是新建模式
  const transactionId = location.pathname.includes('/transactions/') && !location.pathname.endsWith('/new') 
    ? location.pathname.split('/transactions/')[1] 
    : null
  const isEditMode = !!transactionId

  // 加载已有交易数据（编辑模式）
  useEffect(() => {
    if (!bookId) return
    
    // 加载账户、分类和标签
    Promise.all([
      apiGet(`/api/accounts?book_id=${bookId}`),
      apiGet(`/api/categories?book_id=${bookId}`),
      apiGet(`/api/tags?book_id=${bookId}`),
    ]).then(([acc, cat, t]) => { 
      setAccounts(acc || []); 
      setCategories(cat || []); 
      setTags(t || [])
    }).catch(() => {})
    
    // 如果是编辑模式，加载交易数据
    if (transactionId) {
      setFetching(true)
      apiGet(`/api/transactions/${transactionId}`)
        .then(tx => {
          if (tx) {
            setForm({
              type: tx.direction === 'in' ? 'income' : 'expense',
              amount: String(tx.amount),
              account_id: tx.account_id || '',
              category_id: tx.category_id || '',
              note: tx.note || '',
              occurred_at: tx.occurred_at ? tx.occurred_at.split('T')[0] : ''
            })
            // 加载已有标签（从 JSON 字符串解析标签名称，再匹配 tag IDs）
            if (tx.tags) {
              try {
                const tagNames = typeof tx.tags === 'string' ? JSON.parse(tx.tags) : tx.tags
                if (Array.isArray(tagNames) && tags.length > 0) {
                  const matchedIds = tags.filter((t: any) => tagNames.includes(t.name)).map((t: any) => t.id)
                  setSelectedTagIds(matchedIds)
                }
              } catch (e) {
                console.error('Failed to parse tags:', e)
              }
            }
          }
        })
        .catch(() => { message.error('加载失败'); navigate('/transactions') })
        .finally(() => setFetching(false))
    }
  }, [bookId, transactionId, tags])

  // URL 参数设置类型
  useEffect(() => { 
    const params = new URLSearchParams(location.search); 
    if (params.get('type')) setForm(f => ({ ...f, type: params.get('type')! })) 
  }, [location])

  const handleSubmit = async () => {
    if (!form.amount || !form.account_id) { message.error('请填写必要信息'); return }
    setLoading(true)
    try {
      // 将 tag IDs 转换为 JSON 字符串（存储标签名称）
      const tagsJson = selectedTagIds.length > 0 
        ? JSON.stringify(selectedTagIds.map(id => tags.find(t => t.id === id)?.name || '').filter(Boolean))
        : null
      
      // transaction_type 是必须的
      const transactionType = form.type === 'income' ? 'income' : 'expense'
      const direction = form.type === 'income' ? 'in' : 'out'
      
      const payload = { 
        transaction_type: transactionType,
        amount: Number(form.amount), 
        direction: direction, 
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
        book_id: bookId,
        tags: tagsJson
      }
      
      if (isEditMode) {
        // 编辑模式：使用 PATCH
        await apiPatch(`/api/transactions/${transactionId}`, payload)
        message.success('更新成功')
        navigate('/transactions')
      } else {
        // 新建模式
        await apiPost('/api/transactions', payload)
        message.success('记录成功')
        navigate('/transactions')
      }
    } catch (err: any) {
      // 错误已由 api 层显示，但这里可以额外处理一些常见错误
      if (err.message?.includes('Account not found')) {
        message.error('账户不存在，请重新选择')
      } else if (err.message?.includes('Category not found')) {
        message.error('分类不存在，请重新选择')
      } else if (err.message?.includes('validation')) {
        message.error('数据验证失败，请检查输入')
      }
      // 其他错误由 api 层统一处理
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigate('/transactions')
  }

  if (fetching) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }

  return (
    <Card title={isEditMode ? '编辑交易' : (form.type === 'expense' ? '记支出' : form.type === 'income' ? '记收入' : '新建交易')}>
      <div style={{ marginBottom: 16 }}><Button.Group><Button type={form.type === 'expense' ? 'primary' : 'default'} onClick={() => setForm(f => ({ ...f, type: 'expense' }))}>支出</Button><Button type={form.type === 'income' ? 'primary' : 'default'} onClick={() => setForm(f => ({ ...f, type: 'income' }))}>收入</Button></Button.Group></div>
      <div style={{ marginBottom: 16 }}><InputNumber placeholder="金额" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: String(v || '') }))} style={{ width: '100%' }} min={0} precision={2} /></div>
      <div style={{ marginBottom: 16 }}><Input type="date" placeholder="日期" value={form.occurred_at} onChange={e => setForm(f => ({ ...f, occurred_at: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #d9d9d9' }} /></div>
      <div style={{ marginBottom: 16 }}><Select placeholder="选择账户" value={form.account_id || undefined} onChange={v => setForm(f => ({ ...f, account_id: v || '' }))} style={{ width: '100%' }}>{accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}</Select></div>
      <div style={{ marginBottom: 16 }}><Select placeholder="选择分类" value={form.category_id || undefined} onChange={v => setForm(f => ({ ...f, category_id: v || '' }))} style={{ width: '100%' }} allowClear>{categories.filter(c => c.category_type === form.type).map(c => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}</Select></div>
      
      {/* 标签选择 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontSize: 14, color: '#666' }}>标签</div>
        <Select
          mode="multiple"
          placeholder="选择标签"
          value={selectedTagIds}
          onChange={setSelectedTagIds}
          style={{ width: '100%' }}
          allowClear
        >
          {tags.map(t => (
            <Select.Option key={t.id} value={t.id}>
              <Tag color={t.color || 'blue'}>{t.name}</Tag>
            </Select.Option>
          ))}
        </Select>
      </div>
      
      <div style={{ marginBottom: 16 }}><input placeholder="备注" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d9d9d9' }} /></div>
      
      {/* 底部按钮：取消 + 保存 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button size="large" style={{ flex: 1 }} onClick={handleCancel}>取消</Button>
        <Button type="primary" size="large" style={{ flex: 1 }} loading={loading} onClick={handleSubmit}>保存</Button>
      </div>
    </Card>
  )
}

const AccountsPage = () => {
  const { user, token } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()
  const typeLabels: Record<string, string> = { cash: '现金', debit_card: '借记卡', credit_card: '信用卡', loan: '贷款', ewallet: '电子钱包', credit_line: '信用账户' }

  
  useEffect(() => { if (!bookId) return; apiGet(`/api/accounts?book_id=${bookId}`).then(res => setData(res || [])).catch(() => {}).finally(() => setLoading(false)) }, [bookId])

  return (
    <div>
      {loading ? <Spin /> : data.length === 0 ? 
        <Empty description="暂无账户" extra={<Button type="primary" onClick={() => navigate('/accounts/new')}>添加账户</Button>} /> : 
        <List 
          grid={{ gutter: 16, column: 2 }} 
          dataSource={data} 
          renderItem={item => (
            <List.Item>
              <Card 
                size="small" 
                hoverable 
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/accounts/${item.id}`)}
              >
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                <div style={{ color: '#999', fontSize: 12 }}>{typeLabels[item.account_type] || item.account_type}</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>¥{Number(item.current_balance || 0).toFixed(2)}</div>
                {item.debt_amount > 0 && <div style={{ color: '#ff4d4f', fontSize: 12 }}>负债: ¥{Number(item.debt_amount).toFixed(2)}</div>}
              </Card>
            </List.Item>
          )} 
        />
      }
    </div>
  )
}

// 账户详情页
const AccountDetailPage = () => {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const bookId = user?.default_book_id
  const accountId = location.pathname.split('/accounts/')[1]
  
  const [account, setAccount] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adjustModalVisible, setAdjustModalVisible] = useState(false)
  const [adjustForm] = Form.useForm()
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const typeLabels: Record<string, string> = { cash: '现金', debit_card: '借记卡', credit_card: '信用卡', loan: '贷款', ewallet: '电子钱包', credit_line: '信用账户' }

  useEffect(() => {
    if (!bookId || !accountId) return
    
    // 加载账户信息
    apiGet(`/api/accounts/${accountId}`)
      .then(setAccount)
      .catch(() => { message.error('加载失败'); navigate('/accounts') })
  }, [bookId, accountId])

  useEffect(() => {
    if (!bookId || !accountId || !month) return
    
    setLoading(true)
    // 按月份筛选流水
    const [year, mon] = month.split('-')
    const dateFrom = new Date(Number(year), Number(mon) - 1, 1).toISOString()
    const dateTo = new Date(Number(year), Number(mon), 0).toISOString()
    
    apiGet(`/api/transactions?book_id=${bookId}&account_id=${accountId}&date_from=${dateFrom}&date_to=${dateTo}&page=1&page_size=50`)
      .then(res => setTransactions(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [bookId, accountId, month])

  // 余额调整（通过创建调整交易）
  const handleBalanceAdjust = async (adjustAmount: number, note: string) => {
    if (!confirm(`确定要调整余额 ${adjustAmount >= 0 ? '+' : ''}¥${adjustAmount} 吗？`)) return
    try {
      await apiPost('/api/transactions/adjust', {
        book_id: bookId,
        account_id: accountId,
        amount: Math.abs(adjustAmount),
        direction: adjustAmount >= 0 ? 'in' : 'out',
        note: note || '余额调整'
      })
      message.success('调整成功')
      // 重新加载账户信息
      const updated = await apiGet(`/api/accounts/${accountId}`)
      setAccount(updated)
    } catch { message.error('调整失败') }
  }

  if (!account) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  // 生成月份选项
  const monthOptions = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div>
      {/* 账户信息卡片 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{account.name}</div>
            <div style={{ color: '#666', fontSize: 14 }}>{typeLabels[account.account_type] || account.account_type}</div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>¥{Number(account.current_balance || 0).toFixed(2)}</div>
          </div>
          <Button type="primary" size="small" onClick={() => navigate(`/accounts/${accountId}/edit`)}>编辑</Button>
        </div>
        
        {/* 信用账户额外信息 */}
        {account.account_type === 'credit_card' && (
          <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>信用额度:</span>
              <span>¥{Number(account.credit_limit || 0).toFixed(2)}</span>
            </div>
            {account.billing_date && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>账单日:</span>
                <span>每月 {account.billing_date} 日</span>
              </div>
            )}
            {account.repayment_date && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>还款日:</span>
                <span>每月 {account.repayment_date} 日</span>
              </div>
            )}
          </div>
        )}

        {/* 余额调整 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>余额调整</div>
          <Button size="small" type="primary" onClick={() => setAdjustModalVisible(true)}>调整</Button>
        </div>
      </Card>

      {/* 余额调整弹窗 */}
      <Modal
        title="余额调整"
        open={adjustModalVisible}
        onCancel={() => { setAdjustModalVisible(false); adjustForm.resetFields() }}
        footer={null}
      >
        <Form
          form={adjustForm}
          layout="vertical"
          onFinish={async (values) => {
            setAdjustSubmitting(true)
            try {
              await handleBalanceAdjust(
                values.adjustType === 'increase' ? values.amount : -values.amount,
                values.note || '余额调整'
              )
              setAdjustModalVisible(false)
              adjustForm.resetFields()
            } finally {
              setAdjustSubmitting(false)
            }
          }}
        >
          <Form.Item name="adjustType" label="调整方向" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="increase">增加</Select.Option>
              <Select.Option value="decrease">减少</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="请输入金额" />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} placeholder="可选备注" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={adjustSubmitting}>确认调整</Button>
        </Form>
      </Modal>

      {/* 月份切换 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500 }}>流水明细</span>
        <Select 
          value={month} 
          onChange={setMonth} 
          style={{ width: 120 }}
          size="small"
        >
          {monthOptions.map(m => <Select.Option key={m} value={m}>{m}</Select.Option>)}
        </Select>
      </div>

      {/* 流水列表 */}
      {loading ? <Spin /> : transactions.length === 0 ? 
        <Empty description="该月无流水" /> : 
        <List 
          size="small" 
          dataSource={transactions} 
          renderItem={item => (
            <List.Item>
              <div style={{ flex: 1 }}>
                <div>{item.note || item.merchant || '-'}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{new Date(item.occurred_at).toLocaleDateString()}</div>
              </div>
              <div style={{ color: item.direction === 'in' ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>
                {item.direction === 'in' ? '+' : '-'}¥{Number(item.amount).toFixed(2)}
              </div>
            </List.Item>
          )}
        />
      }
    </div>
  )
}

// 账户编辑页
const AccountEditPage = () => {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const bookId = user?.default_book_id
  const accountId = location.pathname.split('/accounts/')[1]?.replace('/edit', '')
  
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!bookId || !accountId) return
    
    apiGet(`/api/accounts/${accountId}`)
      .then(acc => {
        form.setFieldsValue({
          name: acc.name,
          account_type: acc.account_type,
          note: acc.note,
          billing_date: acc.billing_date,
          repayment_date: acc.repayment_date
        })
      })
      .catch(() => { message.error('加载失败'); navigate('/accounts') })
      .finally(() => setFetching(false))
  }, [bookId, accountId])

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      await fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values)
      })
      message.success('更新成功')
      navigate(`/accounts/${accountId}`)
    } catch { message.error('更新失败') }
    finally { setLoading(false) }
  }

  if (fetching) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <Card title="编辑账户">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="账户名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="account_type" label="账户类型" rules={[{ required: true }]}>
          <Select disabled>
            <Select.Option value="cash">现金</Select.Option>
            <Select.Option value="debit_card">借记卡</Select.Option>
            <Select.Option value="credit_card">信用卡</Select.Option>
            <Select.Option value="ewallet">电子钱包</Select.Option>
            <Select.Option value="credit_line">信用账户</Select.Option>
            <Select.Option value="loan">贷款</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="billing_date" label="账单日（信用卡）">
          <InputNumber style={{ width: '100%' }} min={1} max={31} placeholder="1-31" />
        </Form.Item>
        <Form.Item name="repayment_date" label="还款日（信用卡）">
          <InputNumber style={{ width: '100%' }} min={1} max={31} placeholder="1-31" />
        </Form.Item>
        <Form.Item name="note" label="备注"><Input.TextArea /></Form.Item>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button size="large" style={{ flex: 1 }} onClick={() => navigate(`/accounts/${accountId}`)}>取消</Button>
          <Button type="primary" size="large" style={{ flex: 1 }} htmlType="submit" loading={loading}>保存</Button>
        </div>
      </Form>
    </Card>
  )
}

const CategoriesPage = () => {
  const { user, token } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()

  // 构建二级结构
  const buildTree = (categories: any[]) => {
    const roots = categories.filter(c => !c.parent_id && c.is_active)
    return roots.map(root => ({
      ...root,
      children: categories.filter(c => c.parent_id === root.id && c.is_active)
    }))
  }

  useEffect(() => { if (!bookId) return; apiGet(`/api/categories?book_id=${bookId}`).then(res => setData(res || [])).catch(() => {}).finally(() => setLoading(false)) }, [bookId])

  const categoryTree = buildTree(data)

  // 渲染单个分类项（可点击编辑）
  const renderCategory = (item: any, isChild: boolean = false) => (
    <List.Item 
      style={{ padding: isChild ? '8px 12px' : '12px 0', cursor: 'pointer', background: isChild ? '#fafafa' : undefined }}
      onClick={() => navigate(`/categories/${item.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        <span style={{ fontSize: isChild ? 14 : 16, marginLeft: isChild ? 24 : 0 }}>{item.icon} {item.name}</span>
      </div>
      <Tag color={item.category_type === 'expense' ? 'red' : 'green'}>
        {item.category_type === 'expense' ? '支出' : '收入'}
      </Tag>
    </List.Item>
  )

  return (
    <div>
      {loading ? <Spin /> : 
        categoryTree.length === 0 ? 
          <Empty description="暂无分类" extra={<Button type="primary" onClick={() => navigate('/categories/new')}>添加分类</Button>} /> : 
          categoryTree.map(root => (
            <div key={root.id} style={{ marginBottom: 8 }}>
              {/* 一级分类 */}
              <div 
                style={{ 
                  padding: '12px 16px', 
                  background: '#f5f5f5', 
                  borderRadius: 8, 
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => navigate(`/categories/${root.id}`)}
              >
                {root.icon} {root.name}
              </div>
              {/* 二级分类 */}
              {root.children && root.children.length > 0 && (
                <List 
                  size="small" 
                  dataSource={root.children} 
                  renderItem={item => renderCategory(item, true)} 
                />
              )}
            </div>
          ))
      }
    </div>
  )
}

// 类别编辑页
const CategoryEditPage = () => {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const bookId = user?.default_book_id
  const categoryId = location.pathname.split('/categories/')[1]
  
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    if (!bookId || !categoryId) return
    
    // 加载所有分类（用于选择父类）
    apiGet(`/api/categories?book_id=${bookId}`)
      .then(res => setCategories(res || []))
      .catch(() => {})
    
    // 加载当前分类
    apiGet(`/api/categories/${categoryId}`)
      .then(cat => {
        form.setFieldsValue({
          name: cat.name,
          category_type: cat.category_type,
          parent_id: cat.parent_id || undefined,
          icon: cat.icon,
          is_active: cat.is_active
        })
      })
      .catch(() => { message.error('加载失败'); navigate('/categories') })
      .finally(() => setFetching(false))
  }, [bookId, categoryId])

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      // 使用 PATCH 方法统一更新
      await apiPatch(`/api/categories/${categoryId}`, values)
      message.success('更新成功')
      navigate('/categories')
    } catch { message.error('更新失败') }
    finally { setLoading(false) }
  }

  // 可选的父分类（不能是自己和自己的孩子）
  const availableParents = categories.filter(c => c.id !== categoryId && !categories.some(child => child.parent_id === categoryId && child.id === c.id))

  if (fetching) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <Card title="编辑分类">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="分类名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="category_type" label="类型" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="expense">支出</Select.Option>
            <Select.Option value="income">收入</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="parent_id" label="所属大类（留空则为一级分类）">
          <Select allowClear placeholder="选择父分类">
            {availableParents.filter(c => !c.parent_id).map(c => (
              <Select.Option key={c.id} value={c.id}>{c.icon} {c.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="icon" label="图标（emoji）"><Input placeholder="如: 🍔" /></Form.Item>
        <Form.Item name="is_active" label="启用状态" valuePropName="checked">
          <Checkbox>启用</Checkbox>
        </Form.Item>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button size="large" style={{ flex: 1 }} onClick={() => navigate('/categories')}>取消</Button>
          <Button type="primary" size="large" style={{ flex: 1 }} htmlType="submit" loading={loading}>保存</Button>
        </div>
      </Form>
    </Card>
  )
}

const LoansPage = () => {
  const { user, token } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()

  
  useEffect(() => { if (!bookId) return; apiGet(`/api/loans?book_id=${bookId}`).then(res => setData(res || [])).catch(() => {}).finally(() => setLoading(false)) }, [bookId])

  return (
    <div>
      {loading ? <Spin /> : data.length === 0 ? <Empty description="暂无贷款" extra={<Button type="primary" onClick={() => navigate('/loans/new')}>添加贷款</Button>} /> : 
        <List size="small" dataSource={data} renderItem={item => <List.Item><div><div>{item.loan_name}</div><div style={{ fontSize: 12, color: '#999' }}>剩余 ¥{Number(item.principal_remaining).toFixed(2)}</div></div><Tag color="blue">{(item.current_period || 0)}/{item.total_periods}期</Tag></List.Item>} />}
    </div>
  )
}

const LoanFormPage = () => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      await apiPost('/api/loans', { ...values, book_id: bookId })
      message.success('创建成功')
      navigate('/loans')
    } catch { message.error('创建失败') }
    finally { setLoading(false) }
  }

  return (
    <Card title="添加贷款">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="loan_name" label="贷款名称" rules={[{ required: true }]}><Input placeholder="如: 房贷、车贷" /></Form.Item>
        <Form.Item name="principal" label="贷款本金" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} precision={2} placeholder="请输入金额" /></Form.Item>
        <Form.Item name="interest_rate" label="年利率(%)" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} precision={2} placeholder="如: 4.9" /></Form.Item>
        <Form.Item name="total_periods" label="总期数" rules={[{ required: true }]}><InputNumber style={{ width: "100%" }} placeholder="如: 36（个月）" /></Form.Item>
        <Form.Item name="start_date" label="开始日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        <Form.Item name="note" label="备注"><Input.TextArea placeholder="可选备注" /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>创建</Button>
      </Form>
    </Card>
  )
}

const ImportsPage = () => {
  const { user, token } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const [uploading, setUploading] = useState(false)

  
  useEffect(() => { if (!bookId) return; apiGet(`/api/imports?book_id=${bookId}`).then(res => setData(res || [])).catch(() => {}).finally(() => setLoading(false)) }, [bookId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      // 使用专用上传函数 apiUpload
      await apiUpload(`/api/imports/upload?book_id=${bookId}`, formData)
      message.success('上传成功')
      apiGet(`/api/imports?book_id=${bookId}`).then(setData)
    } catch { /* error already handled by apiUpload */ }
    finally { setUploading(false) }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}><input type="file" accept=".csv,.xlsx" onChange={handleUpload} disabled={uploading} /></Card>
      {loading ? <Spin /> : data.length === 0 ? <Empty description="暂无导入记录" /> : <List size="small" dataSource={data} renderItem={item => <List.Item><div><div>{item.filename}</div><div style={{ fontSize: 12, color: '#999' }}>{new Date(item.created_at).toLocaleString()}</div></div><Tag color={item.status === 'confirmed' ? 'green' : item.status === 'failed' ? 'red' : 'blue'}>{item.status}</Tag></List.Item>} />}
    </div>
  )
}

const ReportsPage = () => {
  const { user, token } = useAuth()
  const [overview, setOverview] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id

  
  useEffect(() => {
    if (!bookId) return
    const today = new Date()
    const dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const dateTo = today.toISOString().split('T')[0]
    apiGet(`/api/reports/overview?book_id=${bookId}&date_from=${dateFrom}&date_to=${dateTo}`).then(setOverview).catch(() => {}).finally(() => setLoading(false))
  }, [bookId])

  return loading ? <Spin /> : <Row gutter={16}><Col span={8}><Card>收入<br/><b style={{ fontSize: 20 }}>¥{(overview.income || 0).toFixed(2)}</b></Card></Col><Col span={8}><Card>支出<br/><b style={{ fontSize: 20 }}>¥{(overview.net_expense || 0).toFixed(2)}</b></Card></Col><Col span={8}><Card>结余<br/><b style={{ fontSize: 20 }}>¥{(overview.net || 0).toFixed(2)}</b></Card></Col></Row>
}

const TransferPage = () => {
  const { user, token } = useAuth()
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ from_account_id: '', to_account_id: '', amount: '', note: '' })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const bookId = user?.default_book_id

  
  useEffect(() => { if (!bookId) return; apiGet(`/api/accounts?book_id=${bookId}`).then(setAccounts).catch(() => {}) }, [bookId])

  const handleSubmit = async () => {
    if (!form.amount || !form.from_account_id || !form.to_account_id) { message.error('请填写必要信息'); return }
    if (form.from_account_id === form.to_account_id) { message.error('不能转给自己'); return }
    setLoading(true)
    try {
      // apiPost returns the data directly on success, throws on failure
      await apiPost('/api/transactions/transfer', { ...form, amount: Number(form.amount), occurred_at: new Date().toISOString(), book_id: bookId })
      message.success('转账成功')
      navigate('/transactions')
    } catch { /* error already handled by apiPost */ }
    finally { setLoading(false) }
  }

  return (
    <Card title="转账">
      <div style={{ marginBottom: 16 }}><Select placeholder="转出账户" value={form.from_account_id || undefined} onChange={v => setForm(f => ({ ...f, from_account_id: v || '' }))} style={{ width: '100%' }}>{accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}</Select></div>
      <div style={{ marginBottom: 16 }}><Select placeholder="转入账户" value={form.to_account_id || undefined} onChange={v => setForm(f => ({ ...f, to_account_id: v || '' }))} style={{ width: '100%' }}>{accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}</Select></div>
      <div style={{ marginBottom: 16 }}><InputNumber placeholder="金额" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: String(v || '') }))} style={{ width: '100%' }} min={0} precision={2} /></div>
      <div style={{ marginBottom: 16 }}><input placeholder="备注" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d9d9d9' }} /></div>
      <Button type="primary" block size="large" loading={loading} onClick={handleSubmit}>确认转账</Button>
    </Card>
  )
}



const AccountFormPage = () => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  const [loading, setLoading] = useState(false)
  const [accountType, setAccountType] = useState<string>('cash')

  // 判断是否为资产类账户
  const isAssetAccount = ['cash', 'debit_card', 'ewallet'].includes(accountType)
  // 判断是否为信用类账户
  const isCreditAccount = ['credit_card', 'credit_line'].includes(accountType)
  // 判断是否为贷款账户
  const isLoanAccount = accountType === 'loan'

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      // 根据账户类型构建不同的 payload
      const payload: any = {
        name: values.name,
        account_type: values.account_type,
        note: values.note || '',
        book_id: bookId
      }

      if (isAssetAccount) {
        // 资产类：初始余额
        payload.opening_balance = values.opening_balance || 0
        payload.current_balance = values.opening_balance || 0
        payload.institution_name = values.institution || null
      } else if (isCreditAccount) {
        // 信用类：额度、账单日、还款日
        payload.credit_limit = values.credit_limit || 0
        payload.billing_day = values.billing_day || null
        payload.repayment_day = values.repayment_day || null
        payload.card_last4 = values.card_last_four || null
        payload.current_balance = 0  // 信用卡使用 debt_amount
        payload.debt_amount = values.initial_debt || 0
      } else if (isLoanAccount) {
        // 贷款类：使用 debt_amount 表达负债
        payload.debt_amount = values.loan_principal || 0  // 贷款本金
        // 贷款账户的 current_balance 为 0，表示已借出
        payload.current_balance = 0
        payload.institution_name = values.institution || null
      }

      await apiPost('/api/accounts', payload)
      message.success('创建成功')
      navigate('/accounts')
    } catch { message.error('创建失败') }
    finally { setLoading(false) }
  }

  return (
    <Card title="新建账户">
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ account_type: 'cash', opening_balance: 0 }}>
        <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}><Input /></Form.Item>
        <Form.Item name="account_type" label="账户类型" rules={[{ required: true }]}>
          <Select onChange={(value) => setAccountType(value as string)}>
            <Select.Option value="cash">现金</Select.Option>
            <Select.Option value="debit_card">借记卡</Select.Option>
            <Select.Option value="credit_card">信用卡</Select.Option>
            <Select.Option value="ewallet">电子钱包</Select.Option>
            <Select.Option value="credit_line">信用账户</Select.Option>
            <Select.Option value="loan">贷款</Select.Option>
          </Select>
        </Form.Item>

        {/* 资产类账户字段 */}
        {isAssetAccount && (
          <>
            <Form.Item name="opening_balance" label="初始余额">
              <InputNumber style={{ width: "100%" }} precision={2} min={0} />
            </Form.Item>
            <Form.Item name="institution" label="所属机构（可选）">
              <Input placeholder="如: 工商银行" />
            </Form.Item>
          </>
        )}

        {/* 信用类账户字段 */}
        {isCreditAccount && (
          <>
            <Form.Item name="credit_limit" label="信用额度" rules={[{ required: true, message: '请输入信用额度' }]}>
              <InputNumber style={{ width: "100%" }} precision={2} min={0} placeholder="如: 10000" />
            </Form.Item>
            <Form.Item name="billing_day" label="账单日（每月）">
              <InputNumber style={{ width: "100%" }} min={1} max={31} placeholder="1-31" />
            </Form.Item>
            <Form.Item name="repayment_day" label="还款日（每月）">
              <InputNumber style={{ width: "100%" }} min={1} max={31} placeholder="1-31" />
            </Form.Item>
            <Form.Item name="card_last_four" label="卡号后四位（可选）">
              <Input maxLength={4} placeholder="如: 1234" />
            </Form.Item>
            <Form.Item name="initial_debt" label="当前欠款（可选）">
              <InputNumber style={{ width: "100%" }} precision={2} min={0} placeholder="如: 5000" />
            </Form.Item>
          </>
        )}

        {/* 贷款账户字段 */}
        {isLoanAccount && (
          <>
            <Form.Item name="loan_principal" label="贷款本金" rules={[{ required: true, message: '请输入贷款本金' }]}>
              <InputNumber style={{ width: "100%" }} precision={2} min={0} placeholder="如: 300000" />
            </Form.Item>
            <Form.Item name="institution" label="所属机构（可选）">
              <Input placeholder="如: 建设银行" />
            </Form.Item>
          </>
        )}

        <Form.Item name="note" label="备注">
          <Input.TextArea placeholder="可选备注" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={loading}>创建</Button>
      </Form>
    </Card>
  )
}

const CategoryFormPage = () => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<any[]>([])

  // 加载现有分类（用于选择父类）
  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/categories?book_id=${bookId}`)
      .then(res => setCategories(res || []))
      .catch(() => {})
  }, [bookId])

  // 只显示一级分类作为父类选项
  const parentOptions = categories.filter(c => !c.parent_id)

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      // 如果选择了父类，设置 parent_id
      const payload = {
        ...values,
        book_id: bookId,
        parent_id: values.parent_id || null
      }
      await apiPost('/api/categories', payload)
      message.success('创建成功')
      navigate('/categories')
    } catch { message.error('创建失败') }
    finally { setLoading(false) }
  }

  return (
    <Card title="新建分类">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="分类名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="category_type" label="类型" rules={[{ required: true }]}>
          <Select>
            <Select.Option value="expense">支出</Select.Option>
            <Select.Option value="income">收入</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="parent_id" label="所属大类（留空则为一级分类）">
          <Select allowClear placeholder="选择父分类">
            {parentOptions.map(c => (
              <Select.Option key={c.id} value={c.id}>{c.icon} {c.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="icon" label="图标（emoji）"><Input placeholder="如: 🍔" /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>创建</Button>
      </Form>
    </Card>
  )
}

const TagsPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()

  useEffect(() => { if (!bookId) return; apiGet(`/api/tags?book_id=${bookId}`).then(res => setData(res || [])).catch(() => {}).finally(() => setLoading(false)) }, [bookId])

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/tags/${id}`)
      message.success('删除成功')
      setData(data.filter((t: any) => t.id !== id))
    } catch { message.error('删除失败') }
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>
  return (
    <div>
      {loading ? <Spin /> : data.length === 0 ? <Empty description="暂无标签"><Button type="primary" onClick={() => navigate('/tags/new')}>添加标签</Button></Empty> : 
        <List size="small" dataSource={data} renderItem={(item: any) => <List.Item actions={[<Button key="del" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />]}><Tag color={item.color || 'blue'}>{item.name}</Tag></List.Item>} />}
    </div>
  )
}

const TagFormPage = () => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      await apiPost('/api/tags', { ...values, book_id: bookId })
      message.success('创建成功')
      navigate('/tags')
    } catch { message.error('创建失败') }
    finally { setLoading(false) }
  }

  return (
    <Card title="新建标签">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="标签名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="color" label="颜色"><Input type="color" /></Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>创建</Button>
      </Form>
    </Card>
  )
}

const SettingsPage = () => {
  const { user, logout } = useAuth()
  
  return (
    <div>
      <Card title="个人设置" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Avatar size={64} style={{ backgroundColor: '#1677ff', marginRight: 16 }}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </Avatar>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{user?.email || '用户'}</div>
            <div style={{ color: '#666', fontSize: 14 }}>默认账本</div>
          </div>
        </div>
        {user?.default_book_id && (
          <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
            账本ID: {user.default_book_id}
          </div>
        )}
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

// ========== Main App ==========

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${storedToken}` } })
        .then(res => { 
          if (res.ok) return res.json(); 
          else { localStorage.removeItem('token'); return null } 
        })
        .then(data => { 
          if (data) { setUser(data); setToken(storedToken) } 
        })
        .catch(() => { localStorage.removeItem('token'); setToken(null) })
        .finally(() => setLoading(false))
    } else { 
      setLoading(false) 
    }
  }, [])

  const login = (newToken: string, newUser: any) => { 
    localStorage.setItem('token', newToken); 
    setToken(newToken); 
    setUser(newUser) 
  }
  const logout = () => { 
    localStorage.removeItem('token'); 
    setToken(null); 
    setUser(null) 
  }

  return (
    <BrowserRouter>
      <AuthContext.Provider value={{ token, user, login, logout, loading }}>
        {token ? (
          <Routes>
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/register" element={<Navigate to="/dashboard" replace />} />
            <Route path="/*" element={<AppShell />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/*" element={<Navigate to="/login" replace />} />
          </Routes>
        )}
      </AuthContext.Provider>
    </BrowserRouter>
  )
}

export default App