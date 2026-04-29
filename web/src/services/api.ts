import { message } from 'antd';

// Get token from localStorage (same as App.tsx)
const getToken = () => localStorage.getItem('token');

function redirectToLogin() {
  window.location.replace('/login');
}

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
  showErrorMessage?: boolean;
}

// Unified API fetch function
export async function apiFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { requireAuth = true, ...fetchOptions } = options;
  
  const headers: HeadersInit = {
    ...fetchOptions.headers,
  };

  if (requireAuth) {
    const token = getToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  return response;
}

// Convenience wrapper that handles JSON and errors
export async function apiJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
  // If body is FormData, let fetch handle it automatically (don't set Content-Type)
  const isFormData = options.body instanceof FormData;
  const { showErrorMessage = true, ...requestOptions } = options;
  
  const response = await apiFetch(url, {
    ...requestOptions,
    headers: isFormData 
      ? requestOptions.headers 
      : { 'Content-Type': 'application/json', ...requestOptions.headers },
  });

  // Only handle auth errors - 401/403
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    if (showErrorMessage) {
      message.error('登录已失效，请重新登录');
    }
    redirectToLogin();
    throw new Error('AUTH_EXPIRED');
  }

  // For other errors (500, 422, 404, etc.), try to parse error message but don't logout
  if (!response.ok) {
    let errorMsg = '请求失败';
    try {
      const errorData = await response.json();
      // 🛡️ L: 正确解析 FastAPI 错误响应，支持字符串、数组、对象
      const detail = errorData.detail;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        // 处理 Pydantic 验证错误数组: [{"loc": [...], "msg": "...", "type": "..."}]
        errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      } else if (detail && typeof detail === 'object') {
        // 处理对象形式的错误: {"message": "..."} 或 {"error": "..."}
        errorMsg = detail.message || detail.error || detail.msg || JSON.stringify(detail);
      } else {
        errorMsg = errorData.message || errorData.error || errorMsg;
      }
      // 将详细信息保存在 response 属性中便于调试
      (window as any).__lastError = errorData;
    } catch {
      errorMsg = `请求失败 (${response.status})`;
    }
    if (showErrorMessage) {
      message.error(errorMsg);
    }
    const err = new Error(errorMsg);
    (err as any).detail = errorMsg;
    throw err;
  }

  return response.json();
}

// GET request
export function apiGet<T = any>(url: string, options?: FetchOptions): Promise<T> {
  return apiJson<T>(url, { ...options, method: 'GET' });
}

// POST request (for JSON body)
export function apiPost<T = any>(url: string, body?: any, options?: FetchOptions): Promise<T> {
  return apiJson<T>(url, { 
    ...options, 
    method: 'POST', 
    body: body ? JSON.stringify(body) : undefined 
  });
}

// PUT request
export function apiPut<T = any>(url: string, body?: any, options?: FetchOptions): Promise<T> {
  return apiJson<T>(url, { 
    ...options, 
    method: 'PUT', 
    body: body ? JSON.stringify(body) : undefined 
  });
}

// DELETE request
export function apiDelete<T = any>(url: string, options?: FetchOptions): Promise<T> {
  return apiJson<T>(url, { ...options, method: 'DELETE' });
}

// PATCH request
export function apiPatch<T = any>(url: string, body?: any, options?: FetchOptions): Promise<T> {
  return apiJson<T>(url, { 
    ...options, 
    method: 'PATCH', 
    body: body ? JSON.stringify(body) : undefined 
  });
}

// Upload request (for FormData - file uploads)
export async function apiUpload<T = any>(url: string, formData: FormData, options?: FetchOptions): Promise<T> {
  const { showErrorMessage = true, ...requestOptions } = options || {};
  const response = await apiFetch(url, {
    ...requestOptions,
    method: 'POST',
    body: formData,
    // Don't set Content-Type for FormData - browser will set with boundary
  });

  // Handle auth errors
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    if (showErrorMessage) {
      message.error('登录已失效，请重新登录');
    }
    redirectToLogin();
    throw new Error('AUTH_EXPIRED');
  }

  if (!response.ok) {
    let errorMsg = '上传失败';
    try {
      const errorData = await response.json();
      const detail = errorData.detail;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      } else if (detail && typeof detail === 'object') {
        errorMsg = detail.message || detail.error || detail.msg || JSON.stringify(detail);
      } else {
        errorMsg = errorData.message || errorData.error || errorMsg;
      }
    } catch {
      errorMsg = `上传失败 (${response.status})`;
    }
    if (showErrorMessage) {
      message.error(errorMsg);
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export async function apiDownload(url: string, options?: FetchOptions): Promise<{ blob: Blob; filename: string | null }> {
  const { showErrorMessage = true, ...requestOptions } = options || {};
  const response = await apiFetch(url, {
    ...requestOptions,
    method: 'GET',
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    if (showErrorMessage) {
      message.error('登录已失效，请重新登录');
    }
    redirectToLogin();
    throw new Error('AUTH_EXPIRED');
  }

  if (!response.ok) {
    let errorMsg = '下载失败';
    try {
      const errorData = await response.json();
      const detail = errorData.detail;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        errorMsg = detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      } else if (detail && typeof detail === 'object') {
        errorMsg = detail.message || detail.error || detail.msg || JSON.stringify(detail);
      } else {
        errorMsg = errorData.message || errorData.error || errorMsg;
      }
    } catch {
      errorMsg = `下载失败 (${response.status})`;
    }
    if (showErrorMessage) {
      message.error(errorMsg);
    }
    throw new Error(errorMsg);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);

  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || null,
  };
}

export interface RecurringBillRecord {
  id: string;
  book_id: string;
  name: string;
  amount_type: 'fixed' | 'variable';
  amount: number | string;
  frequency_unit: 'weekly' | 'monthly' | 'yearly' | 'custom_days';
  frequency_interval: number;
  day_of_month?: number | null;
  due_anchor_date: string;
  next_payment_date: string;
  account_id: string;
  account_name?: string | null;
  cadence_label: string;
  due_detail: string;
  days_until_payment: number;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationBucketSummary {
  matched: number;
  missing: number;
  duplicate: number;
  unresolved: number;
  extra: number;
}

export interface ReconciliationStatementRow {
  id: string;
  row_no: number;
  occurred_at: string;
  direction: string;
  amount: number | string;
  currency: string;
  raw_account_name?: string | null;
  counterparty?: string | null;
  description?: string | null;
  order_no?: string | null;
  merchant_order_no?: string | null;
  external_ref?: string | null;
  match_status: string;
  match_reason?: string | null;
  matched_transaction_id?: string | null;
  candidate_transaction_ids: string[];
  review_status: string;
  review_note?: string | null;
}

export interface ReconciliationLedgerTransaction {
  id: string;
  occurred_at: string;
  direction: string;
  amount: number | string;
  merchant?: string | null;
  note?: string | null;
  external_ref?: string | null;
  transaction_type: string;
  match_reason?: string | null;
}

export interface ReconciliationComparison {
  statement_total_amount: number | string;
  ledger_total_amount: number | string;
  statement_closing_balance: number | string;
  ledger_closing_balance: number | string;
  difference_amount: number | string;
  buckets: ReconciliationBucketSummary;
  matched_rows: ReconciliationStatementRow[];
  missing_rows: ReconciliationStatementRow[];
  duplicate_rows: ReconciliationStatementRow[];
  unresolved_rows: ReconciliationStatementRow[];
  extra_transactions: ReconciliationLedgerTransaction[];
}

export interface ReconciliationSessionSummary {
  id: string;
  account_id: string;
  statement_period_start: string;
  statement_period_end: string;
  statement_closing_balance: number | string;
  ledger_closing_balance: number | string;
  difference_amount: number | string;
  status: string;
  review_state: string;
  evidence_filename?: string | null;
  evidence_row_count: number;
  close_note?: string | null;
  close_transaction_id?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationSessionDetail extends ReconciliationSessionSummary {
  statement_opening_balance?: number | string | null;
  statement_total_amount: number | string;
  ledger_total_amount: number | string;
  evidence_source_type?: string | null;
  evidence_import_batch_id?: string | null;
  notes?: string | null;
  comparison: ReconciliationComparison;
}

export interface ReconciliationDefaults {
  account_id: string;
  statement_period_start: string;
  statement_period_end: string;
  statement_opening_balance?: number | string | null;
  suggested_statement_closing_balance: number | string;
  ledger_closing_balance: number | string;
  difference_amount: number | string;
  is_credit_account: boolean;
}

export interface ExpenseByCategoryParams {
  bookId: string;
  dateFrom: string;
  dateTo: string;
  excludeCategoryIds?: string[];
  excludeTagIds?: string[];
}

export function getExpenseByCategory<T = any>({
  bookId,
  dateFrom,
  dateTo,
  excludeCategoryIds = [],
  excludeTagIds = [],
}: ExpenseByCategoryParams): Promise<T> {
  const params = new URLSearchParams({
    book_id: bookId,
    date_from: dateFrom,
    date_to: dateTo,
  });

  excludeCategoryIds.forEach((id) => params.append('exclude_category_ids', id));
  excludeTagIds.forEach((id) => params.append('exclude_tag_ids', id));

  return apiGet<T>(`/api/reports/expense-by-category?${params.toString()}`);
}
