import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: { email: string; password: string; nickname?: string }) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

// Books API
export const booksAPI = {
  list: () => api.get('/books'),
  get: (id: string) => api.get(`/books/${id}`),
  create: (data: any) => api.post('/books', data),
  update: (id: string, data: any) => api.patch(`/books/${id}`, data),
  delete: (id: string) => api.delete(`/books/${id}`),
}

// Accounts API
export const accountsAPI = {
  list: (bookId: string) => api.get(`/accounts?book_id=${bookId}`),
  get: (id: string) => api.get(`/accounts/${id}`),
  create: (data: any) => api.post('/accounts', data),
  update: (id: string, data: any) => api.patch(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
  rebuild: (bookId: string) => api.post('/accounts/rebuild', null, { params: { book_id: bookId } }),
  rebuildOne: (accountId: string) => api.post(`/accounts/rebuild/${accountId}`),
}

// Categories API
export const categoriesAPI = {
  list: (bookId: string) => api.get(`/categories?book_id=${bookId}`),
  tree: (bookId: string) => api.get(`/categories/tree?book_id=${bookId}`),
  get: (id: string) => api.get(`/categories/${id}`),
  create: (data: any) => api.post('/categories', data),
  update: (id: string, data: any) => api.patch(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
}

// Transactions API
export const transactionsAPI = {
  list: (params: any) => api.get('/transactions', { params }),
  get: (id: string) => api.get(`/transactions/${id}`),
  create: (data: any) => api.post('/transactions', data),
  transfer: (data: any) => api.post('/transactions/transfer', data),
  refund: (data: any) => api.post('/transactions/refund', data),
  update: (id: string, data: any) => api.patch(`/transactions/${id}`, data),
  delete: (id: string) => api.delete(`/transactions/${id}`),
}

// Installments API
export const installmentsAPI = {
  list: (bookId: string) => api.get('/installments', { params: { book_id: bookId } }),
  upcoming: (bookId: string) => api.get('/installments/upcoming', { params: { book_id: bookId } }),
  create: (data: any) => api.post('/installments', data),
  settle: (planId: string, accountId: string) => api.post(`/installments/${planId}/settle?account_id=${accountId}`),
}

// Loans API
export const loansAPI = {
  list: (bookId: string) => api.get('/loans', { params: { book_id: bookId } }),
  upcoming: (bookId: string) => api.get('/loans/upcoming', { params: { book_id: bookId } }),
  create: (data: any) => api.post('/loans', data),
  repay: (planId: string, data: any) => api.post(`/loans/${planId}/repay`, data),
}

// Imports API
export const importsAPI = {
  upload: (file: File, sourceName?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (sourceName) formData.append('source_name', sourceName)
    return api.post('/imports/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  list: (bookId: string) => api.get('/imports', { params: { book_id: bookId } }),
  get: (id: string) => api.get(`/imports/${id}`),
  rows: (batchId: string, confirmStatus?: string) => api.get(`/imports/${batchId}/rows`, { params: { confirm_status: confirmStatus } }),
  updateRow: (rowId: string, data: any) => api.patch(`/imports/rows/${rowId}`, data),
  confirm: (batchId: string, data: any) => api.post(`/imports/${batchId}/confirm`, data),
}

// Reports API
export const reportsAPI = {
  overview: (bookId: string, dateFrom?: string, dateTo?: string) => 
    api.get('/reports/overview', { params: { book_id: bookId, date_from: dateFrom, date_to: dateTo } }),
  expenseByCategory: (bookId: string, dateFrom?: string, dateTo?: string) =>
    api.get('/reports/expense-by-category', { params: { book_id: bookId, date_from: dateFrom, date_to: dateTo } }),
  accounts: (bookId: string) => api.get('/reports/accounts', { params: { book_id: bookId } }),
  upcomingDebts: (bookId: string, days?: number) => api.get('/reports/upcoming-debts', { params: { book_id: bookId, days } }),
}

export default api
