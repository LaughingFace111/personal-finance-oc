import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tag, message } from 'antd';
import { apiGet, apiPost, apiUpload } from '../services/api';
import { HierarchyPickerModal } from './HierarchyPickerModal';
import { TagMultiSelect } from './TagMultiSelect';
import { getDefaultBookId, TagOption } from '../pages/transactionFormSupport';
import { clearImportDraft, loadImportDraft, saveImportDraft } from '../utils/importDraftStorage';

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  category_type: string;
  parent_id?: string;
  color?: string;
  icon?: string;
};

type SelectTagOption = TagOption & {
  displayLabel: string;
};

type ParsedItem = {
  tempId: string;
  billDate: string;
  direction: 'in' | 'out' | 'internal' | string;
  amount: number;
  rawAccountName?: string | null;
  matchedAccountId?: string | null;
  matchedAccountName?: string | null;
  accountMatchStatus: 'MATCHED' | 'NEED_CONFIRM' | 'UNMATCHED' | string;
  tradeCategory?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryMatchStatus: 'MATCHED' | 'NEED_CONFIRM' | 'UNMATCHED' | string;
  counterparty?: string | null;
  counterpartyAccount?: string | null;
  itemDesc?: string | null;
  orderNo?: string | null;
  merchantOrderNo?: string | null;
  tradeStatus?: string | null;
  rawDirection?: string | null;
  operatorNickname?: string | null;
  operatorName?: string | null;
  tags: string[];
  ignoreReason?: string | null;
  unresolvedReason?: string | null;
  warnings: string[];
};

type ParseResponse = {
  parseId: string;
  items: ParsedItem[];
  metadata?: {
    billType?: string | null;
    availableOperatorNames?: string[];
  };
};

type ConfirmResponse = {
  parseId: string;
  totalItems: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  errorRows: number;
  warnings: string[];
};

function toInputDateTime(iso?: string | null) {
  if (!iso) return '';
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (direct?.[1]) return direct[1];
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromInputDateTime(value: string) {
  if (!value) return '';
  return `${value}T00:00:00`;
}

function formatDirection(direction: string) {
  if (direction === 'in') return '收入';
  if (direction === 'out') return '支出';
  if (direction === 'internal') return '内部';
  return direction || '-';
}

function getCategoryTypeByDirection(direction: string) {
  return direction === 'in' ? 'income' : 'expense';
}

function buildUnresolvedReason(row: ParsedItem) {
  const reasons: string[] = [];
  if (!row.matchedAccountId) reasons.push('账户未匹配');
  if (!row.categoryId) reasons.push('分类未匹配');
  return reasons.length > 0 ? reasons.join('；') : null;
}

function getRowIssues(row: ParsedItem) {
  const issues: string[] = [];
  if (!row.matchedAccountId) issues.push('账户待确认');
  if (!row.categoryId) issues.push('分类待确认');
  if (row.unresolvedReason) issues.push(row.unresolvedReason);
  issues.push(...row.warnings.filter(issue => !issue.includes('疑似退款')));
  return Array.from(new Set(issues.filter(Boolean)));
}

function createSelectedRowIdSet(rows: ParsedItem[]) {
  return new Set(rows.map((row) => row.tempId));
}

function haveSameSelectedRowIds(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

function normalizeSelectedRowIds(rows: ParsedItem[], selectedRowIds: Set<string>) {
  const validRowIds = new Set(rows.map((row) => row.tempId));
  const nextSelectedRowIds = new Set<string>();
  selectedRowIds.forEach((id) => {
    if (validRowIds.has(id)) {
      nextSelectedRowIds.add(id);
    }
  });
  return nextSelectedRowIds;
}

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '16px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '12px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: '13px',
  },
  buttonPrimary: {
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    background: '#1677ff',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  resultBox: {
    background: 'var(--bg-success)',
    border: '1px solid var(--border-success)',
    borderRadius: '8px',
    padding: '12px',
    color: 'var(--text-success)',
    fontSize: '14px',
  },
  label: {
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    marginBottom: '4px',
  },
  helper: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '6px',
    lineHeight: 1.4,
  },
} as const;

// ─── Individual row component (memoized) ─────────────────────────────────────

type StagingImportRowProps = {
  row: ParsedItem;
  isSelected: boolean;
  categoryById: Map<string, Category>;
  accountById: Map<string, Account>;
  accounts: Account[];
  tags: SelectTagOption[];
  tagIdsByName: Map<string, string>;
  tagNamesById: Map<string, string>;
  bookId: string | null;
  onToggleSelect: (tempId: string, selected: boolean) => void;
  onUpdateRow: (tempId: string, patch: Partial<ParsedItem> | ((row: ParsedItem) => Partial<ParsedItem>)) => void;
  onTagsUpdated: (nextTags: SelectTagOption[]) => void;
  onOpenCategoryPicker: (tempId: string) => void;
};

const MemoizedRowTagMultiSelect = React.memo(TagMultiSelect) as typeof TagMultiSelect;

const StagingImportRow = React.memo(
  ({ row, isSelected, categoryById, accountById, accounts, tags, tagIdsByName, tagNamesById, bookId, onToggleSelect, onUpdateRow, onTagsUpdated, onOpenCategoryPicker }: StagingImportRowProps) => {
    const issues = useMemo(() => getRowIssues(row), [row]);
    const hasRefundWarning = useMemo(
      () => row.warnings.some(w => w.includes('疑似退款') || w.includes('is_orphan')),
      [row.warnings]
    );
    const hasIssue = issues.length > 0 || hasRefundWarning;
    const selectedTagIds = useMemo(
      () =>
        row.tags
          .map((tagName) => tagIdsByName.get(tagName))
          .filter((tagId): tagId is string => Boolean(tagId)),
      [row.tags, tagIdsByName],
    );

    const handleDirectionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextDirection = e.target.value;
      const nextCategoryType = getCategoryTypeByDirection(nextDirection);
      const currentCategory = row.categoryId ? categoryById.get(row.categoryId) : null;
      const canKeepCategory =
        currentCategory &&
        (currentCategory.category_type === nextCategoryType ||
          currentCategory.category_type === 'income_expense');

      onUpdateRow(row.tempId, {
        direction: nextDirection,
        categoryId: canKeepCategory ? row.categoryId : null,
        categoryName: canKeepCategory ? row.categoryName : null,
        categoryMatchStatus: canKeepCategory && row.categoryId ? 'MATCHED' : 'UNMATCHED',
      });
    }, [row.tempId, row.categoryId, row.categoryName, categoryById, onUpdateRow]);

    const handleAccountChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextAccountId = e.target.value || null;
      const selected = nextAccountId ? accountById.get(nextAccountId) : null;
      onUpdateRow(row.tempId, {
        matchedAccountId: nextAccountId,
        matchedAccountName: selected?.name || null,
        accountMatchStatus: nextAccountId ? 'MATCHED' : 'UNMATCHED',
      });
    }, [row.tempId, accountById, onUpdateRow]);

    const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateRow(row.tempId, { billDate: fromInputDateTime(e.target.value) });
    }, [row.tempId, onUpdateRow]);

    const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '') {
        onUpdateRow(row.tempId, { amount: 0 });
        return;
      }
      const nextAmount = Number(value);
      if (!Number.isNaN(nextAmount)) {
        onUpdateRow(row.tempId, { amount: nextAmount });
      }
    }, [row.tempId, onUpdateRow]);

    const handleCounterpartyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateRow(row.tempId, { counterparty: e.target.value || null });
    }, [row.tempId, onUpdateRow]);

    const handleDescChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateRow(row.tempId, { itemDesc: e.target.value });
    }, [row.tempId, onUpdateRow]);

    const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      onToggleSelect(row.tempId, e.target.checked);
    }, [row.tempId, onToggleSelect]);

    const handleTagChange = useCallback((nextTagIds: string[]) => {
      const nextTagNames = nextTagIds
        .map((tagId) => tagNamesById.get(String(tagId)))
        .filter((tagName): tagName is string => Boolean(tagName));
      onUpdateRow(row.tempId, { tags: nextTagNames });
    }, [row.tempId, tagNamesById, onUpdateRow]);

    return (
      <div
        style={{
          border: `1px solid ${hasIssue ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-color)'}`,
          borderRadius: '12px',
          padding: '14px',
          background: hasIssue ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.tempId}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {formatDirection(row.direction)}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {row.tradeStatus || '待导入'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '999px',
                background: row.accountMatchStatus === 'MATCHED' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                color: row.accountMatchStatus === 'MATCHED' ? '#15803d' : '#b45309',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              账户 {row.accountMatchStatus}
            </span>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '999px',
                background: row.categoryMatchStatus === 'MATCHED' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                color: row.categoryMatchStatus === 'MATCHED' ? '#15803d' : '#b45309',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              分类 {row.categoryMatchStatus}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          <div>
            <div style={styles.label}>日期</div>
            <input
              style={styles.input}
              type="date"
              value={toInputDateTime(row.billDate)}
              onChange={handleDateChange}
            />
          </div>

          <div>
            <div style={styles.label}>方向</div>
            <select
              style={styles.select}
              value={row.direction}
              onChange={handleDirectionChange}
            >
              <option value="out">支出</option>
              <option value="in">收入</option>
            </select>
          </div>

          <div>
            <div style={styles.label}>金额</div>
            <input
              style={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              value={row.amount ?? ''}
              onChange={handleAmountChange}
            />
          </div>

          <div>
            <div style={styles.label}>账户</div>
            <select
              style={styles.select}
              value={row.matchedAccountId || ''}
              onChange={handleAccountChange}
            >
              <option value="">未匹配</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <div style={styles.helper}>原始账户：{row.rawAccountName || '-'}</div>
          </div>

          <div>
            <div style={styles.label}>类别</div>
            <button
              type="button"
              onClick={() => onOpenCategoryPicker(row.tempId)}
              style={{
                ...styles.select,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span style={{ color: row.categoryId ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {row.categoryId ? categoryById.get(row.categoryId)?.name || '未分类' : '点击选择类别'}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>›</span>
            </button>
            <div style={styles.helper}>原始类别：{row.tradeCategory || '-'}</div>
          </div>

          <div>
            <div style={styles.label}>标签</div>
            <MemoizedRowTagMultiSelect<string>
              tags={tags}
              value={selectedTagIds}
              onChange={handleTagChange}
              bookId={bookId}
              onTagsUpdated={onTagsUpdated}
              placeholder="搜索、选择或创建标签"
            />
          </div>

          <div>
            <div style={styles.label}>交易对方</div>
            <input
              style={styles.input}
              value={row.counterparty || ''}
              placeholder="交易对方"
              onChange={handleCounterpartyChange}
            />
            <div style={styles.helper}>对方账户：{row.counterpartyAccount || '-'}</div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={styles.label}>描述</div>
            <input
              style={styles.input}
              value={row.itemDesc || ''}
              placeholder="描述"
              onChange={handleDescChange}
            />
            <div style={styles.helper}>
              单号：{row.orderNo || '-'}{row.merchantOrderNo ? ` | 商户单号：${row.merchantOrderNo}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: row.direction === 'in' ? '#15803d' : '#b91c1c' }}>
            金额：¥{Number(row.amount || 0).toFixed(2)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            当前账户：{row.matchedAccountName || row.rawAccountName || '-'} | 当前类别：{row.categoryName || row.tradeCategory || '-'}
          </div>
        </div>

        {issues.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {issues.map((issue, idx) => (
              <div key={`${row.tempId}-issue-${idx}`} style={{ fontSize: '12px', color: '#b45309' }}>
                {issue}
              </div>
            ))}
          </div>
        )}

        {hasRefundWarning && (
          <div>
            <Tag color="warning">⚠️ 该订单疑似退款订单/已退款订单，请分辨</Tag>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparator: only re-render when row data or selection actually changes
    return (
      prevProps.row === nextProps.row &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.accounts === nextProps.accounts &&
      prevProps.tags === nextProps.tags &&
      prevProps.tagIdsByName === nextProps.tagIdsByName &&
      prevProps.tagNamesById === nextProps.tagNamesById &&
      prevProps.bookId === nextProps.bookId &&
      prevProps.categoryById === nextProps.categoryById &&
      prevProps.accountById === nextProps.accountById &&
      prevProps.onToggleSelect === nextProps.onToggleSelect &&
      prevProps.onUpdateRow === nextProps.onUpdateRow &&
      prevProps.onTagsUpdated === nextProps.onTagsUpdated &&
      prevProps.onOpenCategoryPicker === nextProps.onOpenCategoryPicker
    );
  }
);

// ─── Main component ───────────────────────────────────────────────────────────

export function StagingImportTable() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const parseId = searchParams.get('parseId') || '';
  const importCompletedRef = React.useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [billType, setBillType] = useState('alipay');
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [matchingTarget, setMatchingTarget] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedItem[]>([]);
  const [loadedParseId, setLoadedParseId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [tags, setTags] = useState<SelectTagOption[]>([]);
  const [parsedBillType, setParsedBillType] = useState<string | null>(null);
  const [availableOperatorNames, setAvailableOperatorNames] = useState<string[]>([]);
  const [excludedOperatorNames, setExcludedOperatorNames] = useState<string[]>([]);

  const syncSelectedRowIds = useCallback((nextRows: ParsedItem[]) => {
    const nextSelectedRowIds = createSelectedRowIdSet(nextRows);
    setSelectedRowIds((prev) => (haveSameSelectedRowIds(prev, nextSelectedRowIds) ? prev : nextSelectedRowIds));
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    apiGet<Account[]>('/api/accounts').then(setAccounts).catch(() => setAccounts([]));
    apiGet<Category[]>('/api/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let active = true;
    getDefaultBookId()
      .then((resolvedBookId) => {
        if (!active) return;
        setBookId(resolvedBookId);
        const url = resolvedBookId ? `/api/tags?book_id=${resolvedBookId}` : '/api/tags';
        return apiGet<TagOption[]>(url);
      })
      .then((tagList) => {
        if (!active) return;
        const list = tagList || [];
        setTags(
          list.map((tag) => {
            const parent = list.find((item) => item.id === tag.parent_id);
            return {
              ...tag,
              displayLabel: parent ? `${parent.name} / ${tag.name}` : tag.name,
            };
          }),
        );
      })
      .catch(() => {
        if (active) setTags([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!parseId) {
      importCompletedRef.current = false;
      setRows([]);
      syncSelectedRowIds([]);
      setLoadedParseId(null);
      setParsedBillType(null);
      setAvailableOperatorNames([]);
      setExcludedOperatorNames([]);
      return;
    }
    if (loadedParseId === parseId) {
      return;
    }
    apiGet<ParseResponse>(`/api/bills/parse/${parseId}`)
      .then(res => {
        const savedDraft = loadImportDraft<ParsedItem>(parseId);
        const nextRows = savedDraft?.rows || res.items || [];
        const nextSelectedRowIds = savedDraft
          ? normalizeSelectedRowIds(nextRows, savedDraft.selectedRowIds)
          : createSelectedRowIdSet(nextRows);

        importCompletedRef.current = false;
        setRows(nextRows);
        setParsedBillType(res.metadata?.billType || null);
        setAvailableOperatorNames(res.metadata?.availableOperatorNames || []);
        setExcludedOperatorNames([]);
        setSelectedRowIds(nextSelectedRowIds);
        setLoadedParseId(parseId);
      })
      .catch(() => {
        setRows([]);
        syncSelectedRowIds([]);
        setParsedBillType(null);
        setAvailableOperatorNames([]);
        setExcludedOperatorNames([]);
      });
  }, [loadedParseId, parseId, syncSelectedRowIds]);

  useEffect(() => {
    if (!parseId || loadedParseId !== parseId || importCompletedRef.current) {
      return;
    }

    saveImportDraft(parseId, {
      rows,
      selectedRowIds,
      timestamp: Date.now(),
    });
  }, [loadedParseId, parseId, rows, selectedRowIds]);

  useEffect(() => {
    if (!parseId) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' || loadedParseId !== parseId || importCompletedRef.current) {
        return;
      }

      saveImportDraft(parseId, {
        rows,
        selectedRowIds,
        timestamp: Date.now(),
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadedParseId, parseId, rows, selectedRowIds]);

  // ── Memoized lookups ─────────────────────────────────────────────────────────

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(category => map.set(category.id, category));
    return map;
  }, [categories]);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach(account => map.set(account.id, account));
    return map;
  }, [accounts]);

  const tagIdsByName = useMemo(() => {
    const map = new Map<string, string>();
    tags.forEach((tag) => map.set(tag.name, String(tag.id)));
    return map;
  }, [tags]);

  const tagNamesById = useMemo(() => {
    const map = new Map<string, string>();
    tags.forEach((tag) => map.set(String(tag.id), tag.name));
    return map;
  }, [tags]);

  const isAlipayPouchParse = parsedBillType === 'alipay_pouch';
  const filteredRows = useMemo(() => {
    if (!isAlipayPouchParse || excludedOperatorNames.length === 0) {
      return rows;
    }
    const excludedSet = new Set(excludedOperatorNames);
    return rows.filter((row) => {
      const operatorName = row.operatorName?.trim();
      return !operatorName || !excludedSet.has(operatorName);
    });
  }, [excludedOperatorNames, isAlipayPouchParse, rows]);

  // ── Row operations ────────────────────────────────────────────────────────────

  const updateRow = useCallback((tempId: string, patch: Partial<ParsedItem> | ((row: ParsedItem) => Partial<ParsedItem>)) => {
    setRows(prev =>
      prev.map(row => {
        if (row.tempId !== tempId) return row;
        const nextPatch = typeof patch === 'function' ? patch(row) : patch;
        const nextRow = { ...row, ...nextPatch };
        nextRow.unresolvedReason = buildUnresolvedReason(nextRow);
        return nextRow;
      })
    );
  }, []);

  const toggleRowSelect = useCallback((tempId: string, selected: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(tempId);
      else next.delete(tempId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((selected: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (selected) {
        filteredRows.forEach((row) => next.add(row.tempId));
      } else {
        filteredRows.forEach((row) => next.delete(row.tempId));
      }
      return next;
    });
  }, [filteredRows]);

  // ── Category picker ──────────────────────────────────────────────────────────

  const openCategoryPicker = useCallback((tempId: string) => {
    setEditingRowId(tempId);
    setCategoryModalOpen(true);
  }, []);

  // ── Import operations ────────────────────────────────────────────────────────

  const onParse = async () => {
    if (!file) {
      message.warning('请先选择账单文件');
      return;
    }
    setParsing(true);
    setConfirmResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('bill_type', billType);
      const res = await apiUpload<ParseResponse>('/api/bills/parse', form);
      const nextRows = res.items || [];
      importCompletedRef.current = false;
      setRows(nextRows);
      setParsedBillType(res.metadata?.billType || null);
      setAvailableOperatorNames(res.metadata?.availableOperatorNames || []);
      setExcludedOperatorNames([]);
      syncSelectedRowIds(nextRows);
      setLoadedParseId(res.parseId);
      navigate(`/imports?parseId=${res.parseId}`);
      message.success(`解析完成，共 ${res.items.length} 条`);
    } catch (err) {
      console.error('Parse error:', err);
      message.error('解析失败，请检查文件格式');
    } finally {
      setParsing(false);
    }
  };

  const onConfirmImport = async () => {
    if (!parseId) {
      message.warning('缺少 parseId，请先解析文件');
      return;
    }
    const visibleSelectedRows = filteredRows.filter(row => selectedRowIds.has(row.tempId));
    if (visibleSelectedRows.length === 0) {
      message.warning('请至少勾选一条记录');
      return;
    }

    // 前端整体校验：必填字段未配置时直接阻断，不允许部分导入
    const incompleteRows = visibleSelectedRows.filter(
      (row) => !row.matchedAccountId || !row.categoryId
    );
    if (incompleteRows.length > 0) {
      message.error(`有 ${incompleteRows.length} 条交易未完成账户或分类配置，无法导入，请先完善后重试`);
      return;
    }

    setConfirming(true);
    try {
      const res = await apiPost<ConfirmResponse>('/api/bills/confirm-import', {
        parseId,
        confirmedItems: visibleSelectedRows,
        excludedOperatorNames,
      });
      importCompletedRef.current = true;
      clearImportDraft(parseId);
      setConfirmResult(res);
      message.success(`导入完成，成功 ${res.importedRows} 条`);
    } catch (err) {
      console.error('Import error:', err);
      message.error('导入失败');
    } finally {
      setConfirming(false);
    }
  };

  const onApplyMatch = async (matchTarget: 'account' | 'category' | 'tag') => {
    if (!parseId) {
      message.warning('缺少 parseId，请先解析文件');
      return;
    }
    setMatchingTarget(matchTarget);
    try {
      const res = await apiPost<ParseResponse>(`/api/bills/parse/${parseId}/match`, {
        matchTarget,
      });
      const nextRows = res.items || [];
      setRows(nextRows);
      setParsedBillType(res.metadata?.billType || null);
      setAvailableOperatorNames(res.metadata?.availableOperatorNames || []);
      syncSelectedRowIds(nextRows);
      setLoadedParseId(parseId);
      message.success(
        matchTarget === 'account'
          ? '账户匹配已完成'
          : matchTarget === 'category'
            ? '类别匹配已完成'
            : '标签匹配已完成'
      );
    } catch (err) {
      console.error('Match error:', err);
      message.error('批量匹配失败');
    } finally {
      setMatchingTarget(null);
    }
  };

  // ── Tag refresh after creation ────────────────────────────────────────────────

  const refreshTags = useCallback(async () => {
    const url = bookId ? `/api/tags?book_id=${bookId}` : '/api/tags';
    const latestTags = await apiGet<TagOption[]>(url).catch(() => []);
    const list = latestTags || [];
    setTags(
      list.map((tag) => {
        const parent = list.find((item) => item.id === tag.parent_id);
        return {
          ...tag,
          displayLabel: parent ? `${parent.name} / ${tag.name}` : tag.name,
        };
      }),
    );
  }, [bookId]);

  const handleTagsUpdated = useCallback((nextTags: SelectTagOption[]) => {
    const normalizedTags = nextTags.map((tag) => {
      const parent = nextTags.find((item) => item.id === tag.parent_id);
      return {
        ...tag,
        displayLabel: parent ? `${parent.name} / ${tag.name}` : tag.name,
      };
    });
    setTags(normalizedTags);
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────

  const selectedVisibleCount = filteredRows.filter((row) => selectedRowIds.has(row.tempId)).length;
  const allSelected = filteredRows.length > 0 && selectedVisibleCount === filteredRows.length;
  const partiallySelected = selectedVisibleCount > 0 && selectedVisibleCount < filteredRows.length;
  const editingRow = useMemo(
    () => (editingRowId ? rows.find((row) => row.tempId === editingRowId) ?? null : null),
    [editingRowId, rows]
  );
  const categoryModalItems = useMemo(() => {
    const direction = editingRow?.direction || 'out';
    const categoryType = getCategoryTypeByDirection(direction);
    return categories.filter(
      (cat) => cat.category_type === categoryType || cat.category_type === 'income_expense'
    );
  }, [categories, editingRow?.direction]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={styles.card}>
        <div style={styles.title}>阶段一：解析账单</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={styles.input}
          />
          <select
            style={{ ...styles.select, width: 'auto' }}
            value={billType}
            onChange={e => setBillType(e.target.value)}
          >
            <option value="alipay">支付宝</option>
            <option value="alipay_pouch">支付宝小荷包</option>
            <option value="wechat">微信</option>
            <option value="jd">京东</option>
            <option value="custom">自定义</option>
          </select>
          <button
            style={{ ...styles.buttonPrimary, ...(parsing || !file ? styles.buttonDisabled : {}) }}
            disabled={parsing || !file}
            onClick={onParse}
          >
            {parsing ? '解析中...' : '开始解析'}
          </button>
          {parseId && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>parseId: {parseId}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={styles.title}>阶段二：缓冲确认（可编辑后再导入）</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                style={{ ...styles.buttonPrimary, background: '#52c41a', ...(confirming ? styles.buttonDisabled : {}) }}
                disabled={confirming}
                onClick={onConfirmImport}
              >
                {confirming ? '导入中...' : '确认导入'}
              </button>
              <button
                style={{ ...styles.buttonPrimary, background: '#0f766e', ...(matchingTarget ? styles.buttonDisabled : {}) }}
                disabled={!!matchingTarget}
                onClick={() => onApplyMatch('account')}
              >
                {matchingTarget === 'account' ? '匹配中...' : '账户匹配'}
              </button>
              <button
                style={{ ...styles.buttonPrimary, background: '#7c3aed', ...(matchingTarget ? styles.buttonDisabled : {}) }}
                disabled={!!matchingTarget}
                onClick={() => onApplyMatch('category')}
              >
                {matchingTarget === 'category' ? '匹配中...' : '类别匹配'}
              </button>
              <button
                style={{ ...styles.buttonPrimary, background: '#c2410c', ...(matchingTarget ? styles.buttonDisabled : {}) }}
                disabled={!!matchingTarget}
                onClick={() => onApplyMatch('tag')}
              >
                {matchingTarget === 'tag' ? '匹配中...' : '标签匹配'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              已选择 {selectedVisibleCount} / {filteredRows.length} 条
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                ref={el => {
                  if (el) el.indeterminate = partiallySelected;
                }}
                checked={allSelected}
                onChange={e => toggleSelectAll(e.target.checked)}
              />
              全选 / 取消全选
            </label>
          </div>

          {isAlipayPouchParse && availableOperatorNames.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={styles.label}>排除操作人姓名</div>
              <select
                multiple
                value={excludedOperatorNames}
                onChange={(e) => {
                  const nextValues = Array.from(e.target.selectedOptions, (option) => option.value);
                  setExcludedOperatorNames(nextValues);
                }}
                style={{ ...styles.select, minHeight: '96px' }}
              >
                {availableOperatorNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div style={styles.helper}>
                仅对“支付宝小荷包”生效。选中的操作人记录会从当前预览中排除，并在最终导入时由后端跳过；空白操作人不会被默认排除。
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredRows.map(row => (
              <StagingImportRow
                key={row.tempId}
                row={row}
                isSelected={selectedRowIds.has(row.tempId)}
                categoryById={categoryById}
                accountById={accountById}
                accounts={accounts}
                tags={tags}
                tagIdsByName={tagIdsByName}
                tagNamesById={tagNamesById}
                bookId={bookId}
                onToggleSelect={toggleRowSelect}
                onUpdateRow={updateRow}
                onTagsUpdated={handleTagsUpdated}
                onOpenCategoryPicker={openCategoryPicker}
              />
            ))}
          </div>
        </div>
      )}

      {confirmResult && (
        <div style={styles.resultBox}>
          导入结果: 成功 {confirmResult.importedRows}，重复 {confirmResult.duplicateRows}，跳过 {confirmResult.skippedRows}，失败 {confirmResult.errorRows}
        </div>
      )}

      <HierarchyPickerModal
        open={categoryModalOpen}
        title="选择类别"
        items={categoryModalItems}
        value={editingRow?.categoryId || ''}
        emptyText="暂无可选类别"
        bookId={bookId}
        enableCreate={Boolean(bookId)}
        createButtonText="[+ 新建分类]"
        onItemsUpdated={(nextItems) =>
          setCategories((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            (nextItems as Category[]).forEach((item) => merged.set(item.id, item));
            return Array.from(merged.values());
          })
        }
        onCancel={() => {
          setCategoryModalOpen(false);
          setEditingRowId(null);
        }}
        onConfirm={(nextValue) => {
          if (editingRowId) {
            const nextCategoryId = typeof nextValue === 'string' ? nextValue : '';
            const selected = nextCategoryId ? categoryById.get(nextCategoryId) : null;
            updateRow(editingRowId, {
              categoryId: nextCategoryId || null,
              categoryName: selected?.name || null,
              categoryMatchStatus: nextCategoryId ? 'MATCHED' : 'UNMATCHED',
            });
          }
          setCategoryModalOpen(false);
          setEditingRowId(null);
        }}
      />

    </div>
  );
}
