import { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from 'antd';
import { CategoryCreateModal } from './CategoryCreateModal';
import { apiGet } from '../services/api';
import { getHierarchyPathLabel } from '../utils/hierarchySelection';

type HierarchyItem = {
  id: string;
  name: string;
  parent_id?: string;
  color?: string;
  category_type?: string;
  icon?: string;
  usage_count?: number;
  is_active?: boolean;
};

interface HierarchyPickerModalProps {
  open: boolean;
  title: string;
  items: HierarchyItem[];
  value: string | string[];
  multiple?: boolean;
  emptyText?: string;
  bookId?: string | null;
  enableCreate?: boolean;
  createButtonText?: string;
  onItemsUpdated?: (nextItems: HierarchyItem[]) => void;
  onCancel: () => void;
  onConfirm: (nextValue: string | string[]) => void;
}

type CategoryViewMode = 'topLevelGrid' | 'expandedCategory';

function SelectionPill({
  label,
  selected,
  onClick,
  tone = 'default',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  tone?: 'default' | 'parent';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: selected ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
        background: selected
          ? 'rgba(22, 119, 255, 0.12)'
          : tone === 'parent'
            ? 'var(--bg-elevated)'
            : 'var(--bg-card)',
        color: 'var(--text-primary)',
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: tone === 'parent' ? 700 : 500,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        textAlign: 'left',
      }}
    >
      {selected ? <span style={{ color: 'var(--accent-color)', fontSize: 10 }}>✓</span> : null}
      <span>{label}</span>
    </button>
  );
}

export function HierarchyPickerModal({
  open,
  title,
  items,
  value,
  multiple = false,
  emptyText = '暂无可选项',
  bookId = null,
  enableCreate = false,
  createButtonText = '[+ 新建分类]',
  onItemsUpdated,
  onCancel,
  onConfirm,
}: HierarchyPickerModalProps) {
  const [draftValue, setDraftValue] = useState<string[]>([]);
  const [localItems, setLocalItems] = useState<HierarchyItem[]>(items);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [frequentCategories, setFrequentCategories] = useState<HierarchyItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryViewMode, setCategoryViewMode] = useState<CategoryViewMode>('topLevelGrid');
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftValue(Array.isArray(value) ? value : value ? [value] : []);
    setSearch('');
    setCategoryViewMode('topLevelGrid');
    setExpandedCategoryId(null);
  }, [open, value]);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const isTagMode = title.includes('标签');
  const canCreateCategory = enableCreate && !isTagMode && Boolean(bookId);
  const searchableItems = useMemo(
    () => localItems.filter((item) => item.is_active !== false),
    [localItems],
  );

  const groups = useMemo(() => {
    const roots = searchableItems.filter((item) => !item.parent_id);
    return roots
      .map((parent) => ({
        parent,
        children: searchableItems.filter((item) => item.parent_id === parent.id),
      }))
      .sort((left, right) => left.parent.name.localeCompare(right.parent.name, 'zh-CN'));
  }, [searchableItems]);

  const singles = useMemo(
    () =>
      groups
        .filter((group) => group.children.length === 0)
        .map((group) => group.parent)
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [groups],
  );

  const groupedParents = useMemo(
    () => groups.filter((group) => group.children.length > 0),
    [groups],
  );
  const topLevelCategories = useMemo(
    () => groups.map((group) => group.parent),
    [groups],
  );

  const defaultCategoryType = useMemo(() => {
    const categoryTypes = Array.from(new Set(localItems.map((item) => item.category_type).filter(Boolean)));
    return categoryTypes.length === 1 && categoryTypes[0] === 'income' ? 'income' : 'expense';
  }, [localItems]);

  useEffect(() => {
    let cancelled = false;

    if (!bookId || isTagMode) {
      setFrequentCategories([]);
      return;
    }

    apiGet<HierarchyItem[]>(`/api/categories/frequent?book_id=${bookId}&limit=10`, {
      showErrorMessage: false,
    })
      .then((data) => {
        if (cancelled) return;
        setFrequentCategories(
          Array.isArray(data)
            ? data.filter(
                (item) =>
                  item?.is_active !== false &&
                  item?.category_type === defaultCategoryType,
              )
            : [],
        );
      })
      .catch(() => {
        if (!cancelled) setFrequentCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, defaultCategoryType, isTagMode]);

  const selectedSet = useMemo(() => new Set(draftValue), [draftValue]);
  const searchKeyword = search.trim().toLowerCase();

  const visibleFrequentCategories = useMemo(() => {
    if (isTagMode) return [];
    return frequentCategories.filter((item) => {
      if (!searchKeyword) return true;
      return getHierarchyPathLabel(searchableItems, item).toLowerCase().includes(searchKeyword);
    });
  }, [frequentCategories, isTagMode, searchKeyword, searchableItems]);

  const visibleGroupedParents = useMemo(() => {
    return groupedParents
      .map((group) => {
        if (!searchKeyword) return group;

        const parentMatches = group.parent.name.toLowerCase().includes(searchKeyword);
        const nextChildren = group.children.filter((child) =>
          getHierarchyPathLabel(searchableItems, child).toLowerCase().includes(searchKeyword),
        );

        if (parentMatches) return group;
        return { ...group, children: nextChildren };
      })
      .filter((group) => group.children.length > 0 || group.parent.name.toLowerCase().includes(searchKeyword));
  }, [groupedParents, searchKeyword, searchableItems]);

  const visibleSingles = useMemo(() => {
    if (!searchKeyword) return singles;
    return singles.filter((item) => item.name.toLowerCase().includes(searchKeyword));
  }, [searchKeyword, singles]);

  const selectedLabels = useMemo(
    () =>
      draftValue
        .map((itemId) => getHierarchyPathLabel(searchableItems, itemId))
        .filter(Boolean),
    [draftValue, searchableItems],
  );

  const hasVisibleContent =
    visibleFrequentCategories.length > 0 ||
    visibleGroupedParents.length > 0 ||
    visibleSingles.length > 0;

  const visibleTopLevelCategories = useMemo(() => {
    if (!searchKeyword) return topLevelCategories;
    return groups
      .filter((group) => {
        if (group.parent.name.toLowerCase().includes(searchKeyword)) return true;
        return group.children.some((child) =>
          getHierarchyPathLabel(searchableItems, child).toLowerCase().includes(searchKeyword),
        );
      })
      .map((group) => group.parent);
  }, [groups, searchKeyword, searchableItems, topLevelCategories]);

  const expandedCategoryGroup = useMemo(() => {
    if (!expandedCategoryId) return null;
    return groups.find((group) => group.parent.id === expandedCategoryId) ?? null;
  }, [expandedCategoryId, groups]);

  const visibleExpandedChildren = useMemo(() => {
    if (!expandedCategoryGroup) return [];
    if (!searchKeyword) return expandedCategoryGroup.children;
    return expandedCategoryGroup.children.filter((child) =>
      getHierarchyPathLabel(searchableItems, child).toLowerCase().includes(searchKeyword),
    );
  }, [expandedCategoryGroup, searchKeyword, searchableItems]);

  const isCategoryMode = !isTagMode;
  const isTagMultiSelectMode = isTagMode && multiple;

  const toggleSelect = (id: string) => {
    if (!isTagMultiSelectMode) {
      setDraftValue([id]);
      onConfirm(id);
      return;
    }

    setDraftValue((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const openExpandedCategory = (categoryId: string) => {
    setExpandedCategoryId(categoryId);
    setCategoryViewMode('expandedCategory');
  };

  const renderTagModeContent = () => {
    return (
      <>
        {!hasVisibleContent ? (
          <div
            style={{
              border: '1px dashed var(--border-color)',
              borderRadius: 16,
              padding: '28px 16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
            }}
          >
            {searchKeyword ? '没有匹配的选项' : emptyText}
          </div>
        ) : null}

        {visibleGroupedParents.map((group) => (
          <section
            key={group.parent.id}
            style={{
              border: '1px solid var(--border-light)',
              borderRadius: 14,
              padding: 12,
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              {group.parent.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <SelectionPill
                label={`${group.parent.name}（一级）`}
                selected={selectedSet.has(group.parent.id)}
                onClick={() => toggleSelect(group.parent.id)}
                tone="parent"
              />
              {group.children.map((child) => (
                <SelectionPill
                  key={child.id}
                  label={child.name}
                  selected={selectedSet.has(child.id)}
                  onClick={() => toggleSelect(child.id)}
                />
              ))}
            </div>
          </section>
        ))}

        {visibleSingles.length > 0 ? (
          <section
            style={{
              border: '1px solid var(--border-light)',
              borderRadius: 14,
              padding: 12,
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              其他可选项
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {visibleSingles.map((item) => (
                <SelectionPill
                  key={item.id}
                  label={item.name}
                  selected={selectedSet.has(item.id)}
                  onClick={() => toggleSelect(item.id)}
                  tone="parent"
                />
              ))}
            </div>
          </section>
        ) : null}
      </>
    );
  };

  const renderCategoryTopLevelGrid = () => {
    return (
      <>
        {visibleTopLevelCategories.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--border-color)',
              borderRadius: 16,
              padding: '28px 16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
            }}
          >
            {searchKeyword ? '没有匹配的分类' : emptyText}
          </div>
        ) : (
          <section
            aria-label="顶级分类网格"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: 10,
            }}
          >
            {visibleTopLevelCategories.map((item) => {
              const isLastExpanded = expandedCategoryId === item.id;
              const childCount = searchableItems.filter((candidate) => candidate.parent_id === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`展开分类 ${item.name}`}
                  onClick={() => openExpandedCategory(item.id)}
                  style={{
                    border: isLastExpanded ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
                    borderRadius: 16,
                    background: isLastExpanded ? 'rgba(22, 119, 255, 0.10)' : 'var(--bg-card)',
                    padding: '14px 12px',
                    minHeight: 92,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 8,
                    alignContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{item.icon || '📁'}</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }}>{item.name}</span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {isLastExpanded ? '上次展开' : childCount > 0 ? `${childCount} 个子分类` : '进入详情'}
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </>
    );
  };

  const renderExpandedCategoryView = () => {
    if (!expandedCategoryGroup) {
      return renderCategoryTopLevelGrid();
    }

    const { parent } = expandedCategoryGroup;
    const canSelectParent = expandedCategoryGroup.children.length === 0;

    return (
      <section
        aria-label="展开分类视图"
        style={{
          border: '1px solid var(--border-light)',
          borderRadius: 16,
          background: 'var(--bg-card)',
          padding: 14,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <button
              type="button"
              aria-label="返回顶级分类"
              onClick={() => setCategoryViewMode('topLevelGrid')}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: 'var(--accent-color)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              ← 返回分类网格
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26, lineHeight: 1 }}>{parent.icon || '📁'}</span>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 }}>{parent.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {expandedCategoryGroup.children.length > 0 ? '请选择下一级分类' : '当前分类没有下级，可直接选择'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {canSelectParent ? (
            <SelectionPill
              label={`${parent.name}（选择此分类）`}
              selected={selectedSet.has(parent.id)}
              onClick={() => toggleSelect(parent.id)}
              tone="parent"
            />
          ) : null}

          {visibleExpandedChildren.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {visibleExpandedChildren.map((child) => (
                <SelectionPill
                  key={child.id}
                  label={child.name}
                  selected={selectedSet.has(child.id)}
                  onClick={() => toggleSelect(child.id)}
                />
              ))}
            </div>
          ) : null}

          {!canSelectParent && visibleExpandedChildren.length === 0 ? (
            <div
              style={{
                border: '1px dashed var(--border-color)',
                borderRadius: 12,
                padding: '20px 14px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
              }}
            >
              {searchKeyword ? '没有匹配的子分类' : '当前分类暂无可选子分类'}
            </div>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      width={460}
      footer={
        isTagMultiSelectMode ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>已选 {draftValue.length} 项</span>
            <div>
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" onClick={() => onConfirm(draftValue)} style={{ marginLeft: 8 }}>
                保存
              </Button>
            </div>
          </div>
        ) : null
      }
      closable={!isTagMultiSelectMode}
      maskClosable={!isTagMultiSelectMode}
      destroyOnHidden
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={isTagMode ? '搜索标签' : '搜索分类'}
          style={{
            width: '100%',
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            padding: '9px 12px',
            fontSize: 13,
            outline: 'none',
          }}
        />

        {isTagMultiSelectMode && selectedLabels.length > 0 ? (
          <div
            style={{
              border: '1px solid var(--border-light)',
              borderRadius: 12,
              padding: 12,
              background: 'var(--bg-elevated)',
            }}
          >
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              当前已选
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {selectedLabels.map((label) => (
                <span
                  key={label}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 999,
                    padding: '5px 10px',
                    fontSize: 12,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'grid', gap: 12, paddingRight: 2 }}>
          {isCategoryMode
            ? categoryViewMode === 'expandedCategory'
              ? renderExpandedCategoryView()
              : renderCategoryTopLevelGrid()
            : renderTagModeContent()}

          {canCreateCategory ? (
            <div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: 'var(--accent-color)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {createButtonText}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <CategoryCreateModal
        open={createModalOpen}
        bookId={bookId}
        initialType={defaultCategoryType}
        onCancel={() => setCreateModalOpen(false)}
        onCreated={(createdCategory) => {
          const nextItem: HierarchyItem = {
            id: createdCategory.id,
            name: createdCategory.name,
            parent_id: createdCategory.parent_id,
            color: createdCategory.color,
            category_type: createdCategory.category_type,
          };
          const nextItems = localItems.some((item) => item.id === nextItem.id)
            ? localItems
            : [...localItems, nextItem];
          setLocalItems(nextItems);
          onItemsUpdated?.(nextItems);
          setDraftValue([nextItem.id]);
        }}
      />
    </Modal>
  );
}
