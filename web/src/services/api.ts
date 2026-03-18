import { message } from 'antd';

// Get token from localStorage (same as App.tsx)
const getToken = () => localStorage.getItem('token');

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
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
  const response = await apiFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Only handle auth errors - 401/403
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    message.error('登录已失效，请重新登录');
    // Force page reload to reset state
    window.location.href = '/login';
    throw new Error('AUTH_EXPIRED');
  }

  // For other errors (500, 422, 404, etc.), try to parse error message but don't logout
  if (!response.ok) {
    let errorMsg = '请求失败';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail || errorData.message || errorMsg;
    } catch {
      errorMsg = `请求失败 (${response.status})`;
    }
    message.error(errorMsg);
    throw new Error(errorMsg);
  }

  return response.json();
}

// GET request
export function apiGet<T = any>(url: string, options?: FetchOptions): Promise<T> {
  return apiJson<T>(url, { ...options, method: 'GET' });
}

// POST request
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
