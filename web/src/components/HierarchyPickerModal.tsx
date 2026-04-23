import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from 'antd';
import { CategoryCreateModal } from './CategoryCreateModal';
import { apiGet } from '../services/api';

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

// 将数组按每3个一组分组
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
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
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<HierarchyItem[]>(items);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [frequentCategories, setFrequentCategories] = useState<HierarchyItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraftValue(Array.isArray(value) ? value : value ? [value] : []);
    setExpandedParentId(null);
  }, [open, value]);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // 分离一级和二级分类
  const { groups, singles, orphans } = useMemo(() => {
    const topLevel = localItems.filter((item) => !item.parent_id);
    const withChildren = topLevel.map((parent) => ({
      parent,
      children: localItems.filter((item) => item.parent_id === parent.id),
    }));
    const childIds = new Set(localItems.filter((item) => item.parent_id).map((item) => item.id));
    const ungroupedTopLevel = topLevel.filter(
      (item) => !withChildren.some((group) => group.parent.id === item.id && group.children.length > 0),
    );
    const orphanChildren = localItems.filter(
      (item) => item.parent_id && !localItems.some((candidate) => candidate.id === item.parent_id),
    );

    return {
      groups: withChildren.filter((group) => group.children.length > 0),
      singles: ungroupedTopLevel.filter((item) => !childIds.has(item.id)),
      orphans: orphanChildren,
    };
  }, [localItems]);

  const isTagMode = multiple || title.includes('标签');
  const canCreateCategory = enableCreate && !isTagMode && !multiple && Boolean(bookId);
  const shouldShowFrequentCategories = !isTagMode && !multiple;
  const defaultCategoryType = useMemo(() => {
    const categoryTypes = Array.from(
      new Set(localItems.map((item) => item.category_type).filter(Boolean))
    );
    return categoryTypes.length === 1 && categoryTypes[0] === 'income' ? 'income' : 'expense';
  }, [localItems]);

  useEffect(() => {
    let cancelled = false;

    if (!bookId || !shouldShowFrequentCategories) {
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
                  item?.parent_id && // only level-2 categories
                  item?.is_active !== false &&
                  item?.category_type === defaultCategoryType // match current expense/income type
              )
            : []
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFrequentCategories([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, shouldShowFrequentCategories]);

  // 切换展开状态（仅一级分类触发）
  const toggleExpand = (parentId: string) => {
    setExpandedParentId(expandedParentId === parentId ? null : parentId);
  };

  // 切换选中状态
  const toggleSelect = (id: string, options?: { isLeafOption?: boolean }) => {
    const isLeafOption = options?.isLeafOption === true;
    if (multiple) {
      // 多选模式（标签）- 只有点击二级标签才切换选中状态
      if (isLeafOption) {
        setDraftValue((current) =>
          current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
        );
      } else {
        // 点击一级标签只展开/收起，不选中
        toggleExpand(id);
      }
    } else {
      // 单选模式（分类）- 只有点击二级分类才选中并关闭
      if (isLeafOption) {
        setDraftValue([id]);
        onConfirm(id);
      } else {
        // 点击一级分类只展开/收起
        toggleExpand(id);
      }
    }
  };

  // 渲染一级分类卡片
  const renderParentCard = (item: HierarchyItem, isExpanded: boolean, hasChildren: boolean) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    const selectableLevelOne = !isTagMode && !hasChildren;
    
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, { isLeafOption: selectableLevelOne })}
        style={{
          flex: '1 1 0',
          minWidth: 0,
          padding: '10px 8px',
          border: isSelected ? `1.5px solid ${isTagMode ? tagColor : 'var(--accent-color)'}` : '1px solid var(--border-color)',
          borderRadius: '12px',
          background: isSelected ? (isTagMode ? `${tagColor}15` : 'rgba(22, 119, 255, 0.12)') : 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {isTagMode && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        {hasChildren ? (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : null}
      </button>
    );
  };

  // 渲染二级分类卡片
  const renderChildCard = (item: HierarchyItem, options?: { isLevelOneOption?: boolean }) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    const isLevelOneOption = options?.isLevelOneOption === true;
    
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, { isLeafOption: true })}
        style={{
          minWidth: '70px',
          padding: '8px 12px',
          border: isSelected ? `1.5px solid ${isTagMode ? tagColor : 'var(--accent-color)'}` : '1px solid var(--border-color)',
          borderRadius: '10px',
          background: isSelected
            ? (isTagMode ? `${tagColor}15` : 'rgba(22, 119, 255, 0.12)')
            : isLevelOneOption
              ? 'var(--bg-elevated)'
              : 'var(--bg-card)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: isLevelOneOption ? 600 : 500,
          transition: 'all 0.2s ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {isSelected && (
          <span style={{ color: isTagMode ? tagColor : 'var(--accent-color)', fontSize: 10, fontWeight: 'bold' }}>✓</span>
        )}
        {isTagMode && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        {isLevelOneOption && (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 0 }}>
            （一级）
          </span>
        )}
      </button>
    );
  };

  // 将有二级的一级分类按每3个一组分组
  const groupedRows = useMemo(() => {
    return chunkArray(groups, 3);
  }, [groups]);

  // 检查某个parentId是否在当前行中
  const isParentInRow = (row: typeof groups, parentId: string) => {
    return row.some(g => g.parent.id === parentId);
  };

  // 渲染内容
  const renderContent = () => {
    if (groups.length === 0 && singles.length === 0 && orphans.length === 0) {
      return (
        <div
          style={{
            border: '1px dashed var(--border-color)',
            borderRadius: '16px',
            padding: '28px 16px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
          }}
        >
          {emptyText}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shouldShowFrequentCategories && (
          <section
            style={{
              border: '1px solid var(--border-light)',
              background: 'var(--bg-elevated)',
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div
              style={{
                color: 'var(--text-tertiary)',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              常用分类
            </div>
            {frequentCategories.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>常用分类会在此展示</div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  paddingBottom: 2,
                }}
              >
                {frequentCategories.map((item) => {
                  const isSelected = draftValue.includes(item.id);
                  return (
                    <button
                      key={`frequent-${item.id}`}
                      type="button"
                      onClick={() => {
                        setDraftValue([item.id]);
                        onConfirm(item.id);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        border: isSelected
                          ? '1.5px solid var(--accent-color)'
                          : '1px solid var(--border-color)',
                        borderRadius: 999,
                        background: isSelected ? 'rgba(22, 119, 255, 0.12)' : 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <span>{item.icon || '📁'}</span>
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 有二级的一级分类 - 每3个一行 */}
        {groupedRows.map((row, rowIdx) => {
          const hasExpandedInRow = row.some(g => g.parent.id === expandedParentId);
          
          return (
            <div key={`row-${rowIdx}`}>
              {/* 一级分类行 */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                }}
              >
                {row.map(({ parent, children }) => 
                  renderParentCard(parent, expandedParentId === parent.id, children.length > 0)
                )}
              </div>
              
              {/* 展开的二级分类容器 - 出现在包含展开项的行下方 */}
              {hasExpandedInRow && expandedParentId && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: 12,
                    background: 'var(--bg-card)',
                    borderRadius: 12,
                    marginTop: 8,
                    border: '1px solid var(--border-light)',
                    animation: 'fadeIn 0.2s ease',
                  }}
                >
                  {!isTagMode && (() => {
                    const expandedGroup = groups.find(g => g.parent.id === expandedParentId);
                    if (!expandedGroup) return null;
                    return renderChildCard(expandedGroup.parent, { isLevelOneOption: true });
                  })()}
                  {groups
                    .find(g => g.parent.id === expandedParentId)
                    ?.children.map(child => renderChildCard(child))}
                </div>
              )}
            </div>
          );
        })}

        {/* 无二级的一级分类 - 每3个一行 */}
        {singles.length > 0 && (() => {
          const singleRows = chunkArray(singles, 3);
          return singleRows.map((row, rowIdx) => (
            <div key={`single-${rowIdx}`} style={{ display: 'flex', gap: 8 }}>
              {row.map(item => renderParentCard(item, false, false))}
            </div>
          ));
        })()}

        {/* 未分组的二级标签 */}
        {orphans.length > 0 && isTagMode && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {orphans.map(item => renderChildCard(item))}
          </div>
        )}

        {canCreateCategory && (
          <div style={{ marginTop: 6 }}>
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
        )}
      </div>
    );
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={
        multiple ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              已选 {draftValue.length} 项
            </span>
            <div>
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" onClick={() => onConfirm(draftValue)} style={{ marginLeft: 8 }}>
                保存
              </Button>
            </div>
          </div>
        ) : null
      }
      width={440}
      closable={!multiple}
      maskClosable={!multiple}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: '8px 0' }}>
        {renderContent()}
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
          // 预高亮新分类（不触发关闭）
          setDraftValue([nextItem.id]);
          if (nextItem.parent_id) {
            setExpandedParentId(nextItem.parent_id);
          }
          // 不关闭 CategoryCreateModal，也不关闭/选中父弹窗
          // 由用户手动关闭创建弹窗
        }}
      />
    </Modal>
  );
}
