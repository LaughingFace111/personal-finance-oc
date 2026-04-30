import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { Layout, Menu, Drawer, message, Form, Input, Card, Row, Col, List, Avatar, Tag, Button, Empty, Spin, Select, InputNumber, Checkbox, Modal, Radio, Space, Popconfirm, Tooltip, Switch, Alert } from 'antd'
import ReactECharts from 'echarts-for-react'
import { DashboardOutlined, WalletOutlined, TagsOutlined, SwapOutlined, BankOutlined, UploadOutlined, BarChartOutlined, SettingOutlined, PlusOutlined, MenuOutlined, CloseOutlined, ArrowUpOutlined, DeleteOutlined, FileTextOutlined, CalendarOutlined, ClockCircleOutlined, ShoppingOutlined, AccountBookOutlined } from '@ant-design/icons'
import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { StagingImportTable } from './components/StagingImportTable'
import { CategorySelector } from './components/CategorySelector'
import { TagMultiSelect } from './components/TagMultiSelect'
import TransactionListComponent from './components/TransactionList'
import { TransactionDetailModal } from './components/TransactionDetailModal'
import { transactionFormLabelClass } from './components/TransactionFormLayout'
import {
  apiGet,
  apiPost,
  apiDelete,
  apiPatch,
  apiUpload,
  type RecurringBillRecord,
  type ReconciliationDefaults,
  type ReconciliationSessionDetail,
  type ReconciliationSessionSummary,
  type ReconciliationStatementRow,
  type ReconciliationLedgerTransaction,
} from './services/api'
import { mapTagNamesToIds, parseTransactionTagNames, toDateInputValue } from './pages/transactionFormSupport'
import { useTheme, getThemeVariables } from './hooks/useTheme'
import { AuthContext, useAuth } from './contexts/AuthContext'
import { useAppStore } from './stores/appStore'

// 懒加载新页面组件
const AddTransactionPage = lazy(() => import('./pages/AddTransactionPage'))
const OtherHubPage = lazy(() => import('./pages/OtherHubPage'))
const InstallmentPage = lazy(() => import('./pages/InstallmentPage'))
const InstallmentTasksPage = lazy(() => import('./pages/InstallmentTasksPage'))
const OtherTransactionPage = lazy(() => import('./pages/OtherTransactionPage'))
const ReportsHomePage = lazy(() => import('./pages/ReportsHomePage'))
const AccountBalanceTrendPage = lazy(() => import('./pages/AccountBalanceTrendPage'))
const MonthlySummaryPage = lazy(() => import('./pages/MonthlySummaryPage'))
const ExpenseDistributionPage = lazy(() => import('./pages/ExpenseDistributionPage'))
const IncomeDistributionPage = lazy(() => import('./pages/IncomeDistributionPage'))
const MonthlyComparisonPage = lazy(() => import('./pages/MonthlyComparisonPage'))
const TagDistributionPage = lazy(() => import('./pages/TagDistributionPage'))
const TagDetailPage = lazy(() => import('./pages/TagDetailPage'))
const TagManagementPage = lazy(() => import('./pages/TagManagementPage'))
const ImportTemplatesPage = lazy(() => import('./pages/ImportTemplatesPage'))
const TransactionTemplatesPage = lazy(() => import('./pages/TransactionTemplatesPage'))
const RecurringRulesPage = lazy(() => import('./pages/RecurringRulesPage'))
const WishlistPage = lazy(() => import('./pages/WishlistPage'))
const DurableAssetsPage = lazy(() => import('./pages/DurableAssetsPage'))
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'))
const BudgetFormPage = lazy(() => import('./pages/BudgetFormPage'))
const BudgetDetailPage = lazy(() => import('./pages/BudgetDetailPage'))
const ReimbursementsPage = lazy(() => import('./pages/ReimbursementsPage'))
const ReimbursementFormPage = lazy(() => import('./pages/ReimbursementFormPage'))
const SettingsPageView = lazy(() => import('./pages/SettingsPage'))
const ImportsPageView = lazy(() => import('./pages/ImportsPage'))
const TransferPage = lazy(() => import('./pages/TransferPage'))
const ExportPage = lazy(() => import('./pages/ExportPage'))
const SplitFormPage = lazy(() => import('./pages/SplitFormPage'))
const SplitDetailPage = lazy(() => import('./pages/SplitDetailPage'))

export { useAuth }

const { Content } = Layout

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
    加载中...
  </div>
)

const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{username?: string; password?: string}>({})
  const { login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as any)?.from?.pathname || '/dashboard'

  const validate = () => {
    const newErrors: {username?: string; password?: string} = {}
    if (!username.trim()) newErrors.username = '请输入用户名'
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
        body: JSON.stringify({ username, password }),
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
          <input style={{ width: '100%', padding: '12px', borderRadius: 8, border: errors.username ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="用户名" value={username} onChange={e => { setUsername(e.target.value); setErrors({...errors, username: undefined}) }} />
          {errors.username && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>{errors.username}</div>}
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
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{username?: string; password?: string; confirmPwd?: string}>({})
  const navigate = useNavigate()

  const validate = () => {
    const newErrors: typeof errors = {}
    if (!username.trim()) newErrors.username = '请输入用户名'
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
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, nickname: nickname || undefined }) })
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
        <input style={{ width: '100%', padding: '12px', marginBottom: 12, borderRadius: 8, border: errors.username ? '1px solid #ff4d4f' : '1px solid #d9d9d9' }} placeholder="用户名" value={username} onChange={e => { setUsername(e.target.value); setErrors({...errors, username: undefined}) }} />
        {errors.username && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: -8, marginBottom: 8 }}>{errors.username}</div>}
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
void ProtectedRoute

const DRAWER_WIDTH = 280
const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首页' },
  { key: '/transactions', icon: <SwapOutlined />, label: '交易' },
  { key: '/accounts', icon: <WalletOutlined />, label: '账户' },
  { key: '/categories', icon: <TagsOutlined />, label: '分类' },
  { key: '/tags', icon: <TagsOutlined />, label: '标签' },
  { key: '/loans', icon: <BankOutlined />, label: '贷款' },
  { key: '/installments', icon: <ClockCircleOutlined />, label: '分期任务' },
  { key: '/subscriptions', icon: <CalendarOutlined />, label: '固定账单' },
  { key: '/wishlist', icon: <ShoppingOutlined />, label: '愿望单' },
  { key: '/budgets', icon: <CalendarOutlined />, label: '预算' },
  { key: '/assets', icon: <AccountBookOutlined />, label: '日均成本' },
  { key: '/imports', icon: <UploadOutlined />, label: '导入' },
  { key: '/export', icon: <FileTextOutlined />, label: '导出' },
  { key: '/reports', icon: <BarChartOutlined />, label: '报表' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]
const pageTitles: Record<string, string> = { '/dashboard': '首页', '/transactions': '交易记录', '/transactions/new': '记一笔', '/transactions/:id': '编辑交易', '/accounts': '账户管理', '/accounts/:id': '账户详情', '/accounts/:id/edit': '编辑账户', '/categories': '分类管理', '/categories/:id': '编辑分类', '/tags': '标签管理', '/categories/new': '新建分类', '/accounts/new': '新建账户', '/tags/new': '新建标签', '/loans': '贷款管理', '/loans/new': '添加贷款', '/installments': '分期任务', '/installments/new': '新增分期', '/installments/:id/edit': '编辑分期', '/subscriptions': '固定账单中心', '/wishlist': '愿望单', '/budgets': '预算', '/budgets/new': '新建预算', '/reimbursements': '报销垫付管理', '/reimbursements/new': '新建报销申请', '/assets': '日均成本', '/imports': '批量导入', '/reports': '报表中心', '/reports/home': '报表中心', '/reports/monthly-summary': '收支统计表', '/reports/expense-distribution': '支出分布图', '/reports/income-distribution': '收入分布图', '/reports/monthly-comparison': '月收支对比表', '/reports/tag-distribution': '标签分布图', '/reports/tag-detail/:tagId': '标签详情',
    '/reports/account-balance-trend': '账户余额趋势', '/transfer': '转账', '/add-transaction': '收入/支出', '/split/new': '交易拆分', '/split/:transactionId': '拆分详情', '/other': '其他交易', '/export': '导出', '/settings': '设置', '/settings/rules': '匹配规则', '/settings/import-templates': '导入模板管理', '/settings/transaction-templates': '快捷模板管理', '/settings/recurring-rules': '周期记账' }

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const NEUTRAL_TRANSACTION_TYPES = new Set([
  'transfer',
  'repayment_credit_card',
  'repayment_loan',
])

const isNeutralTransactionType = (transactionType?: string) =>
  Boolean(transactionType && NEUTRAL_TRANSACTION_TYPES.has(transactionType))

const getTransactionAmountMeta = (transaction: { direction?: string; transaction_type?: string; source_type?: string; include_in_income?: boolean; include_in_expense?: boolean }) => {
  // 🛡️ L: SYSTEM 类型余额调整
  if (transaction.source_type === 'system') {
    // 如果勾选了"计入收支"，按普通收入/支出颜色显示
    if (transaction.include_in_income === true) {
      return { prefix: '+', color: 'var(--accent-green)' }
    }
    if (transaction.include_in_expense === true) {
      return { prefix: '-', color: 'var(--accent-red)' }
    }
    // 未勾选计入收支 → 灰色中性
    return { prefix: transaction.direction === 'in' ? '+' : '-', color: '#999' }
  }
  if (isNeutralTransactionType(transaction.transaction_type)) {
    return { prefix: '', color: 'var(--text-secondary)' }
  }
  if (transaction.direction === 'in' || transaction.transaction_type === 'refund') {
    return { prefix: '+', color: 'var(--accent-green)' }
  }
  return { prefix: '-', color: 'var(--accent-red)' }
}
void getTransactionAmountMeta

const formatMoney = (value?: number | string | null) => `¥${Number(value || 0).toFixed(2)}`

const formatDateLabel = (value?: string | null) => {
  if (!value) return '-'
  return value.slice(0, 10)
}

const formatBucketTitle = (key: string) => {
  if (key === 'matched') return '已匹配'
  if (key === 'missing') return '账单缺失'
  if (key === 'duplicate') return '重复候选'
  if (key === 'unresolved') return '待复核'
  if (key === 'extra') return '账本多出'
  return key
}

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
    if (action === 'income-expense') navigate('/add-transaction')
    else if (action === 'transfer') navigate('/transfer')
    else if (action === 'other') navigate('/other')
  }

  // 根据页面上下文动态生成 FAB 按钮
  const getFabButtons = () => {
    const path = location.pathname
    const buttons: { key: string; label: string; icon: React.ReactNode; action: () => void }[] = []

    // 首页 /dashboard 和交易页 /transactions - 显示 3 个交易入口
    if (path === '/dashboard' || path === '/transactions') {
      buttons.push(
        { key: 'income-expense', label: '收入/支出', icon: <ArrowUpOutlined />, action: () => handleFabClick('income-expense') },
        { key: 'transfer', label: '转账', icon: <SwapOutlined />, action: () => handleFabClick('transfer') },
        { key: 'other', label: '其他', icon: <TagsOutlined />, action: () => handleFabClick('other') }
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

  const hideHeaderPaths = ['/add-transaction', '/transfer', '/other', '/transactions/new', '/transactions/'];
const showHeader = !hideHeaderPaths.some(p => location.pathname.startsWith(p));

return (
    <Layout style={{ minHeight: '100vh' }}>
      {showHeader && (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 100 }}>
        <Button type="text" icon={<MenuOutlined style={{ fontSize: 20 }} />} onClick={() => setDrawerOpen(true)} style={{ marginRight: 16 }} />
        <span style={{ fontSize: 18, fontWeight: 500 }}>{currentTitle}</span>
      </div>)}
      <Drawer
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>个人记账</span>}
        placement="left"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width={DRAWER_WIDTH}
        bodyStyle={{ padding: 0, height: 'calc(100vh - 55px)', overflow: 'hidden' }}
        extra={<Button type="text" icon={<CloseOutlined />} onClick={() => setDrawerOpen(false)} />}
      >
        <div
          style={{
            height: '100vh',
            maxHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          <div style={{ padding: '16px 0', flex: 1 }}>
          <div style={{ padding: '0 24px 16px', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
            <Avatar style={{ backgroundColor: '#1677ff', marginRight: 12 }}>{user?.email?.[0]?.toUpperCase() || 'U'}</Avatar>
            <span>{user?.email || '用户'}</span>
          </div>
          <Menu mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={({ key }) => navigate(key)} style={{ border: 'none' }} />
          </div>
        <div style={{ padding: 16, borderTop: '1px solid #f0f0f0', background: 'var(--bg-card)' }}>
          <Button block onClick={logout} icon={<SettingOutlined />}>退出登录</Button>
        </div>
        </div>
      </Drawer>
      <Layout style={{ marginTop: showHeader ? 56 : 0, marginBottom: 80 }}>
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
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/categories/new" element={<CategoryFormPage />} />
            <Route path="/categories/:id" element={<CategoryEditPage />} />
            <Route path="/tags" element={<Suspense fallback={<LoadingFallback />}><TagManagementPage /></Suspense>} />
            <Route path="/tags/new" element={<TagFormPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/loans/new" element={<LoanFormPage />} />
            <Route path="/imports" element={<Suspense fallback={<LoadingFallback />}><ImportsPageView /></Suspense>} />
            <Route path="/export" element={<Suspense fallback={<LoadingFallback />}><ExportPage /></Suspense>} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/home" element={<Suspense fallback={<LoadingFallback />}><ReportsHomePage /></Suspense>} />
            <Route path="/reports/monthly-summary" element={<Suspense fallback={<LoadingFallback />}><MonthlySummaryPage /></Suspense>} />
            <Route path="/reports/expense-distribution" element={<Suspense fallback={<LoadingFallback />}><ExpenseDistributionPage /></Suspense>} />
            <Route path="/reports/income-distribution" element={<Suspense fallback={<LoadingFallback />}><IncomeDistributionPage /></Suspense>} />
            <Route path="/reports/monthly-comparison" element={<Suspense fallback={<LoadingFallback />}><MonthlyComparisonPage /></Suspense>} />
            <Route path="/reports/tag-distribution" element={<Suspense fallback={<LoadingFallback />}><TagDistributionPage /></Suspense>} />
            <Route path="/reports/tag-detail/:tagId" element={<Suspense fallback={<LoadingFallback />}><TagDetailPage /></Suspense>} />
            <Route path="/reports/account-balance-trend" element={<Suspense fallback={<LoadingFallback />}><AccountBalanceTrendPage /></Suspense>} />
            <Route path="/transfer" element={<Suspense fallback={<LoadingFallback />}><TransferPage /></Suspense>} />
            <Route path="/add-transaction" element={<Suspense fallback={<LoadingFallback />}><AddTransactionPage /></Suspense>} />
            <Route path="/split/new" element={<Suspense fallback={<LoadingFallback />}><SplitFormPage /></Suspense>} />
            <Route path="/split/:transactionId" element={<Suspense fallback={<LoadingFallback />}><SplitDetailPage /></Suspense>} />
            {/* 其他交易 - 导航枢纽页 */}
            <Route path="/other" element={<Suspense fallback={<LoadingFallback />}><OtherHubPage /></Suspense>} />
            <Route path="/other/installment" element={<Suspense fallback={<LoadingFallback />}><OtherTransactionPage initialSubType="installment" /></Suspense>} />
            <Route path="/installments" element={<Suspense fallback={<LoadingFallback />}><InstallmentTasksPage /></Suspense>} />
            <Route path="/installments/new" element={<Suspense fallback={<LoadingFallback />}><InstallmentPage /></Suspense>} />
            <Route path="/installments/:id/edit" element={<Suspense fallback={<LoadingFallback />}><InstallmentPage /></Suspense>} />
            <Route path="/wishlist" element={<Suspense fallback={<LoadingFallback />}><WishlistPage /></Suspense>} />
            <Route path="/budgets" element={<Suspense fallback={<LoadingFallback />}><BudgetsPage /></Suspense>} />
            <Route path="/budgets/new" element={<Suspense fallback={<LoadingFallback />}><BudgetFormPage /></Suspense>} />
            <Route path="/budgets/:id" element={<Suspense fallback={<LoadingFallback />}><BudgetDetailPage /></Suspense>} />
            <Route path="/budgets/:id/edit" element={<Suspense fallback={<LoadingFallback />}><BudgetFormPage /></Suspense>} />
            <Route path="/reimbursements" element={<Suspense fallback={<LoadingFallback />}><ReimbursementsPage /></Suspense>} />
            <Route path="/reimbursements/new" element={<Suspense fallback={<LoadingFallback />}><ReimbursementFormPage /></Suspense>} />
            <Route path="/reimbursements/:id/edit" element={<Suspense fallback={<LoadingFallback />}><ReimbursementFormPage /></Suspense>} />
            <Route path="/assets" element={<Suspense fallback={<LoadingFallback />}><DurableAssetsPage /></Suspense>} />
            <Route path="/other/lend" element={<Suspense fallback={<LoadingFallback />}><OtherTransactionPage initialSubType="lend" /></Suspense>} />
            <Route path="/other/borrow" element={<Suspense fallback={<LoadingFallback />}><OtherTransactionPage initialSubType="borrow" /></Suspense>} />
            <Route path="/other/repay" element={<Suspense fallback={<LoadingFallback />}><OtherTransactionPage initialSubType="repay" /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<LoadingFallback />}><SettingsPageView /></Suspense>} />
            <Route path="/settings/import-templates" element={<Suspense fallback={<LoadingFallback />}><ImportTemplatesPage /></Suspense>} />
            <Route path="/settings/transaction-templates" element={<Suspense fallback={<LoadingFallback />}><TransactionTemplatesPage /></Suspense>} />
            <Route path="/settings/recurring-rules" element={<Suspense fallback={<LoadingFallback />}><RecurringRulesPage /></Suspense>} />
            <Route path="/settings/rules" element={<MatchRulesPage />} />
          </Routes>
        </Content>
      </Layout>
      {/* 动态 FAB：按页面上下文显示不同按钮 */}
      {fabButtons.length > 0 && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 1000 }}>
          {fabMenuOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
              {fabButtons.map(btn => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={btn.action}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      padding: '8px 12px',
                      borderRadius: 999,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {btn.label}
                  </span>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#1677ff',
                      color: '#fff',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
                    }}
                  >
                    {btn.icon}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setFabMenuOpen((open) => !open)}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: 'none',
              background: '#1677ff',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(22,119,255,0.3)',
              fontSize: 22,
              cursor: 'pointer',
            }}
          >
            {fabMenuOpen ? '×' : '+'}
          </button>
        </div>
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
  void loading
  const bookId = user?.default_book_id

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthStr = `${year}年${String(month + 1).padStart(2, '0')}月`

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    const firstDay = formatLocalDate(new Date(year, month, 1))
    const lastDay = formatLocalDate(new Date(year, month + 1, 0))
    
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
      .catch((error) => {
        console.error("Request failed:", error)
      })
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

      <UpcomingBillsWidget />

      {/* 🛡️ L: 信用账户待还列表 */}
      <CreditRepaymentSummary />
    </div>
  )
}

const UpcomingBillsWidget = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [bills, setBills] = useState<RecurringBillRecord[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    apiGet<RecurringBillRecord[]>(`/api/subscriptions/upcoming?book_id=${bookId}&days=30`)
      .then((data) => setBills(Array.isArray(data) ? data : []))
      .catch(() => setBills([]))
      .finally(() => setLoading(false))
  }, [bookId])

  return (
    <div style={{ margin: '0 0 16px', borderRadius: 16, background: 'var(--bg-card)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>即将到期账单</span>
          <Tag color="blue">{bills.length} 条</Tag>
        </div>
        <Button type="link" size="small" onClick={() => navigate('/subscriptions')}>查看全部</Button>
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        {loading ? (
          <div style={{ padding: '8px 0' }}><Spin size="small" /></div>
        ) : bills.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未来 30 天暂无账单" />
        ) : (
          bills.slice(0, 5).map((item, index) => (
            <div
              key={item.id}
              style={{
                padding: '12px 0',
                borderBottom: index < Math.min(bills.length, 5) - 1 ? '1px solid var(--border-color)' : 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{item.name}</span>
                    <Tag color={item.amount_type === 'fixed' ? 'blue' : 'gold'}>
                      {item.amount_type === 'fixed' ? '固定金额' : '可变金额'}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {item.account_name || '未绑定账户'} · {item.cadence_label}
                  </div>
                </div>
                <span style={{ fontWeight: 600 }}>¥{Number(item.amount || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>{item.due_detail}</span>
                <span>{item.days_until_payment === 0 ? '今天付款' : `${item.days_until_payment} 天后付款`} · {item.next_payment_date}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// 🛡️ L: 信用账户待还摘要组件
const CreditRepaymentSummary = () => {
  const { user } = useAuth()
  const [summary, setSummary] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const bookId = user?.default_book_id

  useEffect(() => {
    if (!bookId) return
    setLoading(true)
    setError(false)
    apiGet(`/api/accounts/credit-repayment-summary?book_id=${bookId}`)
      .then((data: any) => {
        setSummary(data || [])
        setLoading(false)
      })
      .catch(() => { 
        setError(true) 
        setLoading(false)
      })
  }, [bookId])

  // 加载中或出错时不显示
  if (loading || error) return null
  if (summary.length === 0) return null

  return (
    <div style={{ margin: '0 0 16px', borderRadius: 16, background: 'var(--bg-card)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
      {/* 折叠标题 */}
      <div 
        onClick={() => setExpanded(!expanded)}
        style={{ 
          padding: '12px 16px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer',
          background: expanded ? 'var(--bg-elevated)' : 'transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>信用账户待还</span>
          <Tag color="orange">{summary.length} 个账户</Tag>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{expanded ? '▲ 收起' : '▼ 展开'}</span>
      </div>

      {/* 折叠内容 */}
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {summary.map((item: any, index: number) => (
            <div 
              key={item.account_id}
              style={{ 
                padding: '12px 0', 
                borderBottom: index < summary.length - 1 ? '1px solid var(--border-color)' : 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{item.account_name}</span>
                <span style={{ 
                  color: item.statement_balance > 0 ? '#fa8c16' : '#52c41a',
                  fontWeight: 600
                }}>
                  {item.statement_balance > 0 ? `¥${Number(item.statement_balance).toFixed(2)}` : '✅ 本期已还清'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>还款日: {item.repayment_date}</span>
                <span style={{ color: item.is_overdue ? '#ff4d4f' : (item.days_until_repayment <= 5 ? '#ff4d4f' : 'inherit') }}>
                  {item.is_overdue ? `已逾期 ${Math.abs(item.days_until_repayment)} 天` : (item.days_until_repayment === 0 ? '今天还款' : `还有 ${item.days_until_repayment} 天`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null)
  const bookId = user?.default_book_id

  const applyDateTransactions = (items: any[]) => {
    setTransactions(items)

    let income = 0
    let expense = 0
    items.forEach((tx: any) => {
      const amt = Number(tx.amount)
      if (isNeutralTransactionType(tx.transaction_type)) return
      if (tx.direction === 'in' || tx.transaction_type === 'refund') income += amt
      else expense += amt
    })
    setSummary({ income, expense })
  }

  useEffect(() => {
    if (!bookId || !date) return
    setLoading(true)
    
    apiGet(`/api/transactions?book_id=${bookId}&date_from=${date}&date_to=${date}&page_size=100`)
      .then(data => {
        applyDateTransactions(data?.items || [])
      })
      .catch((error) => {
        console.error("Request failed:", error)
      })
      .finally(() => setLoading(false))
  }, [bookId, date])

  const formatDate = (d: string) => {
    const [, month, day] = d.split('-')
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
        <TransactionListComponent
          items={transactions}
          loading={loading}
          emptyDescription="当日无记录"
          onItemClick={(item) => {
            setSelectedTransaction(item)
            setDetailOpen(true)
          }}
        />
      </div>

      <TransactionDetailModal
        open={detailOpen}
        transaction={selectedTransaction}
        bookId={bookId}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => {
          if (!bookId || !date) return
          setLoading(true)
          apiGet(`/api/transactions?book_id=${bookId}&date_from=${date}&date_to=${date}&page_size=100`)
            .then(data => applyDateTransactions(data?.items || []))
            .catch((error) => {
              console.error("Request failed:", error)
            })
            .finally(() => setLoading(false))
        }}
      />
    </div>
  )
}
// 🛡️ L: 简化后的 TransactionsPage — 过滤器 + TransactionList + Drawer
const TransactionsPage = () => {
  const { user } = useAuth()
  const bookId = user?.default_book_id

  // 时间筛选状态
  const [yearRange, setYearRange] = useState({ min_year: null as number | null, max_year: null as number | null })
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  // 加载年份范围
  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/transactions/year-range?book_id=${bookId}`)
      .then(res => {
        setYearRange(res || { min_year: null, max_year: null })
        if (res?.max_year) {
          setSelectedYear(res.max_year)
          setSelectedMonth(new Date().getMonth() + 1)
        }
      })
      .catch((error) => {
        console.error("Request failed:", error)
      })
  }, [bookId])

  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null)
  const [listRefreshToken, setListRefreshToken] = useState(0)

  const handleItemClick = (item: any) => {
    setSelectedTransaction(item)
    setDetailOpen(true)
  }

  // 生成年份选项
  const yearOptions = (() => {
    if (!yearRange.min_year || !yearRange.max_year) return []
    const years: number[] = []
    for (let y = yearRange.min_year; y <= yearRange.max_year; y++) years.push(y)
    return years.sort((a, b) => b - a)
  })()

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  return (
    <div>
      {/* 时间筛选器 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 280 }}>
          <Select
            placeholder="选择年份"
            value={selectedYear}
            onChange={v => { setSelectedYear(v); setSelectedMonth(null) }}
            style={{ width: 120 }}
            allowClear
          >
            {yearOptions.map(y => (
              <Select.Option key={y} value={y}>{y}年</Select.Option>
            ))}
          </Select>
          <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto', paddingBottom: 4 }}>
            {months.map(m => (
              <div
                key={m}
                onClick={() => setSelectedMonth(m)}
                style={{
                  minWidth: 40, padding: '6px 12px', borderRadius: 16, textAlign: 'center',
                  cursor: 'pointer',
                  background: selectedMonth === m ? 'var(--accent-red)' : 'var(--bg-elevated)',
                  color: selectedMonth === m ? '#fff' : 'var(--text-primary)',
                  fontSize: 14, transition: 'all 0.2s'
                }}
              >
                {m}月
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 交易列表（独立组件，支持无限滚动） */}
      <TransactionListComponent
        onItemClick={handleItemClick}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        refreshToken={listRefreshToken}
      />

      <TransactionDetailModal
        open={detailOpen}
        transaction={selectedTransaction}
        bookId={bookId}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => setListRefreshToken((value) => value + 1)}
      />
    </div>
  )
}

const TransactionFormPage = () => {
  const { user } = useAuth()
  const { id: transactionId } = useParams()
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
  const isEditMode = Boolean(transactionId)

  const [loadedTx, setLoadedTx] = useState<any>(null)
  const [specialFormLoading, setSpecialFormLoading] = useState(false)
  const [transferInitialValues, setTransferInitialValues] = useState<any>(null)
  
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
    }).catch((error) => {
      console.error("Request failed:", error)
    })
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
          setSelectedTagIds(mapTagNamesToIds(tags as any, tagNames.map(String)))
        }
      } catch (error) {
        console.error("Request failed:", error)
      }
    }
  }, [loadedTx, tags])

  useEffect(() => {
    if (!bookId || !transactionId || !loadedTx || loadedTx.transaction_type !== 'transfer') {
      setTransferInitialValues(null)
      setSpecialFormLoading(false)
      return
    }

    let isCancelled = false
    setSpecialFormLoading(true)
    apiGet(`/api/transactions/transfer/${transactionId}/edit?book_id=${bookId}`)
      .then((context: any) => {
        if (isCancelled) return
        setTransferInitialValues({
          transactionId: context.transaction_id,
          fromAccountId: context.from_account_id,
          toAccountId: context.to_account_id,
          amount: String(context.amount),
          feeAmount: String(context.fee_amount ?? 0),
          feeAccountId: context.fee_account_id ?? '',
          memo: context.note ?? '',
          tagIds: mapTagNamesToIds(tags as any, parseTransactionTagNames(context.tags)),
          occurredAt: toDateInputValue(context.occurred_at),
        })
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error("Request failed:", error)
          message.error('加载转账失败')
        }
      })
      .finally(() => {
        if (!isCancelled) setSpecialFormLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [bookId, loadedTx, tags, transactionId])

  useEffect(() => { 
    const params = new URLSearchParams(location.search)
    if (params.get('type')) setForm(f => ({ ...f, type: params.get('type')! })) 
  }, [location])

  const selectedTagLabels = useMemo(() => {
    return selectedTagIds
      .map((id) => {
        const tag = tags.find((item: any) => item.id === id)
        if (!tag) return ''
        if (!tag.parent_id) return tag.name
        const parent = tags.find((item: any) => item.id === tag.parent_id)
        return parent ? `${parent.name} / ${tag.name}` : tag.name
      })
      .filter(Boolean)
  }, [selectedTagIds, tags])

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
    } catch (error) {
      console.error("Request failed:", error)
    }
    finally { setLoading(false) }
  }

  if (fetching) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  if (isEditMode && loadedTx?.transaction_type === 'transfer') {
    if (specialFormLoading || !transferInitialValues) {
      return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
    }

    return (
      <Suspense fallback={<LoadingFallback />}>
        <TransferPage
          isEditMode
          initialValues={transferInitialValues}
          onCancel={() => navigate('/transactions')}
          onSuccess={() => navigate('/transactions')}
        />
      </Suspense>
    )
  }

  if (isEditMode && loadedTx?.transaction_type === 'repayment_credit_card') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <OtherTransactionPage
          isEditMode
          initialSubType="repay"
          initialValues={{
            transactionId: loadedTx.id,
            subType: 'repay',
            accountId: loadedTx.account_id || '',
            creditCardAccountId: loadedTx.counterparty_account_id || '',
            amount: String(loadedTx.amount ?? ''),
            memo: loadedTx.note || '',
            tagIds: mapTagNamesToIds(tags as any, parseTransactionTagNames(loadedTx.tags)),
            date: toDateInputValue(loadedTx.occurred_at),
          }}
          onCancel={() => navigate('/transactions')}
          onSuccess={() => navigate('/transactions')}
        />
      </Suspense>
    )
  }

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
          <label className={transactionFormLabelClass}>标签</label>
          <TagMultiSelect
            allTags={tags}
            value={selectedTagIds}
            onChange={setSelectedTagIds}
            onTagsUpdated={setTags}
            bookId={bookId}
            placeholder="搜索、选择或创建标签"
          />
          {selectedTagLabels.length > 0 ? (
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              {selectedTagLabels.map((label) => (
                <span
                  key={label}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '999px',
                    background: 'var(--bg-elevated)',
                    padding: '4px 10px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
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
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const bookId = user?.default_book_id
  const navigate = useNavigate()
  const typeLabels: Record<string, string> = { cash: '现金', debit_card: '借记卡', credit_card: '信用卡', loan: '贷款', ewallet: '电子钱包', credit_line: '信用账户' }

  // 判断是否为信用类账户
  const isCreditAccount = (type: string) => ['credit_card', 'credit_line'].includes(type)
  
  // 计算信用账户可用额度
  const getCreditDisplay = (item: any) => {
    if (isCreditAccount(item.account_type)) {
      const limit = Number(item.credit_limit || 0)
      // 🛡️ L: 可用额度 = 信用额度 - 当前欠款(debt_amount) - 冻结金额(frozen_amount)
      const debt = Number(item.debt_amount || 0)
      const frozen = Number(item.frozen_amount || 0)
      const remaining = limit - debt - frozen
      return { remaining, limit, debt, frozen }
    }
    return null
  }

  const loadAccounts = () => {
    if (!bookId) return
    setLoading(true)
    const params = new URLSearchParams({ book_id: bookId })
    if (showArchived) params.set('include_archived', 'true')
    apiGet(`/api/accounts?${params.toString()}`)
      .then(res => setData(Array.isArray(res) ? res : []))
      .catch((error) => { console.error("Request failed:", error) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAccounts() }, [bookId, showArchived])

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch checked={showArchived} onChange={setShowArchived} />
          <span>显示已归档账户</span>
        </div>
        <Button type="primary" onClick={() => navigate('/accounts/new')}>添加账户</Button>
      </div>
      {loading ? <Spin /> : data.length === 0 ? 
        <Empty description="暂无账户" /> : 
        <List 
          grid={{ gutter: 16, column: 2 }} 
          dataSource={[...data].sort((a, b) => Number(a.is_archived) - Number(b.is_archived))} 
          renderItem={item => {
            // 跳过已删除的账户
            if (item.is_deleted) return null
            const creditInfo = getCreditDisplay(item)
            return (
              <List.Item>
                <Card 
                  size="small" 
                  hoverable 
                  style={{ cursor: 'pointer', opacity: item.is_archived ? 0.82 : 1 }}
                  onClick={() => navigate(`/accounts/${item.id}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{item.name}</span>
                        {item.is_archived && <Tag color="default">已归档</Tag>}
                      </div>
                      <div style={{ color: '#999', fontSize: 12 }}>{typeLabels[item.account_type] || item.account_type}</div>
                    </div>
                  </div>
                  {creditInfo ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#52c41a' }}>可用 ¥{creditInfo.remaining.toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>额度: ¥{creditInfo.limit.toFixed(2)}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>¥{Number(item.current_balance || 0).toFixed(2)}</div>
                  )}
                  {item.is_archived && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>最后余额: ¥{Number(item.current_balance || 0).toFixed(2)}</div>}
                  {item.is_archived && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>已归档账户默认不会出现在账户选择器中</div>}
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
  const { user } = useAuth()
  const { id: accountId } = useParams()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  
  const [account, setAccount] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [balanceTrendData, setBalanceTrendData] = useState<any[]>([])
  const [adjustModalVisible, setAdjustModalVisible] = useState(false)
  const [limitModalVisible, setLimitModalVisible] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null)
  const [limitForm] = Form.useForm()
  const [limitSubmitting, setLimitSubmitting] = useState(false)
  const [adjustForm] = Form.useForm()
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)
  const [reconciliationForm] = Form.useForm()
  const [reconciliationCloseForm] = Form.useForm()
  const [reconciliationSessions, setReconciliationSessions] = useState<ReconciliationSessionSummary[]>([])
  const [activeReconciliation, setActiveReconciliation] = useState<ReconciliationSessionDetail | null>(null)
  const [reconciliationDefaults, setReconciliationDefaults] = useState<ReconciliationDefaults | null>(null)
  const [reconciliationLoading, setReconciliationLoading] = useState(false)
  const [reconciliationSubmitting, setReconciliationSubmitting] = useState(false)
  const [reconciliationCreateVisible, setReconciliationCreateVisible] = useState(false)
  const [reconciliationCloseVisible, setReconciliationCloseVisible] = useState(false)
  const [reconciliationEvidenceFile, setReconciliationEvidenceFile] = useState<File | null>(null)
  const [reconciliationBillType, setReconciliationBillType] = useState('alipay')
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const typeLabels: Record<string, string> = { cash: '现金', debit_card: '借记卡', credit_card: '信用卡', loan: '贷款', ewallet: '电子钱包', credit_line: '信用账户' }
  const availableCredit = Number(account?.credit_limit || 0) - Number(account?.debt_amount || 0) - Number(account?.frozen_amount || 0)

  const getMonthRange = (selectedMonth: string) => {
    const [year, mon] = selectedMonth.split('-').map(Number)
    const monthStart = new Date(year, mon - 1, 1)
    const monthEnd = new Date(year, mon, 0)
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    if (selectedMonth > currentMonth) {
      return null
    }

    return {
      startDate: formatLocalDate(monthStart),
      endDate: selectedMonth === currentMonth ? formatLocalDate(now) : formatLocalDate(monthEnd),
      dateFrom: formatLocalDate(monthStart),
      dateTo: formatLocalDate(monthEnd),
    }
  }

  const loadAccount = async () => {
    if (!bookId || !accountId) return

    try {
      const data = await apiGet(`/api/accounts/${accountId}`)
      setAccount(data)
    } catch {
      message.error('加载失败')
      navigate('/accounts')
    }
  }

  const loadBalanceTrend = async (selectedMonth = month) => {
    if (!accountId) return

    const range = getMonthRange(selectedMonth)
    if (!range) {
      setBalanceTrendData([])
      return
    }

    try {
      const data = await apiGet(`/api/accounts/${accountId}/balance-trend?start_date=${range.startDate}&end_date=${range.endDate}`)
      setBalanceTrendData(data || [])
    } catch (error) {
      console.error("Request failed:", error)
      setBalanceTrendData([])
    }
  }

  const loadTransactions = async (selectedMonth = month) => {
    if (!bookId || !accountId || !selectedMonth) return

    const range = getMonthRange(selectedMonth)
    const [year, mon] = selectedMonth.split('-')
    const dateFrom = range?.dateFrom || formatLocalDate(new Date(Number(year), Number(mon) - 1, 1))
    const dateTo = range?.dateTo || formatLocalDate(new Date(Number(year), Number(mon), 0))

    setLoading(true)
    try {
      const res = await apiGet(`/api/transactions?book_id=${bookId}&account_id=${accountId}&date_from=${dateFrom}&date_to=${dateTo}&page=1&page_size=50`)
      setTransactions(res.items || [])
    } catch (error) {
      console.error("Request failed:", error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  const loadReconciliationSession = async (sessionId: string) => {
    const detail = await apiGet<ReconciliationSessionDetail>(`/api/reconciliations/sessions/${sessionId}`)
    setActiveReconciliation(detail)
    return detail
  }

  const loadReconciliationHistory = async (options?: { preserveActive?: boolean }) => {
    if (!accountId) return

    setReconciliationLoading(true)
    try {
      const sessions = await apiGet<ReconciliationSessionSummary[]>(`/api/reconciliations/accounts/${accountId}/sessions`)
      setReconciliationSessions(sessions)

      const preferredId = options?.preserveActive ? activeReconciliation?.id : undefined
      const fallback = sessions.find((session) => session.status === 'in_progress') || sessions[0]
      const nextSession = sessions.find((session) => session.id === preferredId) || fallback

      if (nextSession) {
        await loadReconciliationSession(nextSession.id)
      } else {
        setActiveReconciliation(null)
      }
    } catch (error) {
      console.error('Failed to load reconciliation history', error)
      setReconciliationSessions([])
      setActiveReconciliation(null)
    } finally {
      setReconciliationLoading(false)
    }
  }

  const openCreateReconciliation = async () => {
    if (!accountId) return
    setReconciliationSubmitting(true)
    try {
      const defaults = await apiGet<ReconciliationDefaults>(`/api/reconciliations/accounts/${accountId}/defaults`)
      setReconciliationDefaults(defaults)
      reconciliationForm.setFieldsValue({
        statement_period_start: defaults.statement_period_start,
        statement_period_end: defaults.statement_period_end,
        statement_opening_balance: defaults.statement_opening_balance ?? undefined,
        statement_closing_balance: Number(defaults.suggested_statement_closing_balance || 0),
        notes: '',
      })
      setReconciliationCreateVisible(true)
    } catch (error) {
      console.error('Failed to load reconciliation defaults', error)
      message.error('加载对账默认值失败')
    } finally {
      setReconciliationSubmitting(false)
    }
  }

  const refreshAccountDetail = async (options?: { includeTransactions?: boolean }) => {
    await loadAccount()
    await loadBalanceTrend()
    if (options?.includeTransactions) {
      await loadTransactions()
    }
    await loadReconciliationHistory({ preserveActive: true })
  }

  useEffect(() => {
    loadAccount()
  }, [bookId, accountId])

  useEffect(() => {
    void loadReconciliationHistory()
  }, [accountId])

  useEffect(() => {
    loadBalanceTrend()
  }, [accountId, month])

  useEffect(() => {
    loadTransactions()
  }, [bookId, accountId, month])

  // 判断账户类型
  const isCreditAccount = account?.account_type === 'credit_card' || account?.account_type === 'credit_line'
  const isLoanAccount = account?.account_type === 'loan'
  const isArchived = Boolean(account?.is_archived)
  const trendTitle = isCreditAccount
    ? '每日收盘可用额度趋势'
    : isLoanAccount
      ? '每日收盘剩余本金趋势'
      : '每日收盘余额趋势'
  const trendValueLabel = isCreditAccount
    ? '收盘可用额度'
    : isLoanAccount
      ? '收盘剩余本金'
      : '收盘余额'
  const trendColor = isCreditAccount ? '#52c41a' : isLoanAccount ? '#fa8c16' : '#1890ff'

  const handleTransactionClick = (item: any) => {
    setSelectedTransaction(item)
    setDetailOpen(true)
  }
  
  // 余额调整（合规平账操作）
  const handleBalanceAdjust = async (values: any) => {
    const adjustMode = isCreditAccount ? 'available_credit' : 'balance'
    const currentValue = isCreditAccount 
      ? (Number(account.credit_limit || 0) - Number(account.debt_amount || 0) - Number(account.frozen_amount || 0))  // 当前可用额度
      : Number(account.current_balance || 0)  // 当前余额
    
    if (!values.note || values.note.trim() === '') {
      message.error('调整原因不能为空')
      return
    }
    
    let targetValue: number
    if (values.adjustMode === 'direct') {
      // 直接设置目标值
      targetValue = values.targetValue
    } else {
      // 按差额调整
      targetValue = currentValue + (values.adjustDirection === 'increase' ? values.amount : -values.amount)
    }
    
    setAdjustSubmitting(true)
    try {
      await apiPost('/api/transactions/adjust', {
        book_id: bookId,
        account_id: accountId,
        target_value: targetValue,
        adjust_mode: adjustMode,
        note: values.note,
        is_counted_in_reports: values.countInReports || false
      })
      message.success('调整成功')
      setAdjustModalVisible(false)
      adjustForm.resetFields()
      await refreshAccountDetail({ includeTransactions: true })
    } catch {
      message.error('调整失败')
    } finally {
      setAdjustSubmitting(false)
    }
  }

  const handleCreateReconciliation = async (values: any) => {
    if (!accountId) return

    setReconciliationSubmitting(true)
    try {
      const detail = await apiPost<ReconciliationSessionDetail>('/api/reconciliations/sessions', {
        account_id: accountId,
        statement_period_start: values.statement_period_start,
        statement_period_end: values.statement_period_end,
        statement_opening_balance: values.statement_opening_balance ?? undefined,
        statement_closing_balance: values.statement_closing_balance,
        notes: values.notes || undefined,
      })
      message.success('已创建对账会话')
      setReconciliationCreateVisible(false)
      reconciliationForm.resetFields()
      setActiveReconciliation(detail)
      await loadReconciliationHistory()
    } catch (error) {
      console.error('Failed to create reconciliation', error)
      message.error('创建对账失败')
    } finally {
      setReconciliationSubmitting(false)
    }
  }

  const handleUploadReconciliationEvidence = async () => {
    if (!activeReconciliation?.id || !reconciliationEvidenceFile) {
      message.warning('请选择账单文件')
      return
    }

    const formData = new FormData()
    formData.append('file', reconciliationEvidenceFile)
    formData.append('bill_type', reconciliationBillType)

    setReconciliationSubmitting(true)
    try {
      const detail = await apiUpload<ReconciliationSessionDetail>(
        `/api/reconciliations/sessions/${activeReconciliation.id}/evidence`,
        formData,
      )
      message.success('账单证据已导入')
      setActiveReconciliation(detail)
      setReconciliationEvidenceFile(null)
      await loadReconciliationHistory({ preserveActive: true })
    } catch (error) {
      console.error('Failed to upload reconciliation evidence', error)
      message.error('导入账单证据失败')
    } finally {
      setReconciliationSubmitting(false)
    }
  }

  const markReconciliationReviewed = async () => {
    if (!activeReconciliation?.id) return
    setReconciliationSubmitting(true)
    try {
      const detail = await apiPatch<ReconciliationSessionDetail>(
        `/api/reconciliations/sessions/${activeReconciliation.id}`,
        { review_state: 'reviewed' },
      )
      setActiveReconciliation(detail)
      await loadReconciliationHistory({ preserveActive: true })
      message.success('已标记为已复核')
    } catch (error) {
      console.error('Failed to update reconciliation review state', error)
      message.error('更新复核状态失败')
    } finally {
      setReconciliationSubmitting(false)
    }
  }

  const handleCloseReconciliation = async (values: any) => {
    if (!activeReconciliation?.id) return
    setReconciliationSubmitting(true)
    try {
      const detail = await apiPost<ReconciliationSessionDetail>(
        `/api/reconciliations/sessions/${activeReconciliation.id}/close`,
        {
          action: values.action,
          note: values.note || undefined,
          is_counted_in_reports: values.is_counted_in_reports || false,
        },
      )
      setActiveReconciliation(detail)
      setReconciliationCloseVisible(false)
      reconciliationCloseForm.resetFields()
      await refreshAccountDetail({ includeTransactions: true })
      message.success('对账已完成')
    } catch (error) {
      console.error('Failed to close reconciliation', error)
      message.error('关闭对账失败')
    } finally {
      setReconciliationSubmitting(false)
    }
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
            <div style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{account.name}</span>
              {isArchived && <Tag color="default">已归档</Tag>}
            </div>
            <div style={{ color: '#666', fontSize: 14 }}>{typeLabels[account.account_type] || account.account_type}</div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>¥{Number(account.current_balance || 0).toFixed(2)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isArchived && <Button type="primary" size="small" onClick={() => navigate(`/accounts/${accountId}/edit`)}>编辑</Button>}
            {isArchived ? (
              <Button
                size="small"
                onClick={async () => {
                  try {
                    await apiPost(`/api/accounts/${accountId}/unarchive`)
                    message.success('账户已恢复')
                    await refreshAccountDetail()
                  } catch (error) {
                    console.error("Request failed:", error)
                    message.error('恢复失败')
                  }
                }}
              >
                恢复
              </Button>
            ) : (
              <Button
                size="small"
                onClick={async () => {
                  try {
                    await apiPost(`/api/accounts/${accountId}/archive`)
                    message.success('账户已归档')
                    await refreshAccountDetail()
                  } catch (error) {
                    console.error("Request failed:", error)
                    message.error('归档失败')
                  }
                }}
              >
                归档
              </Button>
            )}
            {!isArchived && (
              <Popconfirm
                title="删除账户"
                description="删除后，该账户的历史交易将被保留并标记为[已删除账户]，此操作不可逆，是否继续？"
                onConfirm={async () => {
                  try {
                    await apiDelete(`/api/accounts/${accountId}`)
                    message.success('账户已删除')
                    navigate('/accounts')
                  } catch (error) {
                    console.error("Request failed:", error)
                    message.error('删除失败')
                  }
                }}
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button danger size="small">删除账户</Button>
              </Popconfirm>
            )}
          </div>
        </div>
        {isArchived && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#fafafa', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>该账户已归档</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              归档账户默认不会出现在账户管理列表或账户选择器中。你仍可在这里查看历史信息，最后余额为 ¥{Number(account.current_balance || 0).toFixed(2)}。
            </div>
          </div>
        )}
        
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>被冻结额度:</span>
              <span style={{ fontWeight: 500 }}>¥{Number(account.frozen_amount || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 600 }}>
              <span style={{ color: 'var(--text-secondary)' }}>可用额度:</span>
              <span style={{ color: 'var(--accent-green)' }}>¥{availableCredit.toFixed(2)}</span>
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
            {/* 🛡️ L: 本期待还 - 信用账户专用 */}
            {account.current_statement_balance !== null && (
              <div style={{ 
                display: 'flex', justifyContent: 'space-between', marginTop: 8, 
                padding: '8px 12px', background: '#fff7e6', borderRadius: 8,
                border: '1px solid #ffd591'
              }}>
                <span style={{ fontWeight: 600 }}>本期待还:</span>
                <span style={{ color: '#fa8c16', fontWeight: 600, fontSize: 16 }}>¥{Number(account.current_statement_balance).toFixed(2)}</span>
              </div>
            )}
            {account.days_until_repayment !== null && account.days_until_repayment > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: '#fa8c16' }}>
                <span>距还款日:</span>
                <span>{account.days_until_repayment} 天</span>
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
            {/* 🛡️ L: 调整额度按钮 */}
            {!isArchived && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <Button size="small" onClick={() => setLimitModalVisible(true)}>调整额度</Button>
              </div>
            )}
          </div>
        )}

        {/* 余额调整 */}
        {!isArchived && (
          <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>余额调整</div>
          <Button size="small" type="primary" onClick={() => setAdjustModalVisible(true)}>调整</Button>
          </div>
        )}
      </Card>

      <Card
        style={{ marginBottom: 16 }}
        title="账户对账"
        extra={
          !isArchived ? (
            <Button type="primary" size="small" onClick={() => { void openCreateReconciliation() }} loading={reconciliationSubmitting}>
              开始对账
            </Button>
          ) : null
        }
      >
        <div style={{ display: 'grid', gap: 16 }}>
          {reconciliationDefaults && (
            <Alert
              type="info"
              showIcon
              message={reconciliationDefaults.is_credit_account ? '默认沿用当前信用账单周期' : '非信用账户可手工调整对账周期与余额锚点'}
              description={`建议周期 ${formatDateLabel(reconciliationDefaults.statement_period_start)} 至 ${formatDateLabel(reconciliationDefaults.statement_period_end)}，当前账本收盘值 ${formatMoney(reconciliationDefaults.ledger_closing_balance)}。`}
            />
          )}

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>历史记录</div>
            {reconciliationLoading ? (
              <Spin />
            ) : reconciliationSessions.length === 0 ? (
              <Empty description="暂无对账记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={reconciliationSessions}
                renderItem={(session) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      paddingInline: 0,
                      background: activeReconciliation?.id === session.id ? 'var(--bg-elevated)' : 'transparent',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                    onClick={() => { void loadReconciliationSession(session.id) }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {formatDateLabel(session.statement_period_start)} - {formatDateLabel(session.statement_period_end)}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            差额 {formatMoney(session.difference_amount)} · 证据 {session.evidence_row_count} 行
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Tag color={session.status === 'balanced' ? 'green' : session.status === 'adjusted' ? 'blue' : session.status === 'discrepant' ? 'orange' : 'gold'}>
                            {session.status}
                          </Tag>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{formatDateLabel(session.created_at)}</div>
                        </div>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </div>

          {activeReconciliation && (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 16, background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>当前对账会话</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    周期 {formatDateLabel(activeReconciliation.statement_period_start)} 至 {formatDateLabel(activeReconciliation.statement_period_end)}
                  </div>
                </div>
                <Space wrap>
                  <Tag color={activeReconciliation.review_state === 'reviewed' ? 'green' : 'gold'}>
                    复核: {activeReconciliation.review_state}
                  </Tag>
                  <Tag color={activeReconciliation.status === 'balanced' ? 'green' : activeReconciliation.status === 'adjusted' ? 'blue' : activeReconciliation.status === 'discrepant' ? 'orange' : 'gold'}>
                    {activeReconciliation.status}
                  </Tag>
                </Space>
              </div>

              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col xs={24} md={12}>
                  <Card size="small">
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>账单收盘余额</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(activeReconciliation.statement_closing_balance)}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      开盘锚点 {activeReconciliation.statement_opening_balance == null ? '未提供' : formatMoney(activeReconciliation.statement_opening_balance)}
                    </div>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small">
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>账本收盘余额</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(activeReconciliation.ledger_closing_balance)}</div>
                    <div style={{ color: Number(activeReconciliation.difference_amount || 0) === 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 12 }}>
                      差额 {formatMoney(activeReconciliation.difference_amount)}
                    </div>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>账单合计</div>
                    <div style={{ fontWeight: 600 }}>{formatMoney(activeReconciliation.statement_total_amount)}</div>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>账本合计</div>
                    <div style={{ fontWeight: 600 }}>{formatMoney(activeReconciliation.ledger_total_amount)}</div>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>账单证据</div>
                    <div style={{ fontWeight: 600 }}>{activeReconciliation.evidence_row_count} 行</div>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>来源</div>
                    <div style={{ fontWeight: 600 }}>{activeReconciliation.evidence_source_type || '仅账本'}</div>
                  </Card>
                </Col>
              </Row>

              {activeReconciliation.status === 'in_progress' && !isArchived && (
                <div style={{ marginBottom: 16, display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Select value={reconciliationBillType} onChange={setReconciliationBillType} style={{ width: 160 }}>
                      <Select.Option value="alipay">支付宝</Select.Option>
                      <Select.Option value="wechat">微信</Select.Option>
                      <Select.Option value="jd">京东</Select.Option>
                      <Select.Option value="alipay_pouch">支付宝亲情卡</Select.Option>
                      <Select.Option value="custom">自定义</Select.Option>
                    </Select>
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(event) => setReconciliationEvidenceFile(event.target.files?.[0] || null)}
                    />
                    <Button onClick={() => { void handleUploadReconciliationEvidence() }} loading={reconciliationSubmitting}>
                      导入账单证据
                    </Button>
                    <Button onClick={() => { void markReconciliationReviewed() }} disabled={activeReconciliation.review_state === 'reviewed'} loading={reconciliationSubmitting}>
                      标记已复核
                    </Button>
                    <Button type="primary" onClick={() => {
                      reconciliationCloseForm.setFieldsValue({
                        action: Number(activeReconciliation.difference_amount || 0) === 0 ? 'balanced' : 'discrepant',
                        note: activeReconciliation.close_note || '',
                        is_counted_in_reports: false,
                      })
                      setReconciliationCloseVisible(true)
                    }}>
                      关闭对账
                    </Button>
                  </div>
                  {activeReconciliation.evidence_filename && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      当前证据文件：{activeReconciliation.evidence_filename}
                    </div>
                  )}
                </div>
              )}

              {activeReconciliation.close_note && (
                <Alert
                  type={activeReconciliation.status === 'discrepant' ? 'warning' : 'success'}
                  showIcon
                  message={`结束方式: ${activeReconciliation.status}`}
                  description={activeReconciliation.close_transaction_id ? `${activeReconciliation.close_note} · 调整流水 ${activeReconciliation.close_transaction_id}` : activeReconciliation.close_note}
                  style={{ marginBottom: 16 }}
                />
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {Object.entries(activeReconciliation.comparison.buckets).map(([key, value]) => (
                  <Tag key={key} color={key === 'matched' ? 'green' : key === 'extra' ? 'orange' : key === 'unresolved' ? 'gold' : key === 'duplicate' ? 'volcano' : 'blue'}>
                    {formatBucketTitle(key)} {value}
                  </Tag>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {([
                  ['matched', activeReconciliation.comparison.matched_rows],
                  ['missing', activeReconciliation.comparison.missing_rows],
                  ['duplicate', activeReconciliation.comparison.duplicate_rows],
                  ['unresolved', activeReconciliation.comparison.unresolved_rows],
                ] as Array<[string, ReconciliationStatementRow[]]>).map(([key, rows]) => (
                  <Card key={key} size="small" title={`${formatBucketTitle(key)} (${(rows as ReconciliationStatementRow[]).length})`}>
                    {rows.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无记录" />
                    ) : (
                      <List
                        size="small"
                        dataSource={rows}
                        renderItem={(row) => (
                          <List.Item>
                            <div style={{ width: '100%' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <div>
                                  <div style={{ fontWeight: 500 }}>
                                    {formatDateLabel(row.occurred_at)} · {row.counterparty || row.description || '账单行'}
                                  </div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                    {row.match_reason || '无匹配说明'}
                                    {row.candidate_transaction_ids.length > 0 ? ` · 候选 ${row.candidate_transaction_ids.length} 条` : ''}
                                  </div>
                                </div>
                                <div style={{ fontWeight: 600 }}>{formatMoney(row.amount)}</div>
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    )}
                  </Card>
                ))}

                <Card size="small" title={`账本多出 (${activeReconciliation.comparison.extra_transactions.length})`}>
                  {activeReconciliation.comparison.extra_transactions.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无记录" />
                  ) : (
                    <List
                      size="small"
                      dataSource={activeReconciliation.comparison.extra_transactions}
                      renderItem={(txn: ReconciliationLedgerTransaction) => (
                        <List.Item>
                          <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                              <div>
                                <div style={{ fontWeight: 500 }}>
                                  {formatDateLabel(txn.occurred_at)} · {txn.merchant || txn.note || txn.transaction_type}
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                                  {txn.external_ref || txn.transaction_type}
                                </div>
                              </div>
                              <div style={{ fontWeight: 600 }}>{formatMoney(txn.amount)}</div>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 余额趋势图 */}
      {balanceTrendData && balanceTrendData.length > 0 ? (
        <Card style={{ marginBottom: 16 }} title={trendTitle}>
          <ReactECharts
            option={{
              tooltip: { 
                trigger: 'axis', 
                formatter: (params: any) => {
                  const point = balanceTrendData[params[0].dataIndex]
                  const value = Number(params[0].value || 0)
                  if (isCreditAccount) {
                    return [
                      `${params[0].name}`,
                      `可用额度: ¥${value.toFixed(2)}`,
                      `已用额度: ¥${Number(point?.debt_amount || 0).toFixed(2)}`,
                      `冻结额度: ¥${Number(point?.frozen_amount || 0).toFixed(2)}`,
                      `总额度: ¥${Number(point?.credit_limit || 0).toFixed(2)}`,
                    ].join('<br/>')
                  }
                  return `${params[0].name}<br/>${trendValueLabel}: ¥${value.toFixed(2)}`
                }
              },
              grid: { left: 60, right: 20, top: 20, bottom: 30 },
              xAxis: { type: 'category', data: balanceTrendData.map((p: any) => p.date), axisLabel: { fontSize: 10 } },
              yAxis: { 
                type: 'value', 
                axisLabel: { formatter: (v: number) => `¥${Math.abs(v).toFixed(0)}` },
                min: (value: any) => {
                  const span = value.max - value.min
                  const padding = Math.max(Math.abs(span) * 0.08, Math.abs(value.min || 0) * 0.05, 1)
                  return value.min - padding
                },
                max: (value: any) => {
                  const span = value.max - value.min
                  const padding = Math.max(Math.abs(span) * 0.08, Math.abs(value.max || 0) * 0.05, 1)
                  return value.max + padding
                },
              },
              series: [{
                type: 'line',
                data: balanceTrendData.map((p: any) => p.balance),
                smooth: true,
                areaStyle: { opacity: 0.2 },
                itemStyle: { color: trendColor },
                lineStyle: { width: 2 },
              }],
            }}
            style={{ height: 220 }}
            opts={{ renderer: 'canvas' }}
          />
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }} title={trendTitle}>
          <Empty description="所选月份暂无趋势数据" />
        </Card>
      )}

      {/* 余额调整弹窗 */}
      <Modal
        title={isCreditAccount ? "调整可用额度" : "余额调整"}
        open={adjustModalVisible}
        onCancel={() => { setAdjustModalVisible(false); adjustForm.resetFields() }}
        footer={null}
      >
        <Form
          form={adjustForm}
          layout="vertical"
          initialValues={{ adjustMode: 'direct', adjustDirection: 'increase' }}
          onFinish={handleBalanceAdjust}
        >
          {isCreditAccount && (
            <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>当前状态</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>总额度</span><span>¥{Number(account?.credit_limit || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>已用额度</span><span style={{ color: '#ff4d4f' }}>¥{Number(account?.debt_amount || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>冻结额度</span><span>¥{Number(account?.frozen_amount || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>可用额度</span><span style={{ color: '#52c41a' }}>¥{availableCredit.toFixed(2)}</span>
              </div>
            </div>
          )}
          
          <Form.Item name="adjustMode" label="调整方式" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="direct">直接设置目标值</Radio.Button>
              <Radio.Button value="delta">按差额调整</Radio.Button>
            </Radio.Group>
          </Form.Item>
          
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.adjustMode !== curr.adjustMode}>
            {({ getFieldValue }) => (
              getFieldValue('adjustMode') === 'direct' ? (
                <Form.Item name="targetValue" label={isCreditAccount ? "目标可用额度" : "目标余额"} rules={[{ required: true, message: '请输入目标值' }]}>
                  <InputNumber 
                    style={{ width: '100%' }} 
                    min={0} 
                    precision={2} 
                    placeholder={isCreditAccount ? `当前: ¥${availableCredit.toFixed(2)}` : `当前: ¥${Number(account?.current_balance || 0).toFixed(2)}`}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item name="adjustDirection" label="调整方向" rules={[{ required: true }]}>
                    <Select>
                      <Select.Option value="increase">增加</Select.Option>
                      <Select.Option value="decrease">减少</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
                    <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="请输入金额" />
                  </Form.Item>
                </>
              )
            )}
          </Form.Item>
          
          <Form.Item name="note" label="调整原因" rules={[{ required: true, message: '调整原因必填' }]}>
            <Input.TextArea rows={2} placeholder="请输入调整原因（如：修正历史遗留误差、补录遗漏交易）" />
          </Form.Item>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Form.Item name="countInReports" valuePropName="checked" noStyle>
              <Switch size="small" />
            </Form.Item>
            <span>此笔调整计入收支报表</span>
            <Tooltip title="默认关闭。大多数平账是为了修正历史遗留误差，不代表当月真实消费。">
              <span style={{ color: '#999', cursor: 'help' }}>❓</span>
            </Tooltip>
          </div>
          
          <Button type="primary" htmlType="submit" block loading={adjustSubmitting}>确认调整</Button>
        </Form>
      </Modal>

      {/* 🛡️ L: 额度调整弹窗 - 纯粹的调额，不生成流水 */}
      <Modal
        title="调整总额度"
        open={limitModalVisible}
        onCancel={() => { setLimitModalVisible(false); limitForm.resetFields() }}
        footer={null}
      >
        <Form
          form={limitForm}
          layout="vertical"
          onFinish={async (values) => {
            setLimitSubmitting(true)
            try {
              await apiPost(`/api/accounts/${accountId}/adjust-limit`, { new_limit: values.new_limit })
              message.success('额度调整成功')
              setLimitModalVisible(false)
              limitForm.resetFields()
              await refreshAccountDetail()
            } catch { message.error('调整失败') } finally {
              setLimitSubmitting(false)
            }
          }}
        >
          <div style={{ padding: '12px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>当前状态</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>总额度</span><span>¥{Number(account?.credit_limit || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>已用额度</span><span style={{ color: '#ff4d4f' }}>¥{Number(account?.debt_amount || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>冻结额度</span><span>¥{Number(account?.frozen_amount || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>可用额度</span><span style={{ color: '#52c41a' }}>¥{availableCredit.toFixed(2)}</span>
              </div>
            </div>
          
          <Form.Item name="new_limit" label="新总额度" rules={[{ required: true, message: '请输入新总额度' }]}>
            <InputNumber 
              style={{ width: '100%' }} 
              min={0} 
              precision={2} 
              placeholder={`当前: ¥${Number(account?.credit_limit || 0).toFixed(2)}`}
            />
          </Form.Item>
          
          <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
            💡 提示：调整总额度只会修改可用额度计算公式中的变量，不会生成任何交易流水。
          </div>
          
          <Button type="primary" htmlType="submit" block loading={limitSubmitting}>确认调整</Button>
        </Form>
      </Modal>

      <Modal
        title="开始账户对账"
        open={reconciliationCreateVisible}
        onCancel={() => {
          setReconciliationCreateVisible(false)
          reconciliationForm.resetFields()
        }}
        footer={null}
      >
        <Form form={reconciliationForm} layout="vertical" onFinish={handleCreateReconciliation}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={isCreditAccount ? '信用账户默认沿用现有账单周期' : '非信用账户可按对账单手工设置周期'}
            description={reconciliationDefaults ? `当前建议账本收盘值 ${formatMoney(reconciliationDefaults.ledger_closing_balance)}` : '创建后可继续导入账单证据并复核差异。'}
          />
          <Form.Item name="statement_period_start" label="账单起始日" rules={[{ required: true, message: '请输入账单起始日' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="statement_period_end" label="账单结束日" rules={[{ required: true, message: '请输入账单结束日' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="statement_opening_balance" label="账单期初余额（可选）">
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="statement_closing_balance" label="账单收盘余额" rules={[{ required: true, message: '请输入账单收盘余额' }]}>
            <InputNumber style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="例如：四月信用卡对账、银行月结单" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={reconciliationSubmitting}>创建对账会话</Button>
        </Form>
      </Modal>

      <Modal
        title="关闭对账"
        open={reconciliationCloseVisible}
        onCancel={() => {
          setReconciliationCloseVisible(false)
          reconciliationCloseForm.resetFields()
        }}
        footer={null}
      >
        <Form form={reconciliationCloseForm} layout="vertical" onFinish={handleCloseReconciliation}>
          <Alert
            type={Number(activeReconciliation?.difference_amount || 0) === 0 ? 'success' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
            message={`当前差额 ${formatMoney(activeReconciliation?.difference_amount)}`}
            description="差额为 0 可直接 balanced；保留差异请选 discrepant；需要补平则选 adjusted，并通过既有余额调整流水落账。"
          />
          <Form.Item name="action" label="结束方式" rules={[{ required: true, message: '请选择结束方式' }]}>
            <Radio.Group>
              <Space direction="vertical">
                <Radio value="balanced">balanced</Radio>
                <Radio value="adjusted">adjusted</Radio>
                <Radio value="discrepant">discrepant</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="note" label="说明">
            <Input.TextArea rows={3} placeholder="记录这次关闭的依据或遗留说明" />
          </Form.Item>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Form.Item name="is_counted_in_reports" valuePropName="checked" noStyle>
              <Switch size="small" />
            </Form.Item>
            <span>如果执行 adjusted，则将调整流水计入收支报表</span>
          </div>
          <Button type="primary" htmlType="submit" block loading={reconciliationSubmitting}>确认关闭</Button>
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
      <TransactionListComponent
        items={transactions}
        loading={loading}
        emptyDescription="该月无流水"
        onItemClick={handleTransactionClick}
      />

      <TransactionDetailModal
        open={detailOpen}
        transaction={selectedTransaction}
        bookId={bookId}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => { void refreshAccountDetail({ includeTransactions: true }) }}
      />
    </div>
  )
}

// 账户编辑页
const AccountEditPage = () => {
  const { user, token } = useAuth()
  const { id: accountId } = useParams()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [accountType, setAccountType] = useState<string>('')
  void accountType
  const [isAssetAccount, setIsAssetAccount] = useState(false)
  const [isCreditAccount, setIsCreditAccount] = useState(false)
  const [isLoanAccount, setIsLoanAccount] = useState(false)

  useEffect(() => {
    if (!bookId || !accountId) return
    
    setFetching(true)
    apiGet(`/api/accounts/${accountId}`)
      .then(acc => {
        if (acc.is_archived) {
          message.info('已归档账户仅支持在详情页查看或恢复')
          navigate(`/accounts/${accountId}`)
          return
        }
        const accType = acc.account_type
        setAccountType(accType)
        setIsAssetAccount(['cash', 'debit_card', 'ewallet'].includes(accType))
        setIsCreditAccount(['credit_card', 'credit_line'].includes(accType))
        setIsLoanAccount(accType === 'loan')
        
        // 延迟设置表单值，确保状态先更新
        setTimeout(() => {
          form.setFieldsValue({
            name: acc.name,
            account_type: accType,
            note: acc.note || '',
            credit_limit: acc.credit_limit,
            billing_day: acc.billing_day,
            billing_day_rule: acc.billing_day_rule || 'current_cycle',
            repayment_day: acc.repayment_day,
            card_last_four: acc.card_last4,
            initial_debt: acc.debt_amount,
            institution: acc.institution_name
          })
        }, 50)
      })
      .catch(err => { 
        console.error('加载账户失败:', err)
        message.error('加载失败: ' + (err.message || '未知错误'))
        navigate('/accounts') 
      })
      .finally(() => setFetching(false))
  }, [bookId, accountId, form])

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
        payload.billing_day_rule = values.billing_day_rule || 'current_cycle'
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      message.success('更新成功')
      navigate(`/accounts/${accountId}`)
    } catch (error) {
      console.error("Request failed:", error)
      message.error('更新失败')
    }
    finally { setLoading(false) }
  }

  if (fetching) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>

  return (
    <Card title="编辑账户">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }, { whitespace: true, message: '账户名称不能为纯空格' }, { validator: (_, value) => value && value.trim().length > 0 ? Promise.resolve() : Promise.reject('账户名称不能为空') }]}><Input /></Form.Item>
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
        {isCreditAccount && (
          <>
            <Form.Item name="billing_day" label="账单日（每月）">
              <InputNumber style={{ width: '100%' }} min={1} max={31} placeholder="1-31" />
            </Form.Item>
            <Form.Item name="billing_day_rule" label="账单日当天交易记入">
              <Radio.Group defaultValue="current_cycle">
                <Radio value="current_cycle">本期账单</Radio>
                <Radio value="next_cycle">下期账单</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="repayment_day" label="还款日（每月）">
              <InputNumber style={{ width: '100%' }} min={1} max={31} placeholder="1-31" />
            </Form.Item>
            <Form.Item name="credit_limit" label="信用额度">
              <InputNumber style={{ width: '100%' }} precision={2} min={0} placeholder="如: 10000" />
            </Form.Item>
          </>
        )}
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

const SubscriptionsPage = () => {
  const { user } = useAuth()
  const bookId = user?.default_book_id
  const [subscriptions, setSubscriptions] = useState<RecurringBillRecord[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringBillRecord | null>(null)
  const [form] = Form.useForm()
  const frequencyUnit = Form.useWatch('frequency_unit', form)

  const openCreateModal = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      amount_type: 'fixed',
      frequency_unit: 'monthly',
      frequency_interval: 1,
      day_of_month: new Date().getDate(),
      due_anchor_date: formatLocalDate(new Date()),
      next_payment_date: formatLocalDate(new Date()),
    })
    setModalOpen(true)
  }

  const loadData = () => {
    if (!bookId) return
    setLoading(true)
    Promise.all([
      apiGet<RecurringBillRecord[]>(`/api/subscriptions?book_id=${bookId}`),
      apiGet(`/api/accounts?book_id=${bookId}`),
    ])
      .then(([subscriptionRes, accountRes]) => {
        setSubscriptions(Array.isArray(subscriptionRes) ? subscriptionRes : [])
        setAccounts(Array.isArray(accountRes) ? accountRes : [])
      })
      .catch((error) => {
        console.error("Request failed:", error)
        setSubscriptions([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [bookId])

  const openEditModal = (item: RecurringBillRecord) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      amount_type: item.amount_type,
      amount: Number(item.amount || 0),
      frequency_unit: item.frequency_unit,
      frequency_interval: item.frequency_interval,
      day_of_month: item.day_of_month ?? undefined,
      due_anchor_date: item.due_anchor_date,
      next_payment_date: item.next_payment_date,
      account_id: item.account_id,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (values: any) => {
    if (!bookId) return
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/subscriptions/${editing.id}?book_id=${bookId}`, values)
        message.success('账单已更新')
      } else {
        await apiPost(`/api/subscriptions?book_id=${bookId}`, values)
        message.success('账单已创建')
      }
      setModalOpen(false)
      form.resetFields()
      loadData()
    } catch (error) {
      console.error("Request failed:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>订阅 / 固定账单中心</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>支持固定金额与可变金额的周期账单</div>
        </div>
        <Button type="primary" onClick={openCreateModal}>新增账单</Button>
      </div>

      {loading ? (
        <Spin />
      ) : subscriptions.length === 0 ? (
        <Empty description="暂无固定账单" />
      ) : (
        <List
          grid={{ gutter: 16, column: 2 }}
          dataSource={subscriptions}
          renderItem={(item) => (
            <List.Item>
              <Card size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{item.name}</span>
                      <Tag color={item.amount_type === 'fixed' ? 'blue' : 'gold'}>
                        {item.amount_type === 'fixed' ? '固定金额' : '可变金额'}
                      </Tag>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>
                      ¥{Number(item.amount || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {item.amount_type === 'fixed' ? '固定金额' : '用于规划的预计金额'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="small" onClick={() => openEditModal(item)}>编辑</Button>
                    <Popconfirm
                      title="删除账单"
                      description="删除后不会保留该固定账单配置，是否继续？"
                      onConfirm={async () => {
                        try {
                          await apiDelete(`/api/subscriptions/${item.id}?book_id=${bookId}`)
                          message.success('账单已删除')
                          loadData()
                        } catch (error) {
                          console.error("Request failed:", error)
                        }
                      }}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button danger size="small">删除</Button>
                    </Popconfirm>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <div>账户: {item.account_name || '未绑定账户'}</div>
                  <div>扣款节奏: {item.cadence_label}</div>
                  <div>到期说明: {item.due_detail}</div>
                  <div>下次付款日: {item.next_payment_date}</div>
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      <Modal
        title={editing ? '编辑固定账单' : '新增固定账单'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditing(null) }}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：房租 / Netflix / 电费" />
          </Form.Item>
          <Form.Item name="amount_type" label="金额类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="fixed">固定金额</Select.Option>
              <Select.Option value="variable">可变金额</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item name="frequency_unit" label="周期单位" rules={[{ required: true, message: '请选择周期单位' }]}>
            <Select onChange={(value) => {
              if (value !== 'monthly') {
                form.setFieldValue('day_of_month', undefined)
              }
            }}>
              <Select.Option value="monthly">每月</Select.Option>
              <Select.Option value="weekly">每周</Select.Option>
              <Select.Option value="yearly">每年</Select.Option>
              <Select.Option value="custom_days">自定义天数</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="frequency_interval" label="周期间隔" rules={[{ required: true, message: '请输入周期间隔' }]}>
            <InputNumber style={{ width: '100%' }} min={1} precision={0} />
          </Form.Item>
          {frequencyUnit === 'monthly' && (
            <Form.Item name="day_of_month" label="每月扣款日" rules={[{ required: true, message: '请选择每月扣款日' }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={31} precision={0} />
            </Form.Item>
          )}
          <Form.Item name="due_anchor_date" label="用户锚点日期" rules={[{ required: true, message: '请选择锚点日期' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="next_payment_date" label="下次付款日" rules={[{ required: true, message: '请选择下次付款日' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="account_id" label="关联账户" rules={[{ required: true, message: '请选择账户' }]}>
            <Select placeholder="选择账户">
              {accounts.map((account: any) => (
                <Select.Option key={account.id} value={account.id}>{account.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            固定金额用于稳定账单；可变金额用于记录预估支出。首页“即将到期账单”会直接复用这里保存的下次付款日。
          </div>
          <Button type="primary" htmlType="submit" block loading={saving}>
            {editing ? '保存修改' : '创建账单'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}

const CategoriesPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()

  // 构建二级结构
  const buildTree = (categories: any[]) => {
    const roots = categories.filter(c => !c.parent_id)
    return roots.map(root => ({
      ...root,
      children: categories.filter(c => c.parent_id === root.id)
    }))
  }

  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/categories?book_id=${bookId}&include_inactive=true`)
      .then(res => setData(res || []))
      .catch((error) => { console.error("Request failed:", error) })
      .finally(() => setLoading(false))
  }, [bookId])

  const categoryTree = buildTree(data)

  const handleDelete = async (categoryId: string) => {
    if (!bookId) return
    try {
      await apiDelete(`/api/categories/${categoryId}?book_id=${bookId}`)
      setData(prev => prev.filter(item => item.id !== categoryId))
      message.success('删除成功')
    } catch (error) {
      console.error("Request failed:", error)
    }
  }

  const renderStatusTags = (item: any) => (
    <Space size={8}>
      <Tag color={item.category_type === 'expense' ? 'red' : 'green'}>
        {item.category_type === 'expense' ? '支出' : '收入'}
      </Tag>
      {!item.is_active && <Tag color="default">已停用</Tag>}
    </Space>
  )

  const renderDeleteButton = (item: any) => (
    <Popconfirm
      title="确认删除该分类？"
      description="如果存在子分类或交易记录引用，将拒绝删除。"
      okText="删除"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      onConfirm={(event) => {
        event?.stopPropagation?.()
        return handleDelete(item.id)
      }}
    >
      <Button
        danger
        type="text"
        icon={<DeleteOutlined />}
        onClick={(event) => event.stopPropagation()}
      >
        删除
      </Button>
    </Popconfirm>
  )

  // 渲染单个分类项（可点击编辑）
  const renderCategory = (item: any, isChild: boolean = false) => (
    <List.Item
      style={{ padding: isChild ? '8px 12px' : '12px 0', cursor: 'pointer', background: isChild ? 'var(--bg-page)' : undefined }}
      onClick={() => navigate(`/categories/${item.id}`)}
      actions={[renderStatusTags(item), renderDeleteButton(item)]}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        <span style={{ fontSize: isChild ? 14 : 16, marginLeft: isChild ? 24 : 0 }}>{item.icon} {item.name}</span>
      </div>
    </List.Item>
  )

  return (
    <div>
      {loading ? <Spin /> : 
        categoryTree.length === 0 ? 
          <Empty description="暂无分类" /> : 
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span>{root.icon} {root.name}</span>
                  <Space size={8}>
                    {renderStatusTags(root)}
                    {renderDeleteButton(root)}
                  </Space>
                </div>
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
  const { user } = useAuth()
  const { id: categoryId } = useParams()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [categories, setCategories] = useState<any[]>([])
  const watchedType = Form.useWatch('category_type', form)

  useEffect(() => {
    if (!bookId || !categoryId) return
    
    // 加载所有分类（用于选择父类）
    apiGet(`/api/categories?book_id=${bookId}&include_inactive=true`)
      .then(res => setCategories(res || []))
      .catch((error) => {
        console.error("Request failed:", error)
      })
    
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

  useEffect(() => {
    const currentParentId = form.getFieldValue('parent_id')
    if (!currentParentId || !watchedType) return
    const selectedParent = categories.find(c => c.id === currentParentId)
    if (selectedParent && selectedParent.category_type !== watchedType) {
      form.setFieldValue('parent_id', undefined)
    }
  }, [categories, watchedType, form])

  const onFinish = async (values: any) => {
    if (!bookId) return
    setLoading(true)
    try {
      // 使用 PATCH 方法统一更新
      await apiPatch(`/api/categories/${categoryId}`, values)
      message.success('更新成功')
      navigate('/categories')
    } catch (error) {
      console.error("Request failed:", error)
    }
    finally { setLoading(false) }
  }

  // 可选的父分类（不能是自己和自己的孩子）
  const availableParents = categories.filter(
    c => c.id !== categoryId && !c.parent_id && c.category_type === watchedType
  )

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
            {availableParents.map(c => (
              <Select.Option key={c.id} value={c.id}>{c.icon} {c.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="icon" label="图标（emoji）"><Input placeholder="如: 🍔" /></Form.Item>
        <Form.Item name="is_active" label="启用状态" valuePropName="checked">
          <Checkbox>启用</Checkbox>
        </Form.Item>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button size="large" style={{ flex: 1 }} onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" size="large" style={{ flex: 1 }} htmlType="submit" loading={loading}>保存</Button>
        </div>
      </Form>
    </Card>
  )
}

const LoansPage = () => {
  const { user } = useAuth()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const bookId = user?.default_book_id
  const navigate = useNavigate()

  
  useEffect(() => { if (!bookId) return; apiGet(`/api/loans?book_id=${bookId}`).then(res => setData(res || [])).catch((error) => { console.error("Request failed:", error) }).finally(() => setLoading(false)) }, [bookId])

  return (
    <div>
      {loading ? <Spin /> : data.length === 0 ? <Empty description="暂无贷款" /> : 
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
  return <StagingImportTable />
}
void ImportsPage

const ReportsPage = () => {
  const navigate = useNavigate()
  
  // Redirect to the new reports home page
  useEffect(() => {
    navigate('/reports/home', { replace: true })
  }, [navigate])
  
  return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
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
      // 使用 accountType 状态变量确保一致性
      const finalAccountType = accountType
      
      // 根据账户类型构建不同的 payload
      const payload: any = {
        name: values.name,
        account_type: finalAccountType,
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
        payload.billing_day_rule = values.billing_day_rule || 'current_cycle'
        payload.repayment_day = values.repayment_day || null
        payload.card_last4 = values.card_last_four || null
        // 信用类账户：将初始欠款通过 opening_balance 传给后端，由后端存入 debt_amount
        payload.opening_balance = values.initial_debt || 0
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
        <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }, { whitespace: true, message: '账户名称不能为纯空格' }, { validator: (_, value) => value && value.trim().length > 0 ? Promise.resolve() : Promise.reject('账户名称不能为空') }]}><Input /></Form.Item>
        <Form.Item name="account_type" label="账户类型" rules={[{ required: true }]}>
          <Select 
            value={accountType}
            onChange={(value) => {
              setAccountType(value as string)
              form.setFieldValue('account_type', value)
            }}
            onSelect={(value) => {
              // 鼠标点击或键盘选择都触发
              setAccountType(value as string)
              form.setFieldValue('account_type', value)
            }}
          >
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
            <Form.Item name="billing_day_rule" label="账单日当天交易记入">
              <Radio.Group defaultValue="current_cycle">
                <Radio value="current_cycle">本期账单</Radio>
                <Radio value="next_cycle">下期账单</Radio>
              </Radio.Group>
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
  const watchedType = Form.useWatch('category_type', form)

  // 加载现有分类（用于选择父类）
  useEffect(() => {
    if (!bookId) return
    apiGet(`/api/categories?book_id=${bookId}&include_inactive=true`)
      .then(res => setCategories(res || []))
      .catch((error) => {
        console.error("Request failed:", error)
      })
  }, [bookId])

  useEffect(() => {
    const currentParentId = form.getFieldValue('parent_id')
    if (!currentParentId || !watchedType) return
    const selectedParent = categories.find(c => c.id === currentParentId)
    if (selectedParent && selectedParent.category_type !== watchedType) {
      form.setFieldValue('parent_id', undefined)
    }
  }, [categories, watchedType, form])

  // 只显示同类型的一级分类作为父类选项
  const parentOptions = categories.filter(c => !c.parent_id && c.category_type === watchedType)

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
    } catch (error) {
      console.error("Request failed:", error)
    }
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
        <div style={{ display: 'flex', gap: 12 }}>
          <Button size="large" style={{ flex: 1 }} onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" size="large" htmlType="submit" style={{ flex: 1 }} loading={loading}>创建</Button>
        </div>
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
      .catch((error) => {
        console.error("Request failed:", error)
      })
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
        <Empty description="暂无标签" /> :
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
      .catch((error) => {
        console.error("Request failed:", error)
      })
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
      
      {/* 🛡️ L: 隐身账单开关 */}
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
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
          💡 隐藏技巧：在备注中输入"隐藏"二字，创建账单时系统自动将其设为隐身
        </div>
      </Card>

      <Card title="关于" style={{ marginBottom: 16 }}>
        <List size="small">
          <List.Item>版本: 1.0.0</List.Item>
          <List.Item>个人记账 Web 应用</List.Item>
        </List>
      </Card>

      <Card title="导入匹配规则" style={{ marginBottom: 16 }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          维护账户、类别、标签的一键匹配规则，并可自动补齐默认标签与常用规则。
        </div>
        <Button type="primary" onClick={() => navigate('/settings/rules')}>
          进入规则维护
        </Button>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="导入模板管理">
            <div style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
              维护账单导入模板，统一文件格式、列映射、日期格式和收支规则。
            </div>
            <Button type="primary" onClick={() => navigate('/settings/import-templates')}>
              进入模板管理
            </Button>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="周期记账">
            <div style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
              配置固定周期的收入或支出规则，集中管理长期重复记账事项。
            </div>
            <Button type="primary" onClick={() => navigate('/settings/recurring-rules')}>
              进入周期记账
            </Button>
          </Card>
        </Col>
      </Row>
      
      <Button type="primary" danger block onClick={logout}>
        退出登录
      </Button>
    </div>
  )
}
void TagsPage
void SettingsPage

const MatchRulesPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const bookId = user?.default_book_id
  const [rules, setRules] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [form, setForm] = useState({ match_value: '', target_type: 'account', target_id: '', priority: 100 })

  const loadData = async () => {
    if (!bookId) return
    setLoading(true)
    try {
      await apiPost(`/api/rules/bootstrap-defaults?book_id=${bookId}`)
      const [ruleList, accountList, categoryList, tagList] = await Promise.all([
        apiGet(`/api/rules?book_id=${bookId}`),
        apiGet(`/api/accounts?book_id=${bookId}`),
        apiGet(`/api/categories?book_id=${bookId}`),
        apiGet(`/api/tags?book_id=${bookId}`),
      ])
      setRules(ruleList || [])
      setAccounts(accountList || [])
      setCategories(categoryList || [])
      setTags(tagList || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [bookId])

  const targetOptions = form.target_type === 'account' ? accounts : []
  const filteredRuleCategories = categories
  const activeRuleTags = tags.filter((item: any) => item?.is_active !== false && item?.is_deleted !== true)

  const renderFormContent = () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <Input
        placeholder="输入匹配词，例如：淘宝、星巴克、招商银行"
        value={form.match_value}
        onChange={e => setForm(prev => ({ ...prev, match_value: e.target.value }))}
      />
      <Select
        value={form.target_type}
        onChange={value => setForm(prev => ({ ...prev, target_type: value, target_id: '' }))}
        options={[
          { value: 'account', label: '账户匹配' },
          { value: 'category', label: '类别匹配' },
          { value: 'tag', label: '标签匹配' },
        ]}
      />
      {form.target_type === 'account' ? (
        <Select
          placeholder="选择替换值"
          value={form.target_id || undefined}
          onChange={value => setForm(prev => ({ ...prev, target_id: value }))}
          options={targetOptions.map((item: any) => ({ value: item.id, label: item.name }))}
          showSearch
          optionFilterProp="label"
        />
      ) : null}
      {form.target_type === 'category' ? (
        <CategorySelector
          categories={filteredRuleCategories as any}
          value={form.target_id}
          onChange={value => setForm(prev => ({ ...prev, target_id: value }))}
          bookId={bookId}
          onCategoriesUpdated={setCategories}
          placeholder="选择分类"
        />
      ) : null}
      {form.target_type === 'tag' ? (
        <TagMultiSelect
          tags={activeRuleTags}
          value={form.target_id ? [form.target_id] : []}
          onChange={([value]) => setForm(prev => ({ ...prev, target_id: value || '' }))}
          bookId={bookId}
          maxSelect={1}
          placeholder="选择标签"
        />
      ) : null}
      <InputNumber
        min={0}
        value={form.priority}
        onChange={value => setForm(prev => ({ ...prev, priority: Number(value || 0) }))}
        style={{ width: '100%' }}
        placeholder="优先级"
      />
    </div>
  )

  const resetForm = () => {
    setEditingId(null)
    setModalVisible(false)
    setForm({ match_value: '', target_type: 'account', target_id: '', priority: 100 })
  }

  const openEditModal = (rule: any) => {
    setEditingId(rule.id)
    setForm({
      match_value: rule.match_value || '',
      target_type: rule.target_type || 'account',
      target_id: rule.target_account_id || rule.target_category_id || rule.target_tag_id || '',
      priority: rule.priority || 0,
    })
    setModalVisible(true)
  }

  const resolveTargetName = (rule: any) => {
    if (rule.target_type === 'account') {
      return accounts.find((item: any) => item.id === rule.target_account_id)?.name || '未知账户'
    }
    if (rule.target_type === 'category') {
      return categories.find((item: any) => item.id === rule.target_category_id)?.name || '未知类别'
    }
    return tags.find((item: any) => item.id === rule.target_tag_id)?.name || '未知标签'
  }

  const handleSubmit = async () => {
    if (!bookId) return
    if (!form.match_value.trim()) {
      message.error('请输入匹配词')
      return
    }
    if (!form.target_id) {
      message.error('请选择替换值')
      return
    }

    const payload: any = {
      rule_name: `${form.match_value.trim()} -> ${form.target_type}`,
      match_field: 'combined',
      match_type: 'contains',
      match_value: form.match_value.trim(),
      target_type: form.target_type,
      priority: form.priority,
    }
    if (form.target_type === 'account') payload.target_account_id = form.target_id
    if (form.target_type === 'category') payload.target_category_id = form.target_id
    if (form.target_type === 'tag') payload.target_tag_id = form.target_id

    setSaving(true)
    try {
      if (editingId) {
        await apiPatch(`/api/rules/${editingId}?book_id=${bookId}`, payload)
        message.success('规则已更新')
      } else {
        await apiPost(`/api/rules?book_id=${bookId}`, payload)
        message.success('规则已创建')
      }
      resetForm()
      loadData()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (rule: any) => {
    openEditModal(rule)
  }

  const toggleRule = async (rule: any) => {
    if (!bookId) return
    try {
      await apiPatch(`/api/rules/${rule.id}?book_id=${bookId}`, { is_active: !rule.is_active })
      message.success(rule.is_active ? '规则已停用' : '规则已启用')
      loadData()
    } catch {
    }
  }

  const removeRule = async (ruleId: string) => {
    if (!bookId) return
    try {
      await apiDelete(`/api/rules/${ruleId}?book_id=${bookId}`)
      message.success('规则已删除')
      if (editingId === ruleId) resetForm()
      loadData()
    } catch {
    }
  }

  return (
    <div>
      {/* 编辑规则对话框 */}
      <Modal
        title={editingId ? '编辑规则' : '新建规则'}
        open={modalVisible}
        onCancel={resetForm}
        footer={null}
      >
        {renderFormContent()}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={resetForm}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSubmit}>
            {editingId ? '保存' : '创建'}
          </Button>
        </div>
      </Modal>

      <Card title="匹配规则维护" extra={<Button onClick={() => navigate('/settings')}>返回设置</Button>} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Input
            placeholder="输入匹配词，例如：淘宝、星巴克、招商银行"
            value={form.match_value}
            onChange={e => setForm(prev => ({ ...prev, match_value: e.target.value }))}
          />
          <Select
            value={form.target_type}
            onChange={value => setForm(prev => ({ ...prev, target_type: value, target_id: '' }))}
            options={[
              { value: 'account', label: '账户匹配' },
              { value: 'category', label: '类别匹配' },
              { value: 'tag', label: '标签匹配' },
            ]}
          />
          {form.target_type === 'account' ? (
            <Select
              placeholder="选择替换值"
              value={form.target_id || undefined}
              onChange={value => setForm(prev => ({ ...prev, target_id: value }))}
              options={targetOptions.map((item: any) => ({ value: item.id, label: item.name }))}
              showSearch
              optionFilterProp="label"
            />
          ) : null}
          {form.target_type === 'category' ? (
            <CategorySelector
              categories={filteredRuleCategories as any}
              value={form.target_id}
              onChange={value => setForm(prev => ({ ...prev, target_id: value }))}
              bookId={bookId}
              onCategoriesUpdated={setCategories}
              placeholder="选择分类"
            />
          ) : null}
          {form.target_type === 'tag' ? (
            <TagMultiSelect
              tags={activeRuleTags}
              value={form.target_id ? [form.target_id] : []}
              onChange={([value]) => setForm(prev => ({ ...prev, target_id: value || '' }))}
              bookId={bookId}
              maxSelect={1}
              placeholder="选择标签"
            />
          ) : null}
          <InputNumber
            min={0}
            value={form.priority}
            onChange={value => setForm(prev => ({ ...prev, priority: Number(value || 0) }))}
            style={{ width: '100%' }}
            placeholder="优先级"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" loading={saving} onClick={handleSubmit}>
              {editingId ? '保存规则' : '新增规则'}
            </Button>
            {editingId && <Button onClick={resetForm}>取消编辑</Button>}
          </div>
        </div>
      </Card>

      <Card title="规则列表">
        {loading ? <Spin /> : (
          <List
            dataSource={rules}
            locale={{ emptyText: '暂无规则' }}
            renderItem={(rule: any) => (
              <List.Item
                actions={[
                  <Button key="edit" type="link" onClick={() => handleEdit(rule)}>编辑</Button>,
                  <Button key="toggle" type="link" onClick={() => toggleRule(rule)}>
                    {rule.is_active ? '停用' : '启用'}
                  </Button>,
                  <Button key="delete" type="link" danger onClick={() => removeRule(rule.id)}>删除</Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{rule.match_value}</span>
                      <Tag color={rule.is_active ? 'green' : 'default'}>{rule.is_active ? '启用中' : '已停用'}</Tag>
                      <Tag>{rule.target_type}</Tag>
                    </div>
                  }
                  description={`替换为：${resolveTargetName(rule)} ｜ 优先级：${rule.priority}`}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
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
