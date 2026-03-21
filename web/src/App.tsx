import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { Layout, Menu, Drawer, FloatButton, message, Form, Input, Card, Row, Col, List, Avatar, Tag, Button, Empty, Spin, Select, InputNumber, Checkbox, Modal, Radio, Space } from 'antd'
const { Content } = Layout
import { DashboardOutlined, WalletOutlined, TagsOutlined, SwapOutlined, BankOutlined, UploadOutlined, BarChartOutlined, SettingOutlined, PlusOutlined, MenuOutlined, CloseOutlined, ArrowUpOutlined, ArrowDownOutlined, ImportOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react'

// 懒加载新页面组件
const AddTransactionPage = lazy(() => import('./pages/AddTransactionPage'))
const OtherTransactionPage = lazy(() => import('./pages/OtherTransactionPage'))

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
    加载中...
  </div>
)
import { apiGet, apiPost, apiDelete, apiUpload, apiPatch } from './services/api'
import { useTheme, getThemeVariables } from './hooks/useTheme'

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
    if (action === 'expense') navigate('/add-transaction?type=expense')
    else if (action === 'income') navigate('/add-transaction?type=income')
    else if (action === 'transfer') navigate('/transfer')
    else if (action === 'other') navigate('/other')
    else if (action === 'import') navigate('/imports')
  }

  // 根据页面上下文动态生成 FAB 按钮
  const getFabButtons = () => {
    const path = location.pathname
    const buttons: { key: string; label: string; icon: React.ReactNode; action: () => void }[] = []

    // 首页 /dashboard - 显示全部 5 个按钮
    if (path === '/dashboard') {
      buttons.push(
        { key: 'expense', label: '记支出', icon: <ArrowDownOutlined />, action: () => handleFabClick('expense') },
        { key: 'income', label: '记收入', icon: <ArrowUpOutlined />, action: () => handleFabClick('income') },
        { key: 'transfer', label: '转账', icon: <SwapOutlined />, action: () => handleFabClick('transfer') },
        { key: 'other', label: '其他', icon: <TagsOutlined />, action: () => handleFabClick('other') },
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
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 100 }}>
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
            <Route path="/date/:date" element={<DateDetailPage />} />
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
            <Route path="/add-transaction" element={<Suspense fallback={<LoadingFallback />}><AddTransactionPage /></Suspense>} />
            <Route path="/other" element={<Suspense fallback={<LoadingFallback />}><OtherTransactionPage /></Suspense>} />
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
  const { user } = useAuth()
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState(new Date())
  // 新的数据结构：包含 income, expense, net_balance
  const [monthData, setMonthData] = useState<{
    income: number, 
    expense: number, 
    daily: Record<string, { income: number, expense: number, net_balance: number }>
  }>({ income: 0, expense: 0, daily: {} })
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthStr = `${year}年${String(month + 1).padStart(2, '0')}月`

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0]
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0]
    
    // 使用新的 daily-summary 接口
    apiGet(`/api/reports/daily-summary?book_id=${bookId}&date_from=${firstDay}&date_to=${lastDay}`)
      .then((dailyData: any) => {
        // 计算月度总收入和总支出
        let totalIncome = 0
        let totalExpense = 0
        Object.values(dailyData).forEach((day: any) => {
          totalIncome += day.income || 0
          totalExpense += day.expense || 0
        })
        setMonthData({
          income: totalIncome,
          expense: totalExpense,
          daily: dailyData || {}
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [bookId, year, month])

  const generateCalendarDays = () => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // 修改数据结构以包含 income, expense, net_balance
    const days: { date: number | null, dateStr: string, income: number, expense: number, net_balance: number }[] = []
    
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: null, dateStr: '', income: 0, expense: 0, net_balance: 0 })
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayData = monthData.daily[dateStr] || { income: 0, expense: 0, net_balance: 0 }
      days.push({ date: d, dateStr, ...dayData })
    }
    
    return days
  }

  const goPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const goNextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const balance = monthData.income - monthData.expense
  const isToday = (d: number) => {
    const today = new Date()
    return d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 月度概览卡片 */}
      <div style={{ margin: '0 0 16px', borderRadius: 16, background: 'var(--bg-card)', padding: 16, boxShadow: 'var(--shadow-card)' }}>
        {/* 月份控制 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div onClick={goPrevMonth} style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span style={{ fontSize: 14 }}>◀</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{monthStr}</div>
          <div onClick={goNextMonth} style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span style={{ fontSize: 14 }}>▶</span>
          </div>
        </div>

        {/* 收支概览 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>支出</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-red)' }}>¥{monthData.expense.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>收入</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-green)' }}>¥{monthData.income.toFixed(2)}</div>
          </div>
        </div>

        {/* 收支比例条 */}
        <div style={{ height: 6, borderRadius: 3, background: 'var(--border-light)', overflow: 'hidden', display: 'flex', marginBottom: 16 }}>
          {monthData.expense > 0 && (
            <div style={{ width: `${Math.min(100, (monthData.expense / (monthData.income + monthData.expense || 1)) * 100)}%`, background: 'var(--accent-red)', transition: 'width 0.3s' }} />
          )}
          {monthData.income > 0 && (
            <div style={{ flex: 1, background: 'var(--accent-green)', transition: 'width 0.3s' }} />
          )}
        </div>

        {/* 结余 */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>结余 </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            ¥{balance.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 月历 */}
      <div style={{ margin: '0 0 16px', borderRadius: 16, background: 'var(--bg-card)', padding: 16, boxShadow: 'var(--shadow-card)' }}>
        {/* 星期标题 */}
        <div style={{ display: 'flex', marginBottom: 8 }}>
          {weekDays.map((day, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>{day}</div>
          ))}
        </div>
        
        {/* 日期网格 */}
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {generateCalendarDays().map((day, i) => (
            <div 
              key={i} 
              style={{ 
                width: '14.28%', 
                aspectRatio: '1/1', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: day.date ? 'pointer' : 'default',
                borderRadius: 8,
                background: day.date && isToday(day.date) ? 'var(--accent-color)' : 'transparent',
                padding: 2,
              }}
              onClick={() => day.date && navigate(`/date/${day.dateStr}`)}
            >
              {day.date && (
                <>
                  <span style={{ 
                    fontSize: 11, 
                    color: day.date && isToday(day.date) ? '#fff' : 'var(--text-primary)',
                    fontWeight: isToday(day.date) ? 600 : 400,
                  }}>{day.date}</span>
                  {/* 收入 */}
                  {day.income > 0 && (
                    <span style={{ 
                      fontSize: 8, 
                      color: day.date && isToday(day.date) ? '#90EE90' : 'var(--accent-green)',
                      lineHeight: 1.2,
                    }}>
                      +{day.income.toFixed(0)}
                    </span>
                  )}
                  {/* 支出 */}
                  {day.expense > 0 && (
                    <span style={{ 
                      fontSize: 8, 
                      color: day.date && isToday(day.date) ? '#FFB6C1' : 'var(--accent-red)',
                      lineHeight: 1.2,
                    }}>
                      -{day.expense.toFixed(0)}
                    </span>
                  )}
                  {/* 净收支（无收支时） */}
                  {day.income === 0 && day.expense === 0 && day.net_balance === 0 && (
                    <span style={{ 
                      fontSize: 8, 
                      color: day.date && isToday(day.date) ? '#ccc' : 'var(--text-tertiary)',
                      lineHeight: 1.2,
                    }}>-</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 日期明细页
const DateDetailPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const params = useParams()
  const date = params.date
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ income: 0, expense: 0 })
  const [categories, setCategories] = useState<any[]>([])
  const bookId = user?.default_book_id

  // 加载分类数据
  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/categories?book_id=${bookId}`)
      .then((data: any) => setCategories(data || []))
      .catch(() => {})
  }, [bookId])

  // 获取分类名称
  const getCategoryName = (categoryId: string) => {
    if (!categoryId) return ''
    const cat = categories.find((c: any) => c.id === categoryId)
    if (!cat) return ''
    if (cat.parent_id) {
      const parent = categories.find((c: any) => c.id === cat.parent_id)
      return parent ? `${parent.name}-${cat.name}` : cat.name
    }
    return cat.name
  }

  useEffect(() => {
    if (!bookId || !date) return
    setLoading(true)
    
    apiGet(`/api/transactions?book_id=${bookId}&date_from=${date}&date_to=${date}&page_size=100`)
      .then(data => {
        const items = data?.items || []
        setTransactions(items)
        
        let income = 0, expense = 0
        items.forEach((tx: any) => {
          const amt = Number(tx.amount)
          if (tx.direction === 'in' || tx.transaction_type === 'refund') {
            income += amt
          } else {
            expense += amt
          }
        })
        setSummary({ income, expense })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [bookId, date])

  const formatDate = (d: string) => {
    const [year, month, day] = d.split('-')
    return `${parseInt(month)}月${parseInt(day)}日`
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* 顶部栏 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-light)',
        margin: '-16px -16px 16px -16px',
      }}>
        <div 
          onClick={() => navigate('/dashboard')}
          style={{ 
            width: 36, height: 36, borderRadius: 18, 
            background: 'var(--bg-elevated)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            marginRight: 12,
          }}
        >
          <span style={{ fontSize: 16 }}>←</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
          {date ? formatDate(date) : '当日明细'}
        </div>
      </div>

      {/* 当日汇总 */}
      <div style={{ margin: '0 0 16px', borderRadius: 12, background: 'var(--bg-card)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>支出</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent-red)' }}>¥{summary.expense.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>收入</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent-green)' }}>¥{summary.income.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>结余</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: summary.income - summary.expense >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              ¥{(summary.income - summary.expense).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 流水列表 */}
      <div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>当日无记录</div>
        ) : (
          transactions.map((tx, i) => (
            <div 
              key={tx.id || i}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '12px 16px',
                marginBottom: 8,
                background: 'var(--bg-card)',
                borderRadius: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                {/* 交易类型标签 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {tx.transaction_type === 'refund' && (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fff3e0', color: '#ff9800' }}>退款</span>
                  )}
                  {tx.category_id && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {getCategoryName(tx.category_id)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {tx.merchant || tx.note || '-'}
                </div>
                {/* 标签显示 */}
                {tx.tags && tx.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {tx.tags.map((tag: string, idx: number) => (
                      <span key={idx} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {tx.occurred_at?.split('T')[1]?.substring(0, 5) || ''}
                </div>
              </div>
              <div style={{ 
                fontSize: 16, 
                fontWeight: 500,
                color: tx.direction === 'in' || tx.transaction_type === 'refund' ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {tx.direction === 'in' || tx.transaction_type === 'refund' ? '+' : '-'}¥{Number(tx.amount).toFixed(2)}
              </div>
            </div>
          ))
        )}
      </div>
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
  const [categories, setCategories] = useState<any[]>([])
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  
  // 批量操作状态
  const [selectionMode, setSelectionMode] = useState<'none' | 'delete' | 'refund'>('none')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 加载标签和分类列表
  useEffect(() => {
    if (!bookId) return
    Promise.all([
      apiGet(`/api/tags?book_id=${bookId}`),
      apiGet(`/api/categories?book_id=${bookId}`)
    ]).then(([t, c]) => { 
      setTags(t || [])
      setCategories(c || [])
    }).catch(() => {})
  }, [bookId])

  // 获取类别名称（支持二级）
  const getCategoryName = (categoryId: string) => {
    if (!categoryId) return ''
    const cat = categories.find((c: any) => c.id === categoryId)
    if (!cat) return ''
    if (cat.parent_id) {
      const parent = categories.find((c: any) => c.id === cat.parent_id)
      return parent ? `${parent.name}-${cat.name}` : cat.name
    }
    return cat.name
  }

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
    // 不再依赖 tags，避免无限循环
    loadData()
  }, [bookId, selectedTagId])

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
    setLoading(true)
    try {
      // 删除所有选中的交易
      for (const id of selectedIds) {
        await apiDelete(`/api/transactions/${id}?book_id=${bookId}`)
      }
      message.success('删除成功')
      cancelSelectionMode()
      // 清空选中项，重新加载数据
      const newData = await apiGet(`/api/transactions?book_id=${bookId}&page=1&page_size=50`)
      setData(newData.items || [])
    } catch { 
      message.error('删除失败')
      // 失败时重新加载
      loadData()
    } finally {
      setSubmitting(false)
      setLoading(false)
    }
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
            {tags.map(t => {
              // 如果是二级标签，显示 "父级 > 子级" 格式
              let label = t.name
              let color = t.color || 'blue'
              if (t.parent_id) {
                const parent = tags.find((p: any) => p.id === t.parent_id)
                if (parent) {
                  label = `${parent.name} > ${t.name}`
                  color = parent.color || color
                }
              }
              return (
                <Select.Option key={t.id} value={t.id}>
                  <Tag color={color}>{label}</Tag>
                </Select.Option>
              )
            })}
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
              style={{ padding: '12px 0', cursor: 'pointer', background: selectedIds.includes(item.id) ? 'var(--bg-elevated)' : undefined }}
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
                <div>
                  {/* 已退款的原交易显示 <已退款> 标记 */}
                  {item.has_refund && (
                    <span style={{ color: '#1890ff', fontSize: 12, marginRight: 4 }}>&lt;已退款&gt;</span>
                  )}
                  {/* 退款交易显示 <退款> 标记 */}
                  {item.transaction_type === 'refund' && (
                    <span style={{ color: '#52c41a', fontSize: 12, marginRight: 4 }}>&lt;退款&gt;</span>
                  )}
                  {getCategoryName(item.category_id) || item.merchant || item.note || '-'}
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {new Date(item.occurred_at).toLocaleDateString()}
                  {/* 显示标签（使用继承颜色） */}
                  {(() => {
                    let tagNames: string[] = []
                    if (item.tags) {
                      try {
                        tagNames = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags
                      } catch {}
                    }
                    if (tagNames.length > 0) {
                      return tagNames.map((name: string, idx: number) => {
                        // 查找标签所属的一级标签颜色
                        const tag = tags.find((t: any) => t.name === name)
                        let color = tag?.color || 'blue'
                        // 如果是二级标签，查找其父级颜色
                        if (tag?.parent_id) {
                          const parent = tags.find((t: any) => t.id === tag.parent_id)
                          if (parent?.color) color = parent.color
                        }
                        return <Tag key={idx} color={color} style={{ marginLeft: 4 }}>{name}</Tag>
                      })
                    }
                    return null
                  })()}
                </div>
              </div>
              <div style={{ color: item.direction === 'in' ? '#52c41a' : item.direction === 'refund' ? '#1890ff' : '#ff4d4f', fontWeight: 500 }}>
                {item.direction === 'in' ? '+' : item.direction === 'refund' ? '↩' : '-'}¥{Number(item.amount).toFixed(2)}
                {/* 退款交易不再额外显示标签，因为备注已包含 <退款> */}
              </div>
            </List.Item>
          )} 
        />
      }
    </div>
  )
}

const TransactionFormPage = () => {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [form, setForm] = useState({ type: 'expense', amount: '', account_id: '', category_id: '', note: '', occurred_at: '' })
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const navigate = useNavigate()
  const location = useLocation()
  const bookId = user?.default_book_id
  
  const transactionId = location.pathname.includes('/transactions/') && !location.pathname.endsWith('/new') 
    ? location.pathname.split('/transactions/')[1] 
    : null
  const isEditMode = !!transactionId

  const [loadedTx, setLoadedTx] = useState<any>(null)
  
  useEffect(() => {
    if (!bookId) return
    Promise.all([
      apiGet('/api/accounts?book_id=' + bookId),
      apiGet('/api/categories?book_id=' + bookId),
      apiGet('/api/tags?book_id=' + bookId),
    ]).then(([acc, cat, t]) => { 
      setAccounts(acc || []); 
      setCategories(cat || []); 
      setTags(t || [])
    }).catch(() => {})
  }, [bookId])

  useEffect(() => {
    if (!bookId || !transactionId) return
    setFetching(true)
    apiGet('/api/transactions/' + transactionId)
      .then(tx => {
        if (tx) {
          setLoadedTx(tx)
          setForm({
            type: tx.direction === 'in' ? 'income' : 'expense',
            amount: String(tx.amount),
            account_id: tx.account_id || '',
            category_id: tx.category_id || '',
            note: tx.note || '',
            occurred_at: tx.occurred_at ? tx.occurred_at.split('T')[0] : ''
          })
        }
      })
      .catch(() => { message.error('加载失败'); navigate('/transactions') })
      .finally(() => setFetching(false))
  }, [transactionId, bookId])

  useEffect(() => {
    if (!loadedTx || tags.length === 0) return
    if (loadedTx.tags) {
      try {
        const tagNames = typeof loadedTx.tags === 'string' ? JSON.parse(loadedTx.tags) : loadedTx.tags
        if (Array.isArray(tagNames)) {
          const matchedIds = tags.filter((t: any) => tagNames.includes(t.name)).map((t: any) => t.id)
          setSelectedTagIds(matchedIds)
        }
      } catch {}
    }
  }, [loadedTx, tags])

  useEffect(() => { 
    const params = new URLSearchParams(location.search)
    if (params.get('type')) setForm(f => ({ ...f, type: params.get('type')! })) 
  }, [location])

  const groupedTags = (() => {
    const parents = tags.filter((t: any) => !t.parent_id)
    return parents.map(p => ({
      ...p,
      children: tags.filter((t: any) => t.parent_id === p.id)
    })).filter(g => g.children.length > 0)
  })()

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.amount || Number(form.amount) <= 0) errs.amount = '请输入金额'
    if (!form.account_id) errs.account_id = '请选择账户'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setLoading(true)
    try {
      const tagsJson = selectedTagIds.length > 0 
        ? JSON.stringify(selectedTagIds.map(id => tags.find(t => t.id === id)?.name || '').filter(Boolean))
        : null
      const payload = { 
        transaction_type: form.type === 'income' ? 'income' : 'expense',
        amount: Number(form.amount), 
        direction: form.type === 'income' ? 'in' : 'out', 
        account_id: form.account_id,
        category_id: form.category_id || null,
        note: form.note,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : new Date().toISOString(),
        book_id: bookId,
        tags: tagsJson
      }
      if (isEditMode) {
        await apiPatch('/api/transactions/' + transactionId, payload)
        message.success('更新成功')
      } else {
        await apiPost('/api/transactions', payload)
        message.success('记录成功')
      }
      navigate('/transactions')
    } catch {} 
    finally { setLoading(false) }
  }

  if (fetching) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  const isExpense = form.type === 'expense'
  const accentColor = isExpense ? '#ff4d4f' : '#52c41a'
  const today = new Date().toISOString().split('T')[0]

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Button type="text" onClick={() => navigate('/transactions')} style={{ padding: '0 8px' }}>← 返回</Button>
        <div style={{ display: 'flex', background: 'var(--border-light)', borderRadius: 20, padding: 3 }}>
          <div
            onClick={() => { setForm(f => ({ ...f, type: 'expense' })); setErrors({}) }}
            style={{
              padding: '6px 24px', borderRadius: 18, cursor: 'pointer',
              background: isExpense ? 'var(--accent-red)' : 'transparent',
              color: isExpense ? '#fff' : 'var(--text-secondary)',
              fontWeight: 500, fontSize: 15, transition: 'all 0.2s',
            }}
          >支出</div>
          <div
            onClick={() => { setForm(f => ({ ...f, type: 'income' })); setErrors({}) }}
            style={{
              padding: '6px 24px', borderRadius: 18, cursor: 'pointer',
              background: !isExpense ? 'var(--accent-green)' : 'transparent',
              color: !isExpense ? '#fff' : 'var(--text-secondary)',
              fontWeight: 500, fontSize: 15, transition: 'all 0.2s',
            }}
          >收入</div>
        </div>
        <div style={{ width: 48 }} />
      </div>

      <div style={{
        textAlign: 'center', padding: '24px 16px', marginBottom: 20,
        background: 'linear-gradient(135deg, ' + accentColor + '08, ' + accentColor + '15)',
        borderRadius: 16, border: errors.amount ? '2px solid ' + accentColor : '2px solid transparent',
      }}>
        <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>{isExpense ? '支出金额' : '收入金额'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
          <span style={{ fontSize: 28, color: accentColor, fontWeight: 300, marginRight: 4 }}>¥</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={form.amount}
            onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setErrors(prev => ({ ...prev, amount: '' })) }}
            style={{
              fontSize: 40, fontWeight: 600, color: accentColor,
              border: 'none', background: 'transparent', outline: 'none',
              width: '60%', textAlign: 'left',
            }}
          />
        </div>
        {errors.amount && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 8 }}>{errors.amount}</div>}
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '0 16px', marginBottom: 16 }}>
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>账户</div>
          <Select
            placeholder="选择账户"
            value={form.account_id || undefined}
            onChange={v => { setForm(f => ({ ...f, account_id: v || '' })); setErrors(prev => ({ ...prev, account_id: '' })) }}
            style={{ width: '100%' }}
            size="large"
            status={errors.account_id ? 'error' : undefined}
          >
            {accounts.map(a => <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>)}
          </Select>
          {errors.account_id && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{errors.account_id}</div>}
        </div>

        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>分类</div>
          <Select
            placeholder="选择分类（可选）"
            value={form.category_id || undefined}
            onChange={v => setForm(f => ({ ...f, category_id: v || '' }))}
            style={{ width: '100%' }}
            size="large"
            allowClear
          >
            {categories.filter(c => c.category_type === form.type).map(c => (
              <Select.Option key={c.id} value={c.id}>{c.icon ? c.icon + ' ' : ''}{c.name}</Select.Option>
            ))}
          </Select>
        </div>

        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>日期</div>
          <input
            type="date"
            value={form.occurred_at || today}
            onChange={e => setForm(f => ({ ...f, occurred_at: e.target.value }))}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border-color)', fontSize: 15,
              background: 'var(--bg-input)', color: 'var(--text-primary)',
            }}
          />
        </div>

        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>标签</div>
          <Select
            mode="multiple"
            placeholder="选择标签（可选）"
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            style={{ width: '100%' }}
            size="large"
            allowClear
            maxTagCount={3}
          >
            {groupedTags.map(group => (
              <Select.OptGroup key={group.id} label={<span><Tag color={group.color} style={{ marginRight: 4, fontSize: 12 }}>{group.name}</Tag></span>}>
                {group.children.map((child: any) => (
                  <Select.Option key={child.id} value={child.id}>
                    <Tag color={group.color} style={{ fontSize: 12 }}>{child.name}</Tag>
                  </Select.Option>
                ))}
              </Select.OptGroup>
            ))}
          </Select>
        </div>

        <div style={{ padding: '14px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>备注（可选）</div>
          <input
            placeholder="添加备注"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border-color)', fontSize: 15,
              background: 'var(--bg-input)', color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, padding: '0 0 24px' }}>
        <Button size="large" style={{ flex: 1, height: 48, borderRadius: 12, fontSize: 16 }} onClick={() => navigate('/transactions')}>取消</Button>
        <Button
          type="primary" size="large" loading={loading}
          style={{ flex: 2, height: 48, borderRadius: 12, fontSize: 16, background: accentColor, borderColor: accentColor }}
          onClick={handleSubmit}
        >{isEditMode ? '保存修改' : '记一笔'}</Button>
      </div>
    </div>
  )
}

const AccountsPage = () => {
  const { user, token } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()
  const typeLabels: Record<string, string> = { cash: '现金', debit_card: '借记卡', credit_card: '信用卡', loan: '贷款', ewallet: '电子钱包', credit_line: '信用账户' }

  // 判断是否为信用类账户
  const isCreditAccount = (type: string) => ['credit_card', 'credit_line'].includes(type)
  
  // 计算信用账户剩余额度
  const getCreditDisplay = (item: any) => {
    if (isCreditAccount(item.account_type)) {
      const limit = Number(item.credit_limit || 0)
      const debt = Number(item.debt_amount || 0)
      const remaining = limit - debt
      return { remaining, limit, debt }
    }
    return null
  }

  useEffect(() => { if (!bookId) return; apiGet(`/api/accounts?book_id=${bookId}`).then(res => setData(res || [])).catch(() => {}).finally(() => setLoading(false)) }, [bookId])

  return (
    <div>
      {loading ? <Spin /> : data.length === 0 ? 
        <Empty description="暂无账户" extra={<Button type="primary" onClick={() => navigate('/accounts/new')}>添加账户</Button>} /> : 
        <List 
          grid={{ gutter: 16, column: 2 }} 
          dataSource={data} 
          renderItem={item => {
            const creditInfo = getCreditDisplay(item)
            return (
              <List.Item>
                <Card 
                  size="small" 
                  hoverable 
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/accounts/${item.id}`)}
                >
                  <div style={{ fontWeight: 500 }}>{item.name}</div>
                  <div style={{ color: '#999', fontSize: 12 }}>{typeLabels[item.account_type] || item.account_type}</div>
                  {creditInfo ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#52c41a' }}>剩余 ¥{creditInfo.remaining.toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>额度: ¥{creditInfo.limit.toFixed(2)}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>¥{Number(item.current_balance || 0).toFixed(2)}</div>
                  )}
                  {item.debt_amount > 0 && !creditInfo && <div style={{ color: '#ff4d4f', fontSize: 12 }}>负债: ¥{Number(item.debt_amount).toFixed(2)}</div>}
                </Card>
              </List.Item>
            )
          }} 
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
        {(account.account_type === 'credit_card' || account.account_type === 'credit_line') && (
          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>总额度:</span>
              <span style={{ fontWeight: 500 }}>¥{Number(account.credit_limit || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>已用额度:</span>
              <span style={{ color: 'var(--accent-red)', fontWeight: 500 }}>¥{Number(account.debt_amount || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 600 }}>
              <span style={{ color: 'var(--text-secondary)' }}>剩余额度:</span>
              <span style={{ color: 'var(--accent-green)' }}>¥{(Number(account.credit_limit || 0) - Number(account.debt_amount || 0)).toFixed(2)}</span>
            </div>
            {account.billing_day && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>账单日:</span>
                <span>每月 {account.billing_day} 日</span>
              </div>
            )}
            {account.repayment_day && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>还款日:</span>
                <span>每月 {account.repayment_day} 日</span>
              </div>
            )}
            {account.institution_name && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>所属机构:</span>
                <span>{account.institution_name}</span>
              </div>
            )}
            {account.card_last4 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>卡号后四位:</span>
                <span>****{account.card_last4}</span>
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
        setAccountType(acc.account_type)
        form.setFieldsValue({
          name: acc.name,
          account_type: acc.account_type,
          note: acc.note || '',
          // 信用类字段
          credit_limit: acc.credit_limit,
          billing_day: acc.billing_day,
          repayment_day: acc.repayment_day,
          card_last_four: acc.card_last4,
          initial_debt: acc.debt_amount,  // 加载当前欠款/已用额度
          // 资产类字段
          institution: acc.institution_name
        })
      })
      .catch(() => { message.error('加载失败'); navigate('/accounts') })
      .finally(() => setFetching(false))
  }, [bookId, accountId])

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      // 根据账户类型构建不同的 payload
      const payload: any = {}

      if (isAssetAccount) {
        payload.name = values.name
        payload.note = values.note || ''
        payload.institution_name = values.institution || null
      } else if (isCreditAccount) {
        payload.name = values.name
        payload.note = values.note || ''
        payload.credit_limit = values.credit_limit || 0
        payload.billing_day = values.billing_day || null
        payload.repayment_day = values.repayment_day || null
        payload.card_last4 = values.card_last_four || null
        // 信用账户使用 debt_amount 表示已用额度
        payload.debt_amount = values.initial_debt || 0
      } else if (isLoanAccount) {
        payload.name = values.name
        payload.note = values.note || ''
        payload.institution_name = values.institution || null
      }

      await fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
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
        <Form.Item name="billing_day" label="账单日（每月）">
          <InputNumber style={{ width: '100%' }} min={1} max={31} placeholder="1-31" />
        </Form.Item>
        <Form.Item name="repayment_day" label="还款日（每月）">
          <InputNumber style={{ width: '100%' }} min={1} max={31} placeholder="1-31" />
        </Form.Item>
        <Form.Item name="credit_limit" label="信用额度">
          <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="如: 10000" />
        </Form.Item>
        <Form.Item name="card_last_four" label="卡号后四位">
          <Input maxLength={4} placeholder="如: 1234" />
        </Form.Item>
        <Form.Item name="institution" label="所属机构">
          <Input placeholder="如: 工商银行" />
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
      style={{ padding: isChild ? '8px 12px' : '12px 0', cursor: 'pointer', background: isChild ? 'var(--bg-page)' : undefined }}
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
                  background: 'var(--bg-elevated)', 
                  borderRadius: 8, 
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editModal, setEditModal] = useState<{ visible: boolean; tag: any | null; isParent: boolean }>({ visible: false, tag: null, isParent: false })
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editParentId, setEditParentId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const bookId = user?.default_book_id
  const navigate = useNavigate()

  const loadTags = () => {
    if (!bookId) return
    apiGet(`/api/tags/tree?book_id=${bookId}`)
      .then(res => {
        const tree = res || []
        setData(tree)
        // 默认全部展开
        setExpandedGroups(new Set(tree.map((g: any) => g.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTags() }, [bookId])

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/tags/${id}?book_id=${bookId}`)
      message.success('删除成功')
      loadTags()
    } catch { message.error('删除失败') }
  }

  const openEdit = (tag: any, isParent: boolean) => {
    setEditModal({ visible: true, tag, isParent })
    setEditName(tag.name)
    setEditColor(tag.color || '#1677ff')
    setEditParentId(tag.parent_id || undefined)
  }

  const handleEditSave = async () => {
    if (!editModal.tag) return
    setSaving(true)
    try {
      const payload: any = { name: editName.trim() }
      // 一级标签可以改颜色
      if (editModal.isParent) {
        payload.color = editColor
      }
      // 二级标签可以改父级
      if (!editModal.isParent && editParentId) {
        payload.parent_id = editParentId
      }
      await apiPatch(`/api/tags/${editModal.tag.id}?book_id=${bookId}`, payload)
      message.success('更新成功')
      setEditModal({ visible: false, tag: null, isParent: false })
      loadTags()
    } catch { message.error('更新失败') }
    finally { setSaving(false) }
  }

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>

  // 一级标签列表（供编辑二级标签时切换父级）
  const parentOptions = data.map(g => ({ id: g.id, name: g.name }))

  return (
    <div>
      {loading ? <Spin /> : data.length === 0 ?
        <Empty description="暂无标签" extra={<Button type="primary" onClick={() => navigate('/tags/new')}>添加标签</Button>} /> :
        data.map(group => {
          const isExpanded = expandedGroups.has(group.id)
          const childCount = group.children?.length || 0
          return (
            <Card
              key={group.id}
              size="small"
              style={{ marginBottom: 8, borderLeft: `4px solid ${group.color || '#1677ff'}` }}
              bodyStyle={{ padding: 0 }}
            >
              {/* 一级标签标题栏 */}
              <div
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: isExpanded ? 'var(--bg-elevated)' : 'var(--bg-card)',
                }}
                onClick={() => toggleGroup(group.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block',
                    transition: 'transform 0.2s',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    fontSize: 12,
                    color: '#999',
                  }}>▶</span>
                  <Tag color={group.color || 'blue'} style={{ margin: 0 }}>{group.name}</Tag>
                  <span style={{ fontSize: 12, color: '#999' }}>{childCount} 个子标签</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <Button type="text" size="small" onClick={() => openEdit(group, true)}>编辑</Button>
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(group.id)} />
                </div>
              </div>

              {/* 二级标签列表 */}
              {isExpanded && childCount > 0 && (
                <div style={{ borderTop: '1px solid #f0f0f0' }}>
                  {group.children.map((child: any) => (
                    <div
                      key={child.id}
                      style={{
                        padding: '10px 16px 10px 48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--border-light)',
                      }}
                    >
                      <Tag color={group.color || 'blue'}>{child.name}</Tag>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button type="text" size="small" onClick={() => openEdit(child, false)}>编辑</Button>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(child.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 展开但无子标签 */}
              {isExpanded && childCount === 0 && (
                <div style={{ padding: '12px 48px', color: '#999', fontSize: 13, borderTop: '1px solid #f0f0f0' }}>
                  暂无子标签
                </div>
              )}
            </Card>
          )
        })
      }

      {/* 编辑弹窗 */}
      <Modal
        title={editModal.isParent ? '编辑一级标签' : '编辑二级标签'}
        open={editModal.visible}
        onCancel={() => setEditModal({ visible: false, tag: null, isParent: false })}
        onOk={handleEditSave}
        confirmLoading={saving}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 4, fontSize: 14, color: '#666' }}>名称</div>
          <Input value={editName} onChange={e => setEditName(e.target.value)} />
        </div>
        {editModal.isParent && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 4, fontSize: 14, color: '#666' }}>颜色</div>
            <Input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ width: 60, height: 36, padding: 2 }} />
          </div>
        )}
        {!editModal.isParent && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 4, fontSize: 14, color: '#666' }}>所属一级标签</div>
            <Select
              value={editParentId}
              onChange={setEditParentId}
              style={{ width: '100%' }}
            >
              {parentOptions.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
              ))}
            </Select>
          </div>
        )}
        {!editModal.isParent && (
          <div style={{ fontSize: 12, color: '#999' }}>颜色由一级标签决定，不可单独修改</div>
        )}
      </Modal>
    </div>
  )
}

const TagFormPage = () => {
  const { user } = useAuth()
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  const [loading, setLoading] = useState(false)
  const [parentTags, setParentTags] = useState<any[]>([])
  const [tagType, setTagType] = useState<'parent' | 'child'>('parent')
  const [selectedParentColor, setSelectedParentColor] = useState<string>('')

  // 加载一级标签（用于选择父级）
  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/tags/first-level?book_id=${bookId}`)
      .then(res => setParentTags(res || []))
      .catch(() => {})
  }, [bookId])

  // 当选择父标签时，显示其颜色
  const handleParentChange = (parentId: string) => {
    const parent = parentTags.find(t => t.id === parentId)
    setSelectedParentColor(parent?.color || '#1677ff')
  }

  const onFinish = async (values: any) => {
    if (!bookId) return
    if (!values.name || !values.name.trim()) {
      message.error('请输入标签名称')
      return
    }
    setLoading(true)
    try {
      const payload: any = {
        name: values.name.trim(),
        parent_id: null,
        book_id: bookId
      }
      if (tagType === 'parent') {
        // 一级标签：可以指定颜色，不传则后端自动分配
        if (values.color) payload.color = values.color
      } else {
        // 二级标签：必须选父级，颜色由后端继承父级
        if (!values.parent_id) {
          message.error('请选择所属一级标签')
          setLoading(false)
          return
        }
        payload.parent_id = values.parent_id
        // 不传 color，后端自动继承
      }
      await apiPost('/api/tags', payload)
      message.success('创建成功')
      navigate('/tags')
    } catch (err: any) {
      message.error(err.message || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigate('/tags')
  }

  return (
    <Card title="新建标签">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        {/* 标签类型切换 */}
        <div style={{ marginBottom: 16 }}>
          <Button.Group>
            <Button type={tagType === 'parent' ? 'primary' : 'default'} onClick={() => { setTagType('parent'); form.resetFields(['parent_id']) }}>一级标签</Button>
            <Button type={tagType === 'child' ? 'primary' : 'default'} onClick={() => setTagType('child')}>二级标签</Button>
          </Button.Group>
        </div>

        <Form.Item name="name" label="标签名称" rules={[{ required: true, message: '请输入标签名称' }]}><Input /></Form.Item>

        {tagType === 'parent' ? (
          <Form.Item name="color" label="颜色（不选则系统自动分配）">
            <Input type="color" style={{ width: 60, height: 36, padding: 2 }} />
          </Form.Item>
        ) : (
          <>
            <Form.Item name="parent_id" label="所属一级标签" rules={[{ required: true, message: '请选择一级标签' }]}>
              <Select placeholder="请选择一级标签" onChange={handleParentChange}>
                {parentTags.map(t => (
                  <Select.Option key={t.id} value={t.id}>
                    <Tag color={t.color || 'blue'}>{t.name}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            {selectedParentColor && (
              <div style={{ marginBottom: 16, fontSize: 13, color: '#999' }}>
                颜色将继承一级标签：<span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: selectedParentColor, verticalAlign: 'middle', marginRight: 4 }} />
                {selectedParentColor}
              </div>
            )}
            {parentTags.length === 0 && (
              <div style={{ marginBottom: 16, color: '#ff4d4f', fontSize: 13 }}>
                暂无一级标签，请先创建一级标签
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <Button size="large" style={{ flex: 1 }} onClick={handleCancel}>取消</Button>
          <Button type="primary" size="large" style={{ flex: 1 }} htmlType="submit" loading={loading}>创建</Button>
        </div>
      </Form>
    </Card>
  )
}

const SettingsPage = () => {
  const { user, logout } = useAuth()
  const { mode, setMode } = useTheme()
  
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
        <Radio.Group 
          value={mode} 
          onChange={e => setMode(e.target.value)}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio value="system">
              <div>
                <div style={{ fontWeight: 500 }}>跟随系统</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>根据设备自动切换浅色/深色模式</div>
              </div>
            </Radio>
            <Radio value="light">
              <div>
                <div style={{ fontWeight: 500 }}>浅色模式</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>始终使用浅色主题</div>
              </div>
            </Radio>
            <Radio value="dark">
              <div>
                <div style={{ fontWeight: 500 }}>深色模式</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>始终使用深色主题</div>
              </div>
            </Radio>
          </Space>
        </Radio.Group>
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
  const { theme } = useTheme()

  // 设置 data-theme 属性
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    // 同时设置 body 样式变量
    const vars = getThemeVariables(theme)
    Object.entries(vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value)
    })
  }, [theme])

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