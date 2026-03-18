import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Drawer, FloatButton, message, Card, Row, Col, List, Avatar, Tag, Button, Empty, Spin, Select, InputNumber } from 'antd'
import {
  DashboardOutlined,
  WalletOutlined,
  TagsOutlined,
  SwapOutlined,
  BankOutlined,
  UploadOutlined,
  BarChartOutlined,
  SettingOutlined,
  PlusOutlined,
  MenuOutlined,
  CloseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import { useState, useEffect, createContext, useContext } from 'react'

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
  const { token, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

const DRAWER_WIDTH = 280
const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <SwapOutlined />, label: '交易' },
  { key: '/accounts', icon: <WalletOutlined />, label: '账户' },
  { key: '/categories', icon: <TagsOutlined />, label: '分类' },
  { key: '/loans', icon: <BankOutlined />, label: '贷款' },
  { key: '/imports', icon: <UploadOutlined />, label: '导入' },
  { key: '/reports', icon: <BarChartOutlined />, label: '报表' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]
const pageTitles: Record<string, string> = { '/dashboard': '首页', '/transactions': '交易记录', '/transactions/new': '记一笔', '/accounts': '账户管理', '/categories': '分类管理', '/loans': '贷款管理', '/imports': '批量导入', '/reports': '报表中心', '/transfer': '转账', '/settings': '设置' }

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
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/imports" element={<ImportsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
      <FloatButton.Group trigger="click" style={{ right: 24, bottom: 24 }} icon={<PlusOutlined />} open={fabMenuOpen} onOpenChange={setFabMenuOpen}>
        <FloatButton tooltip="记支出" icon={<ArrowDownOutlined />} onClick={() => handleFabClick('expense')} />
        <FloatButton tooltip="记收入" icon={<ArrowUpOutlined />} onClick={() => handleFabClick('income')} />
        <FloatButton tooltip="转账" icon={<SwapOutlined />} onClick={() => handleFabClick('transfer')} />
        <FloatButton tooltip="导入" icon={<ImportOutlined />} onClick={() => handleFabClick('import')} />
      </FloatButton.Group>
    </Layout>
  )
}

const DashboardPage = () => {
  const { user } = useAuth()
  const [overview, setOverview] = useState<any>({})
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => {
    if (!bookId) return
    const today = new Date()
    const dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const dateTo = today.toISOString().split('T')[0]
    Promise.all([
      fetch(`/api/reports/overview?book_id=${bookId}&date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.json()),
      fetch(`/api/reports/expense-by-category?book_id=${bookId}&date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.json()),
    ]).then(([ov, ex]) => { setOverview(ov || {}); setExpenses(ex || []) }).finally(() => setLoading(false))
  }, [bookId])

  return (
    <div>
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
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')
  const navigate = useNavigate()

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => {
    if (!bookId) return
    fetch(`/api/transactions?book_id=${bookId}&page=1&page_size=20`).then(r => r.json()).then(res => setData(res.items || [])).finally(() => setLoading(false))
  }, [bookId])

  return (
    <div>{loading ? <Spin /> : data.length === 0 ? <Empty description="暂无交易记录" extra={<Button type="primary" onClick={() => navigate('/transactions/new')}>记一笔</Button>} /> : <List size="small" dataSource={data} renderItem={item => <List.Item style={{ padding: '12px 0' }}><div style={{ flex: 1 }}><div>{item.merchant || item.note || '-'}</div><div style={{ fontSize: 12, color: '#999' }}>{new Date(item.occurred_at).toLocaleDateString()}</div></div><div style={{ color: item.direction === 'in' ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>{item.direction === 'in' ? '+' : '-'}¥{Number(item.amount).toFixed(2)}</div></List.Item>} />}</div>
  )
}

const TransactionFormPage = () => {
  const { user } = useAuth()
  const [bookId, setBookId] = useState('')
  const [accounts, setAccounts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [form, setForm] = useState({ type: 'expense', amount: '', account_id: '', category_id: '', note: '' })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id); const params = new URLSearchParams(location.search); if (params.get('type')) setForm(f => ({ ...f, type: params.get('type')! })) }, [user, location])
  useEffect(() => { if (!bookId) return; Promise.all([fetch(`/api/accounts?book_id=${bookId}`).then(r => r.json()), fetch(`/api/categories?book_id=${bookId}`).then(r => r.json())]).then(([acc, cat]) => { setAccounts(acc || []); setCategories(cat || []) }) }, [bookId])

  const handleSubmit = async () => {
    if (!form.amount || !form.account_id) { message.error('请填写必要信息'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount), occurred_at: new Date().toISOString(), direction: form.type === 'income' ? 'in' : 'out', book_id: bookId }) })
      if (res.ok) { message.success('记录成功'); navigate('/transactions') }
      else { const data = await res.json(); message.error(data.detail || '记录失败') }
    } catch { message.error('请求失败') }
    finally { setLoading(false) }
  }

  return (
    <Card title={form.type === 'expense' ? '记支出' : form.type === 'income' ? '记收入' : '新建交易'}>
      <div style={{ marginBottom: 16 }}><Button.Group><Button type={form.type === 'expense' ? 'primary' : 'default'} onClick={() => setForm(f => ({ ...f, type: 'expense' }))}>支出</Button><Button type={form.type === 'income' ? 'primary' : 'default'} onClick={() => setForm(f => ({ ...f, type: 'income' }))}>收入</Button></Button.Group></div>
      <div style={{ marginBottom: 16 }}><InputNumber placeholder="金额" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: String(v || '') }))} style={{ width: '100%' }} min={0} precision={2} /></div>
      <div style={{ marginBottom: 16 }}><Select placeholder="选择账户" value={form.account_id || undefined} onChange={v => setForm(f => ({ ...f, account_id: v || '' }))} style={{ width: '100%' }}>{accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}</Select></div>
      <div style={{ marginBottom: 16 }}><Select placeholder="选择分类" value={form.category_id || undefined} onChange={v => setForm(f => ({ ...f, category_id: v || '' }))} style={{ width: '100%' }} allowClear>{categories.filter(c => c.category_type === form.type).map(c => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}</Select></div>
      <div style={{ marginBottom: 16 }}><input placeholder="备注" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d9d9d9' }} /></div>
      <Button type="primary" block size="large" loading={loading} onClick={handleSubmit}>保存</Button>
    </Card>
  )
}

const AccountsPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')
  const typeLabels: Record<string, string> = { cash: '现金', debit_card: '借记卡', credit_card: '信用卡', loan: '贷款' }

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => { if (!bookId) return; fetch(`/api/accounts?book_id=${bookId}`).then(r => r.json()).then(res => setData(res || [])).finally(() => setLoading(false)) }, [bookId])

  return (
    <div>{loading ? <Spin /> : data.length === 0 ? <Empty description="暂无账户" /> : <List grid={{ gutter: 16, column: 2 }} dataSource={data} renderItem={item => <List.Item><Card size="small"><div style={{ fontWeight: 500 }}>{item.name}</div><div style={{ color: '#999', fontSize: 12 }}>{typeLabels[item.account_type] || item.account_type}</div><div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>¥{Number(item.current_balance || 0).toFixed(2)}</div>{item.debt_amount > 0 && <div style={{ color: '#ff4d4f', fontSize: 12 }}>负债: ¥{Number(item.debt_amount).toFixed(2)}</div>}</Card></List.Item>} />}</div>
  )
}

const CategoriesPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => { if (!bookId) return; fetch(`/api/categories?book_id=${bookId}`).then(r => r.json()).then(res => setData(res || [])).finally(() => setLoading(false)) }, [bookId])

  return <div>{loading ? <Spin /> : <List size="small" dataSource={data.filter(c => c.is_active)} renderItem={item => <List.Item><span>{item.icon} {item.name}</span><Tag color={item.category_type === 'expense' ? 'red' : 'green'}>{item.category_type === 'expense' ? '支出' : '收入'}</Tag></List.Item>} />}</div>
}

const LoansPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => { if (!bookId) return; fetch(`/api/loans?book_id=${bookId}`).then(r => r.json()).then(res => setData(res || [])).finally(() => setLoading(false)) }, [bookId])

  return <div>{loading ? <Spin /> : data.length === 0 ? <Empty description="暂无贷款" /> : <List size="small" dataSource={data} renderItem={item => <List.Item><div><div>{item.loan_name}</div><div style={{ fontSize: 12, color: '#999' }}>剩余 ¥{Number(item.principal_remaining).toFixed(2)}</div></div><Tag color="blue">{(item.current_period || 0)}/{item.total_periods}期</Tag></List.Item>} />}</div>
}

const ImportsPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => { if (!bookId) return; fetch(`/api/imports?book_id=${bookId}`).then(r => r.json()).then(res => setData(res || [])).finally(() => setLoading(false)) }, [bookId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/imports/upload?book_id=${bookId}`, { method: 'POST', body: formData })
      if (res.ok) { message.success('上传成功'); fetch(`/api/imports?book_id=${bookId}`).then(r => r.json()).then(setData) }
      else { message.error('上传失败') }
    } catch { message.error('请求失败') }
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
  const { user } = useAuth()
  const [overview, setOverview] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [bookId, setBookId] = useState('')

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => {
    if (!bookId) return
    const today = new Date()
    const dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    const dateTo = today.toISOString().split('T')[0]
    fetch(`/api/reports/overview?book_id=${bookId}&date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.json()).then(setOverview).finally(() => setLoading(false))
  }, [bookId])

  return loading ? <Spin /> : <Row gutter={16}><Col span={8}><Card>收入<br/><b style={{ fontSize: 20 }}>¥{(overview.income || 0).toFixed(2)}</b></Card></Col><Col span={8}><Card>支出<br/><b style={{ fontSize: 20 }}>¥{(overview.net_expense || 0).toFixed(2)}</b></Card></Col><Col span={8}><Card>结余<br/><b style={{ fontSize: 20 }}>¥{(overview.net || 0).toFixed(2)}</b></Card></Col></Row>
}

const TransferPage = () => {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ from_account_id: '', to_account_id: '', amount: '', note: '' })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [bookId, setBookId] = useState('')

  useEffect(() => { if (user?.default_book_id) setBookId(user.default_book_id) }, [user])
  useEffect(() => { if (!bookId) return; fetch(`/api/accounts?book_id=${bookId}`).then(r => r.json()).then(setAccounts) }, [bookId])

  const handleSubmit = async () => {
    if (!form.amount || !form.from_account_id || !form.to_account_id) { message.error('请填写必要信息'); return }
    if (form.from_account_id === form.to_account_id) { message.error('不能转给自己'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/transactions/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: Number(form.amount), occurred_at: new Date().toISOString(), book_id: bookId }) })
      if (res.ok) { message.success('转账成功'); navigate('/transactions') }
      else { const data = await res.json(); message.error(data.detail || '转账失败') }
    } catch { message.error('请求失败') }
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

const SettingsPage = () => (
  <div>
    <Card title="个人设置">
      <p>设置功能开发中...</p>
    </Card>
  </div>
)

// ========== Main App ==========

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${storedToken}` } })
        .then(res => { if (res.ok) return res.json(); else { localStorage.removeItem('token'); return null } })
        .then(data => { if (data) { setUser(data); setToken(storedToken) } })
        .catch(() => { localStorage.removeItem('token'); setToken(null) })
        .finally(() => setLoading(false))
    } else { setLoading(false) }
  }, [])

  const login = (newToken: string, newUser: any) => { localStorage.setItem('token', newToken); setToken(newToken); setUser(newUser) }
  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null) }

  return (
    <BrowserRouter>
      <AuthContext.Provider value={{ token, user, login, logout, loading }}>
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
          <Route path="/register" element={token ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
          <Route path="/*" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />
        </Routes>
      </AuthContext.Provider>
    </BrowserRouter>
  )
}

export default App