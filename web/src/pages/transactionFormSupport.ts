import { apiGet } from '../services/api';
import { getHierarchyPathLabel } from '../utils/hierarchySelection';

export interface AccountOption {
  id: string;
  name: string;
  account_type: string;
  current_balance: number;
  credit_limit?: number;
  debt_amount?: number;
  frozen_amount?: number;
  billing_day?: number | string | null;
  statement_date?: number | string | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  category_type: string;
  parent_id?: string;
  icon?: string;
}

export interface TagOption {
  id: string;
  name: string;
  parent_id?: string;
  color?: string;
  is_active?: boolean;
  is_deleted?: boolean;
}

export interface TransferFormInitialValues {
  transactionId?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  feeAmount?: string;
  feeAccountId?: string;
  memo?: string;
  tagIds?: string[];
  occurredAt?: string;
}

export interface OtherTransactionFormInitialValues {
  transactionId?: string;
  subType?: 'installment' | 'lend' | 'borrow' | 'repay';
  accountId?: string;
  creditCardAccountId?: string;
  amount?: string;
  memo?: string;
  tagIds?: string[];
  date?: string;
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
    color: tag.color || '#3b82f6',
  }));
}

export function toOccurredAt(date: string) {
  if (!date) {
    return new Date().toISOString();
  }

  if (date.includes('T')) {
    return new Date(date).toISOString();
  }

  return new Date(`${date}T12:00:00`).toISOString();
}

export function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
}

export function parseTransactionTagNames(tags: unknown): string[] {
  if (!tags) return [];

  if (Array.isArray(tags)) {
    return tags
      .map((tag) => {
        if (typeof tag === 'string') return tag.trim();
        if (tag && typeof tag === 'object' && 'name' in tag && typeof tag.name === 'string') {
          return tag.name.trim();
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return parseTransactionTagNames(parsed);
    } catch {
      return tags
        .split(/[,\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export function mapTagNamesToIds(allTags: TagOption[], tagNames: string[]) {
  return allTags
    .filter((tag) => tagNames.includes(tag.name) || tagNames.includes(tag.id))
    .map((tag) => tag.id);
}

export function getCategoryLabel(categories: CategoryOption[], categoryId: string) {
  return getHierarchyPathLabel(categories, categoryId);
}

export function getAccountOptionLabel(account: AccountOption) {
  if (account.account_type === 'credit_card' || account.account_type === 'credit_line') {
    const availableCredit =
      Number(account.credit_limit || 0) -
      Number(account.debt_amount || 0) -
      Number(account.frozen_amount || 0);

    return `${account.name} (可用额度: ¥${availableCredit.toFixed(2)})`;
  }

  return `${account.name} (余额: ¥${Number(account.current_balance || 0).toFixed(2)})`;
}
