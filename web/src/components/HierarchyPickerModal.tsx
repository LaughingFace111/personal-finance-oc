import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from 'antd';

type HierarchyItem = {
  id: string;
  name: string;
  parent_id?: string;
  color?: string;
  category_type?: string;
};

interface HierarchyPickerModalProps {
  open: boolean;
  title: string;
  items: HierarchyItem[];
  value: string | string[];
  multiple?: boolean;
  emptyText?: string;
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
  onCancel,
  onConfirm,
}: HierarchyPickerModalProps) {
  const [draftValue, setDraftValue] = useState<string[]>([]);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftValue(Array.isArray(value) ? value : value ? [value] : []);
    setExpandedParentId(null);
  }, [open, value]);

  // 分离一级和二级分类
  const { groups, singles, orphans } = useMemo(() => {
    const topLevel = items.filter((item) => !item.parent_id);
    const withChildren = topLevel.map((parent) => ({
      parent,
      children: items.filter((item) => item.parent_id === parent.id),
    }));
    const childIds = new Set(items.filter((item) => item.parent_id).map((item) => item.id));
    const ungroupedTopLevel = topLevel.filter(
      (item) => !withChildren.some((group) => group.parent.id === item.id && group.children.length > 0),
    );
    const orphanChildren = items.filter(
      (item) => item.parent_id && !items.some((candidate) => candidate.id === item.parent_id),
    );

    return {
      groups: withChildren.filter((group) => group.children.length > 0),
      singles: ungroupedTopLevel.filter((item) => !childIds.has(item.id)),
      orphans: orphanChildren,
    };
  }, [items]);

  const isTagMode = items.some((item) => item.color) || title.includes('标签');

  // 切换展开状态（仅一级分类触发）
  const toggleExpand = (parentId: string) => {
    setExpandedParentId(expandedParentId === parentId ? null : parentId);
  };

  // 切换选中状态
  const toggleSelect = (id: string, isChild: boolean = false) => {
    if (multiple) {
      // 多选模式（标签）- 只有点击二级标签才切换选中状态
      if (isChild) {
        setDraftValue((current) =>
          current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
        );
      } else {
        // 点击一级标签只展开/收起，不选中
        toggleExpand(id);
      }
    } else {
      // 单选模式（分类）- 只有点击二级分类才选中并关闭
      if (isChild) {
        setDraftValue([id]);
        onConfirm(id);
      } else {
        // 点击一级分类只展开/收起
        toggleExpand(id);
      }
    }
  };

  // 渲染一级分类卡片
  const renderParentCard = (item: HierarchyItem, isExpanded: boolean) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, false)}
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
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
    );
  };

  // 渲染二级分类卡片
  const renderChildCard = (item: HierarchyItem) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, true)}
        style={{
          minWidth: '70px',
          padding: '8px 12px',
          border: isSelected ? `1.5px solid ${isTagMode ? tagColor : 'var(--accent-color)'}` : '1px solid var(--border-color)',
          borderRadius: '10px',
          background: isSelected ? (isTagMode ? `${tagColor}15` : 'rgba(22, 119, 255, 0.12)') : 'var(--bg-card)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
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
                  renderParentCard(parent, expandedParentId === parent.id)
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
              {row.map(item => renderParentCard(item, false))}
            </div>
          ));
        })()}

        {/* 未分组的二级标签 */}
        {orphans.length > 0 && isTagMode && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {orphans.map(item => renderChildCard(item))}
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
    </Modal>
  );
}