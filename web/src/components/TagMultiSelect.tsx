import { Modal } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TagCreateModal } from './TagCreateModal';

type TagId = string | number;

type TagItem<T extends TagId> = {
  id: T;
  name: string;
  color?: string;
  parent_id?: T | string;
  is_active?: boolean;
  is_deleted?: boolean;
};

type TagGroup<T extends TagId> = {
  key: string;
  label: string;
  color: string;
  parent?: TagItem<T>;
  tags: TagItem<T>[];
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
const UNGROUPED_COLOR = '#94a3b8';

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
      .replace(/^/, `rgba(`)
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

export function buildGroups<T extends TagId>(tags: TagItem<T>[]) {
  const safeTags = Array.isArray(tags)
    ? tags.filter(
        (tag): tag is TagItem<T> =>
          Boolean(tag) &&
          tag.id !== undefined &&
          tag.id !== null &&
          typeof tag.name === 'string' &&
          tag.name.trim().length > 0
      )
    : [];
  const byId = new Map(safeTags.map((tag) => [String(tag.id), tag]));
  const childrenByParent = new Map<string, TagItem<T>[]>();

  for (const tag of safeTags) {
    if (!tag.parent_id) continue;
    const parentKey = String(tag.parent_id);
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(tag);
    childrenByParent.set(parentKey, list);
  }

  const roots = safeTags.filter((tag) => !tag.parent_id || !byId.has(String(tag.parent_id)));
  const groups: TagGroup<T>[] = roots.map((root) => ({
    key: `group-${String(root.id)}`,
    label: root.name,
    color: root.color || DEFAULT_TAG_COLOR,
    parent: root,
    tags: [root, ...(childrenByParent.get(String(root.id)) ?? [])],
  }));

  const assigned = new Set(groups.flatMap((group) => group.tags.map((tag) => String(tag.id))));
  const ungrouped = safeTags.filter((tag) => !assigned.has(String(tag.id)));

  if (ungrouped.length > 0) {
    groups.push({
      key: 'group-ungrouped',
      label: '其他标签',
      color: UNGROUPED_COLOR,
      tags: ungrouped,
    });
  }

  return groups
    .map((group) => ({
      ...group,
      tags: [...group.tags].sort((left, right) => {
        const leftIsParent = group.parent && String(left.id) === String(group.parent.id);
        const rightIsParent = group.parent && String(right.id) === String(group.parent.id);
        if (leftIsParent && !rightIsParent) return -1;
        if (!leftIsParent && rightIsParent) return 1;
        return String(left.name).localeCompare(String(right.name), 'zh-CN');
      }),
    }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label), 'zh-CN'));
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
  const resolvedTags = (tags ?? allTags ?? []).filter(
    (tag) => tag.is_active !== false && tag.is_deleted !== true
  );
  const handleTagsChange = onTagsChange ?? onTagsUpdated;

  const [localTags, setLocalTags] = useState<TagItem<T>[]>(resolvedTags);
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
  const totalTags = localTags.length;
  const canSearch = totalTags > 10;

  const visibleGroups = useMemo(() => {
    const groups = buildGroups(localTags);
    const keyword = search.trim().toLowerCase();

    if (!keyword) return groups;

    return groups
      .map((group) => {
        const groupMatches = group.label.toLowerCase().includes(keyword);
        if (groupMatches) return group;

        const filteredTags = group.tags.filter((tag) => {
          const tagText = `${tag.name} ${group.label}`.toLowerCase();
          return tagText.includes(keyword);
        });

        return {
          ...group,
          tags: filteredTags,
        };
      })
      .filter((group) => group.tags.length > 0);
  }, [localTags, search]);

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

  const draftSelectionHint = maxSelect
    ? `已选 ${(draftValue ?? []).length}/${maxSelect}`
    : `已选 ${(draftValue ?? []).length}`;
  const selectedTags = localTags.filter((tag) => selectedSet.has(String(tag.id)));

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {selectedTags.map((tag) => (
              <TagPill
                key={String(tag.id)}
                label={tag.name}
                color={tag.color || DEFAULT_TAG_COLOR}
                selected
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalVisible}
        title="选择标签"
        onCancel={() => setModalVisible(false)}
        footer={[
          <button
            key="cancel"
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
          </button>,
          <button
            key="confirm"
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
          </button>,
        ]}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginBottom: canSearch ? '12px' : '6px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{draftSelectionHint}</div>
          {canSearch ? (
            <input
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
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          {visibleGroups.map((group) => (
            <section
              key={group.key}
              style={{
                border: `1px solid ${hexToRgba(group.color, 0.14)}`,
                background: hexToRgba(group.color, 0.045),
                borderRadius: '14px',
                padding: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '999px',
                    background: group.color,
                  }}
                />
                <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700 }}>
                  {group.label}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {group.tags.map((tag) => {
                  const selected = draftSelectedSet.has(String(tag.id));
                  const maxReached = Boolean(
                    maxSelect && (draftValue ?? []).length >= maxSelect && !selected
                  );
                  return (
                    <TagPill
                      key={String(tag.id)}
                      label={tag.name}
                      color={tag.color || group.color || DEFAULT_TAG_COLOR}
                      selected={selected}
                      disabled={disabled || maxReached || tag.is_active === false}
                      onClick={() => toggleTag(tag.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {visibleGroups.length === 0 ? (
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
          ) : null}
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
            setDraftValue((current) => [...current, nextTag.id]);
          }

          setCreateDraft('');
          setSearch(createdTag.name);
          setCreateModalOpen(false);
        }}
      />
    </>
  );
}
