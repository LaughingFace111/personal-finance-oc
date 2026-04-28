import { Modal } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TagCreateModal } from './TagCreateModal';
import { apiGet } from '../services/api';
import { getHierarchyPathLabel } from '../utils/hierarchySelection';

type TagId = string | number;

type TagItem<T extends TagId> = {
  id: T;
  name: string;
  color?: string;
  parent_id?: T | string;
  usage_count?: number;
  is_active?: boolean;
  is_deleted?: boolean;
};

interface TagMultiSelectProps<T extends TagId> {
  tags?: TagItem<T>[];
  value: T[];
  onChange: (nextValue: T[]) => void;
  bookId?: string | null;
  onTagsChange?: (nextTags: TagItem<T>[]) => void;
  maxSelect?: number;
  disabled?: boolean;
  allTags?: TagItem<T>[];
  onTagsUpdated?: (nextTags: TagItem<T>[]) => void;
  placeholder?: string;
}

const DEFAULT_TAG_COLOR = '#3b82f6';

export function hexToRgba(color: string | undefined, alpha: number) {
  if (!color || typeof color !== 'string') return `rgba(59, 130, 246, ${alpha})`;

  const normalized = color.trim();
  if (normalized.startsWith('rgba(') || normalized.startsWith('rgb(')) {
    return normalized
      .replace(/^rgba?\(/, '')
      .replace(/\)$/, '')
      .split(',')
      .slice(0, 3)
      .map((value) => value.trim())
      .join(', ')
      .replace(/^/, 'rgba(')
      .concat(`, ${alpha})`);
  }

  let hex = normalized.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(59, 130, 246, ${alpha})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

type TagPillProps = {
  label: string;
  color?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

function TagPill({
  label,
  color = DEFAULT_TAG_COLOR,
  selected = false,
  disabled = false,
  onClick,
}: TagPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${selected ? color : hexToRgba(color, 0.32)}`,
        background: selected ? hexToRgba(color, 0.16) : hexToRgba(color, 0.08),
        color: selected ? color : 'var(--text-primary)',
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '13px',
        lineHeight: 1.2,
        fontWeight: selected ? 700 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.18s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function isUsableTag<T extends TagId>(tag: TagItem<T> | null | undefined): tag is TagItem<T> {
  return Boolean(
    tag &&
      tag.id !== undefined &&
      tag.id !== null &&
      typeof tag.name === 'string' &&
      tag.name.trim().length > 0
  );
}

export function TagMultiSelect<T extends TagId>({
  tags,
  value,
  onChange,
  bookId = null,
  onTagsChange,
  maxSelect,
  disabled = false,
  allTags,
  onTagsUpdated,
  placeholder = '请选择标签...',
}: TagMultiSelectProps<T>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolvedTags = useMemo(
    () =>
      (tags ?? allTags ?? []).filter(
        (tag) => isUsableTag(tag) && tag.is_active !== false && tag.is_deleted !== true
      ),
    [allTags, tags]
  );
  const handleTagsChange = onTagsChange ?? onTagsUpdated;

  const [localTags, setLocalTags] = useState<TagItem<T>[]>(resolvedTags);
  const [frequentTags, setFrequentTags] = useState<TagItem<T>[]>([]);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [draftValue, setDraftValue] = useState<T[]>(value ?? []);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [createDraft, setCreateDraft] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [modalInitialName, setModalInitialName] = useState('');

  useEffect(() => {
    setLocalTags(resolvedTags);
  }, [resolvedTags]);

  useEffect(() => {
    let cancelled = false;

    if (!bookId) {
      setFrequentTags([]);
      return;
    }

    apiGet<TagItem<T>[]>(`/api/tags/frequent?book_id=${bookId}&limit=10`, { showErrorMessage: false })
      .then((data) => {
        if (cancelled) return;
        setFrequentTags(
          Array.isArray(data)
            ? data.filter(
                (tag): tag is TagItem<T> =>
                  isUsableTag(tag) && tag.is_active !== false && tag.is_deleted !== true
              )
            : []
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFrequentTags([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (isCreatingInline) {
      inputRef.current?.focus();
    }
  }, [isCreatingInline]);

  useEffect(() => {
    if (modalVisible) {
      setDraftValue(value ?? []);
      return;
    }

    setSearch('');
    setCreateDraft('');
    setIsCreatingInline(false);
  }, [modalVisible, value]);

  const selectedSet = useMemo(() => new Set((value ?? []).map((item) => String(item))), [value]);
  const draftSelectedSet = useMemo(
    () => new Set((draftValue ?? []).map((item) => String(item))),
    [draftValue]
  );
  const searchKeyword = useMemo(() => search.trim().toLowerCase(), [search]);
  const isSearchActive = searchKeyword.length > 0;
  const draftSelectionCount = useMemo(() => (draftValue ?? []).length, [draftValue]);

  const frequentTagIds = useMemo(
    () => new Set(frequentTags.map((tag) => String(tag.id))),
    [frequentTags]
  );

  const sortedFlatTags = useMemo(() => {
    return [...localTags].sort((left, right) => {
      const leftSelected = draftSelectedSet.has(String(left.id));
      const rightSelected = draftSelectedSet.has(String(right.id));
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;

      const leftFrequent = frequentTagIds.has(String(left.id));
      const rightFrequent = frequentTagIds.has(String(right.id));
      if (leftFrequent !== rightFrequent) return leftFrequent ? -1 : 1;

      const leftLabel = getHierarchyPathLabel(localTags, left).toLowerCase();
      const rightLabel = getHierarchyPathLabel(localTags, right).toLowerCase();
      return leftLabel.localeCompare(rightLabel, 'zh-CN');
    });
  }, [draftSelectedSet, frequentTagIds, localTags]);

  const visibleFlatTags = useMemo(() => {
    if (!modalVisible) return [];
    if (!isSearchActive) return sortedFlatTags;

    return sortedFlatTags.filter((tag) =>
      getHierarchyPathLabel(localTags, tag).toLowerCase().includes(searchKeyword)
    );
  }, [isSearchActive, localTags, modalVisible, searchKeyword, sortedFlatTags]);

  const visibleFrequentTags = useMemo(() => {
    if (isSearchActive) return [];

    const availableIds = new Set(localTags.map((tag) => String(tag.id)));
    const filtered = frequentTags.filter((tag) => availableIds.has(String(tag.id)));
    const selected = filtered.filter((tag) => draftSelectedSet.has(String(tag.id)));
    const unselected = filtered.filter((tag) => !draftSelectedSet.has(String(tag.id)));
    return [...selected, ...unselected];
  }, [draftSelectedSet, frequentTags, isSearchActive, localTags]);

  const toggleTag = (tagId: T) => {
    if (disabled) return;

    const key = String(tagId);
    if (draftSelectedSet.has(key)) {
      setDraftValue((current) => current.filter((item) => String(item) !== key));
      return;
    }

    if (maxSelect && (draftValue ?? []).length >= maxSelect) {
      return;
    }

    setDraftValue((current) => [...current, tagId]);
  };

  const openCreateModal = () => {
    const nextName = createDraft.trim() || search.trim();
    if (!nextName) return;
    setModalInitialName(nextName);
    setCreateModalOpen(true);
    setIsCreatingInline(false);
  };

  const draftSelectionHint = useMemo(
    () => (maxSelect ? `已选 ${draftSelectionCount}/${maxSelect}` : `已选 ${draftSelectionCount}`),
    [draftSelectionCount, maxSelect]
  );
  const selectedTags = useMemo(
    () => localTags.filter((tag) => selectedSet.has(String(tag.id))),
    [localTags, selectedSet]
  );
  const selectedTagLabels = useMemo(
    () => selectedTags.map((tag) => getHierarchyPathLabel(localTags, tag)),
    [localTags, selectedTags]
  );

  return (
    <>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return;
          setModalVisible(true);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setModalVisible(true);
          }
        }}
        style={{
          width: '100%',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          background: 'var(--bg-card)',
          padding: '14px',
          opacity: disabled ? 0.75 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {selectedTags.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>{placeholder}</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {maxSelect ? `已选 ${selectedTags.length}/${maxSelect}` : `已选 ${selectedTags.length}`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {selectedTags.map((tag, index) => (
                <TagPill
                  key={String(tag.id)}
                  label={selectedTagLabels[index] || tag.name}
                  color={tag.color || DEFAULT_TAG_COLOR}
                  selected
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={modalVisible}
        title="选择标签"
        onCancel={() => setModalVisible(false)}
        destroyOnHidden
        footer={null}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '70vh',
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
              paddingBottom: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{draftSelectionHint}</div>
              <input
                aria-label="标签搜索"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={disabled}
                placeholder="搜索标签"
                style={{
                  minWidth: '200px',
                  flex: '1 1 220px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {!isSearchActive ? (
                <section
                  aria-label="常用标签区"
                  style={{
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-elevated)',
                    borderRadius: '14px',
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      color: 'var(--text-tertiary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '10px',
                    }}
                  >
                    常用标签
                  </div>
                  {visibleFrequentTags.length === 0 ? (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>常用标签会在此展示</div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        paddingBottom: '2px',
                        width: '100%',
                      }}
                    >
                      {visibleFrequentTags.map((tag) => {
                        const selected = draftSelectedSet.has(String(tag.id));
                        const maxReached = Boolean(
                          maxSelect && (draftValue ?? []).length >= maxSelect && !selected
                        );
                        const color = tag.color || DEFAULT_TAG_COLOR;
                        return (
                          <button
                            key={`frequent-${String(tag.id)}`}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            disabled={disabled || maxReached || tag.is_active === false}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              border: selected
                                ? `1px solid ${color}`
                                : '1px solid var(--border-color)',
                              background: selected ? hexToRgba(color, 0.12) : 'var(--bg-card)',
                              color: selected ? color : 'var(--text-primary)',
                              borderRadius: '999px',
                              padding: '6px 10px',
                              fontSize: '12px',
                              lineHeight: 1.2,
                              fontWeight: selected ? 700 : 500,
                              cursor:
                                disabled || maxReached || tag.is_active === false
                                  ? 'not-allowed'
                                  : 'pointer',
                              opacity: disabled || maxReached || tag.is_active === false ? 0.5 : 1,
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '999px',
                                background: color,
                                flexShrink: 0,
                              }}
                            />
                            <span>{getHierarchyPathLabel(localTags, tag)}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                              {tag.usage_count ?? 0}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              <section
                aria-label="全部标签列表"
                style={{
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-card)',
                  borderRadius: '14px',
                  padding: '12px',
                }}
              >
                <div
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '10px',
                  }}
                >
                  全部标签
                </div>
                {visibleFlatTags.length === 0 ? (
                  <div
                    style={{
                      border: '1px dashed var(--border-color)',
                      borderRadius: '12px',
                      padding: '14px',
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                    }}
                  >
                    没有匹配的标签
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {visibleFlatTags.map((tag) => {
                      const selected = draftSelectedSet.has(String(tag.id));
                      const maxReached = Boolean(
                        maxSelect && (draftValue ?? []).length >= maxSelect && !selected
                      );
                      return (
                        <TagPill
                          key={String(tag.id)}
                          label={getHierarchyPathLabel(localTags, tag)}
                          color={tag.color || DEFAULT_TAG_COLOR}
                          selected={selected}
                          disabled={disabled || maxReached || tag.is_active === false}
                          onClick={() => toggleTag(tag.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <div style={{ marginTop: '14px' }}>
              {isCreatingInline ? (
                <input
                  ref={inputRef}
                  value={createDraft}
                  onChange={(event) => setCreateDraft(event.target.value)}
                  onBlur={() => {
                    if (!createDraft.trim()) {
                      setIsCreatingInline(false);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      openCreateModal();
                    }
                    if (event.key === 'Escape') {
                      setCreateDraft('');
                      setIsCreatingInline(false);
                    }
                  }}
                  disabled={disabled || !bookId}
                  placeholder={bookId ? '输入标签名称，按 Enter 继续' : '缺少账本信息，无法创建标签'}
                  style={{
                    width: '100%',
                    border: `1px solid ${hexToRgba(DEFAULT_TAG_COLOR, 0.28)}`,
                    borderRadius: '10px',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    setCreateDraft(search.trim());
                    setIsCreatingInline(true);
                  }}
                  disabled={disabled || !bookId}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    color: disabled || !bookId ? 'var(--text-tertiary)' : 'var(--accent-color)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: disabled || !bookId ? 'not-allowed' : 'pointer',
                  }}
                >
                  [+ 新建标签]
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              position: 'sticky',
              bottom: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              paddingTop: '12px',
              marginTop: '4px',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
            }}
          >
            <button
              type="button"
              onClick={() => setModalVisible(false)}
              style={{
                border: '1px solid var(--border-color)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(draftValue);
                setModalVisible(false);
              }}
              style={{
                border: 'none',
                background: 'var(--accent-color)',
                color: '#fff',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              确定
            </button>
          </div>
        </div>
      </Modal>

      <TagCreateModal
        open={createModalOpen}
        bookId={bookId}
        initialName={modalInitialName}
        onCancel={() => setCreateModalOpen(false)}
        onCreated={(createdTag) => {
          const nextTag = {
            id: ((createdTag.id || createdTag.name) as T),
            name: createdTag.name,
            parent_id: createdTag.parent_id,
            color: createdTag.color,
            is_active: true,
          } as TagItem<T>;

          const nextTags = [...localTags, nextTag];
          setLocalTags(nextTags);
          handleTagsChange?.(nextTags);

          if (!draftSelectedSet.has(String(nextTag.id))) {
            const newDraft = [...(draftValue ?? []), nextTag.id];
            setDraftValue(newDraft);
            onChange(newDraft);
          }

          setCreateDraft('');
          setSearch(createdTag.name);
          setCreateModalOpen(false);
        }}
      />
    </>
  );
}
