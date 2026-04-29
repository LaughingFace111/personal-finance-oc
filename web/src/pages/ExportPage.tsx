import { Button, Card, Select, message } from 'antd'
import { useEffect, useState } from 'react'
import { useAuth } from '../App'
import { apiDownload, apiGet } from '../services/api'

type AccountOption = {
  id: string
  name: string
}

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const buildDefaultDateRange = () => {
  const now = new Date()
  return {
    start_date: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end_date: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

export default function ExportPage() {
  const { user } = useAuth()
  const bookId = user?.default_book_id || ''
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState(() => ({
    account_id: '',
    ...buildDefaultDateRange(),
  }))

  useEffect(() => {
    if (!bookId) {
      setAccounts([])
      return
    }

    setLoadingAccounts(true)
    apiGet<AccountOption[]>(`/api/accounts?book_id=${bookId}`)
      .then((res) => {
        setAccounts(Array.isArray(res) ? res : [])
      })
      .catch(() => {
        setAccounts([])
      })
      .finally(() => {
        setLoadingAccounts(false)
      })
  }, [bookId])

  const handleExport = async () => {
    if (!bookId) {
      message.error('未找到默认账本')
      return
    }

    const params = new URLSearchParams({ book_id: bookId })
    if (filters.account_id) params.set('account_id', filters.account_id)
    if (filters.start_date) params.set('start_date', filters.start_date)
    if (filters.end_date) params.set('end_date', filters.end_date)

    setExporting(true)
    try {
      const { blob, filename } = await apiDownload(`/api/export/transactions?${params.toString()}`)
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const fallbackFilename = `transactions-${filters.start_date || 'start'}-${filters.end_date || 'end'}.csv`

      link.href = downloadUrl
      link.download = filename || fallbackFilename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
    } catch {
      // apiDownload already handles auth redirects and user-facing error messages.
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card title="导出交易数据">
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13 }}>账户</div>
          <Select
            value={filters.account_id || undefined}
            onChange={(value) => setFilters((prev) => ({ ...prev, account_id: value || '' }))}
            style={{ width: '100%' }}
            placeholder="全部账户"
            allowClear
            loading={loadingAccounts}
          >
            {accounts.map((account) => (
              <Select.Option key={account.id} value={account.id}>{account.name}</Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13 }}>开始日期</div>
          <input
            type="date"
            value={filters.start_date}
            onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9' }}
          />
        </div>

        <div>
          <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13 }}>结束日期</div>
          <input
            type="date"
            value={filters.end_date}
            onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" onClick={handleExport} loading={exporting}>
            导出 CSV
          </Button>
        </div>
      </div>
    </Card>
  )
}
