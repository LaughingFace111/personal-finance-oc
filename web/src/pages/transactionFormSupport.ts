import { apiGet } from '../services/api';

export interface AccountOption {
  id: string;
  name: string;
  account_type: string;
  current_balance: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  category_type: string;
  parent_id?: string;
}

export interface TagOption {
  id: string;
  name: string;
}

interface SessionUser {
  default_book_id?: string;
}

export async function getDefaultBookId() {
  const session = await apiGet<SessionUser>('/api/auth/me');
  return session.default_book_id ?? null;
}

export async function loadTransactionFormData(bookId: string) {
  const [accounts, categories, tags] = await Promise.all([
    apiGet<AccountOption[]>(`/api/accounts?book_id=${bookId}`),
    apiGet<CategoryOption[]>(`/api/categories?book_id=${bookId}`),
    apiGet<TagOption[]>(`/api/tags?book_id=${bookId}`),
  ]);

  return { accounts: accounts ?? [], categories: categories ?? [], tags: tags ?? [] };
}

export async function loadTransferFormData(bookId: string) {
  const [accounts, tags] = await Promise.all([
    apiGet<AccountOption[]>(`/api/accounts?book_id=${bookId}`),
    apiGet<TagOption[]>(`/api/tags?book_id=${bookId}`),
  ]);

  return { accounts: accounts ?? [], tags: tags ?? [] };
}

export function toTagOptions(tags: TagOption[]) {
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: '#3b82f6',
  }));
}

export function toOccurredAt(date: string) {
  return new Date(`${date}T12:00:00`).toISOString();
}

export function getCategoryLabel(categories: CategoryOption[], categoryId: string) {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return '';

  if (!category.parent_id) {
    return category.name;
  }

  const parent = categories.find((item) => item.id === category.parent_id);
  return parent ? `${parent.name}-${category.name}` : category.name;
}
