import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Select, Tag, message } from 'antd';
import { apiGet, apiPost, apiUpload } from '../services/api';
import { TagCreateModal } from './TagCreateModal';
import { HierarchyPickerModal } from './HierarchyPickerModal';
import { getDefaultBookId, TagOption } from '../pages/transactionFormSupport';

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
  category_type: string;
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
  tags: string[];
  ignoreReason?: string | null;
  unresolvedReason?: string | null;
  warnings: string[];
};

type ParseResponse = {
  parseId: string;
  items: ParsedItem[];
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
  selectControl: {
    width: '100%',
  } satisfies CSSProperties,
} as const;

export function StagingImportTable() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const parseId = searchParams.get('parseId') || '';

  const [file, setFile] = useState<File | null>(null);
  const [billType, setBillType] = useState('alipay');
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [matchingTarget, setMatchingTarget] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedItem[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [tags, setTags] = useState<SelectTagOption[]>([]);
  const [tagSearchValues, setTagSearchValues] = useState<Record<string, string>>({});
  const [tagCreateState, setTagCreateState] = useState<{ rowId: string; name: string } | null>(null);

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
      setRows([]);
      return;
    }
    apiGet<ParseResponse>(`/api/bills/parse/${parseId}`)
      .then(res => setRows(res.items || []))
      .catch(() => setRows([]));
  }, [parseId]);

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

  const tagByName = useMemo(() => {
    const map = new Map<string, SelectTagOption>();
    tags.forEach((tag) => map.set(tag.name, tag));
    return map;
  }, [tags]);

  const rowIdKey = useMemo(() => rows.map(row => row.tempId).join('|'), [rows]);

  useEffect(() => {
    setSelectedRowIds(new Set(rows.map(row => row.tempId)));
  }, [rowIdKey]);

  const updateRow = (tempId: string, patch: Partial<ParsedItem> | ((row: ParsedItem) => Partial<ParsedItem>)) => {
    setRows(prev =>
      prev.map(row => {
        if (row.tempId !== tempId) return row;
        const nextPatch = typeof patch === 'function' ? patch(row) : patch;
        const nextRow = { ...row, ...nextPatch };
        nextRow.unresolvedReason = buildUnresolvedReason(nextRow);
        return nextRow;
      })
    );
  };

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
      setRows(res.items || []);
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
    const selectedRows = rows.filter(row => selectedRowIds.has(row.tempId));
    if (selectedRows.length === 0) {
      message.warning('请至少勾选一条记录');
      return;
    }

    setConfirming(true);
    try {
      const res = await apiPost<ConfirmResponse>('/api/bills/confirm-import', {
        parseId,
        confirmedItems: selectedRows,
      });
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
      setRows(res.items || []);
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

  const selectedCount = selectedRowIds.size;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const partiallySelected = selectedCount > 0 && selectedCount < rows.length;

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
              已选择 {selectedCount} / {rows.length} 条
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                ref={el => {
                  if (el) el.indeterminate = partiallySelected;
                }}
                checked={allSelected}
                onChange={e => {
                  setSelectedRowIds(e.target.checked ? new Set(rows.map(row => row.tempId)) : new Set());
                }}
              />
              全选 / 取消全选
            </label>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {rows.map(row => {
              const issues = getRowIssues(row);
              const hasRefundWarning = row.warnings.some(
                warning => warning.includes('疑似退款') || warning.includes('is_orphan'),
              );
              const hasIssue = issues.length > 0 || hasRefundWarning;
              const tagSearchValue = tagSearchValues[row.tempId] || '';
              const filteredTagOptions = tags.filter((tag) =>
                tag.displayLabel.toLowerCase().includes(tagSearchValue.toLowerCase()) ||
                tag.name.toLowerCase().includes(tagSearchValue.toLowerCase()),
              );

              return (
                <div
                  key={row.tempId}
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
                        checked={selectedRowIds.has(row.tempId)}
                        onChange={e => {
                          setSelectedRowIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(row.tempId);
                            else next.delete(row.tempId);
                            return next;
                          });
                        }}
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
                        onChange={e => updateRow(row.tempId, { billDate: fromInputDateTime(e.target.value) })}
                      />
                    </div>

                    <div>
                      <div style={styles.label}>方向</div>
                      <select
                        style={styles.select}
                        value={row.direction}
                        onChange={e =>
                          updateRow(row.tempId, currentRow => {
                            const nextDirection = e.target.value;
                            const nextCategoryType = getCategoryTypeByDirection(nextDirection);
                            const currentCategory = currentRow.categoryId ? categoryById.get(currentRow.categoryId) : null;
                            const canKeepCategory =
                              currentCategory &&
                              (currentCategory.category_type === nextCategoryType ||
                                currentCategory.category_type === 'income_expense');

                            return {
                              direction: nextDirection,
                              categoryId: canKeepCategory ? currentRow.categoryId : null,
                              categoryName: canKeepCategory ? currentRow.categoryName : null,
                              categoryMatchStatus: canKeepCategory && currentRow.categoryId ? 'MATCHED' : 'UNMATCHED',
                            };
                          })
                        }
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
                        onChange={e => {
                          const value = e.target.value;
                          if (value === '') {
                            updateRow(row.tempId, { amount: 0 });
                            return;
                          }
                          const nextAmount = Number(value);
                          if (!Number.isNaN(nextAmount)) {
                            updateRow(row.tempId, { amount: nextAmount });
                          }
                        }}
                      />
                    </div>

                    <div>
                      <div style={styles.label}>账户</div>
                      <select
                        style={styles.select}
                        value={row.matchedAccountId || ''}
                        onChange={e => {
                          const nextAccountId = e.target.value || null;
                          const selected = nextAccountId ? accountById.get(nextAccountId) : null;
                          updateRow(row.tempId, {
                            matchedAccountId: nextAccountId,
                            matchedAccountName: selected?.name || null,
                            accountMatchStatus: nextAccountId ? 'MATCHED' : 'UNMATCHED',
                          });
                        }}
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
                      <div
                        style={styles.select}
                        onClick={() => {
                          setEditingRowId(row.tempId);
                          setCategoryModalOpen(true);
                        }}
                      >
                        {row.categoryId ? categoryById.get(row.categoryId)?.name || '未分类' : '点击选择类别'}
                      </div>
                      <div style={styles.helper}>原始类别：{row.tradeCategory || '-'}</div>
                    </div>

                    <div>
                      <div style={styles.label}>标签</div>
                      <Select
                        mode="multiple"
                        showSearch
                        value={row.tags || []}
                        searchValue={tagSearchValue}
                        placeholder="搜索、选择或创建标签"
                        style={styles.selectControl}
                        optionFilterProp="label"
                        filterOption={false}
                        onSearch={(value) =>
                          setTagSearchValues((current) => ({ ...current, [row.tempId]: value }))
                        }
                        onChange={(value) => updateRow(row.tempId, { tags: value.map(String) })}
                        onBlur={() =>
                          setTagSearchValues((current) => ({ ...current, [row.tempId]: '' }))
                        }
                        options={filteredTagOptions.map((tag) => ({
                          value: tag.name,
                          label: tag.displayLabel,
                        }))}
                        maxTagCount="responsive"
                        dropdownRender={(menu) => (
                          <div>
                            {menu}
                            <div
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() =>
                                setTagCreateState({
                                  rowId: row.tempId,
                                  name: tagSearchValue.trim(),
                                })
                              }
                              style={{
                                borderTop: '1px solid var(--border-light)',
                                padding: '10px 12px',
                                color: 'var(--accent-color)',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                              }}
                            >
                              添加标签
                              {tagSearchValue.trim() ? ` “${tagSearchValue.trim()}”` : ''}
                            </div>
                          </div>
                        )}
                        tagRender={({ value, closable, onClose }) => {
                          const tagName = String(value);
                          const tag = tagByName.get(tagName);
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)',
                                padding: '4px 10px',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                marginInlineEnd: '6px',
                                marginBlock: '2px',
                              }}
                            >
                              {tag?.displayLabel || tagName}
                              {closable ? (
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={onClose}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--text-tertiary)',
                                    cursor: 'pointer',
                                    padding: 0,
                                    lineHeight: 1,
                                  }}
                                >
                                  ×
                                </button>
                              ) : null}
                            </span>
                          );
                        }}
                      />
                    </div>

                    <div>
                      <div style={styles.label}>交易对方</div>
                      <input
                        style={styles.input}
                        value={row.counterparty || ''}
                        placeholder="交易对方"
                        onChange={e => updateRow(row.tempId, { counterparty: e.target.value || null })}
                      />
                      <div style={styles.helper}>对方账户：{row.counterpartyAccount || '-'}</div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={styles.label}>描述</div>
                      <input
                        style={styles.input}
                        value={row.itemDesc || ''}
                        placeholder="描述"
                        onChange={e => updateRow(row.tempId, { itemDesc: e.target.value })}
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
            })}
          </div>
        </div>
      )}

      {confirmResult && (
        <div style={styles.resultBox}>
          导入结果: 成功 {confirmResult.importedRows}，重复 {confirmResult.duplicateRows}，跳过 {confirmResult.skippedRows}，失败 {confirmResult.errorRows}
        </div>
      )}

      <TagCreateModal
        open={!!tagCreateState}
        bookId={bookId}
        initialName={tagCreateState?.name || ''}
        onCancel={() => setTagCreateState(null)}
        onCreated={async (createdTag) => {
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
          if (tagCreateState) {
            updateRow(tagCreateState.rowId, (currentRow) => ({
              tags: currentRow.tags.includes(createdTag.name)
                ? currentRow.tags
                : [...currentRow.tags, createdTag.name],
            }));
            setTagSearchValues((current) => ({ ...current, [tagCreateState.rowId]: '' }));
          }
          setTagCreateState(null);
        }}
      />

      <HierarchyPickerModal
        open={categoryModalOpen}
        title="选择类别"
        items={(() => {
          const editingRow = editingRowId ? rows.find(r => r.tempId === editingRowId) : null;
          const direction = editingRow?.direction || 'out';
          const categoryType = getCategoryTypeByDirection(direction);
          return categories.filter(cat => cat.category_type === categoryType || cat.category_type === 'income_expense');
        })()}
        value={editingRowId ? rows.find(r => r.tempId === editingRowId)?.categoryId || '' : ''}
        emptyText="暂无可选类别"
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
