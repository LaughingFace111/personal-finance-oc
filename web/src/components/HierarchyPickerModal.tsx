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
      // 多选模式（标签）
      setDraftValue((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
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

  // 渲染一级分类卡片（分类模式）
  const renderCategoryParentCard = (item: HierarchyItem, isExpanded: boolean) => {
    const isSelected = draftValue.includes(item.id);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, false)}
        style={{
          minWidth: '80px',
          padding: '10px 16px',
          border: isSelected ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
          borderRadius: '12px',
          background: isSelected ? 'rgba(22, 119, 255, 0.12)' : 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          transition: 'all 0.2s ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {item.name}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
    );
  };

  // 渲染二级分类卡片（分类模式）
  const renderCategoryChildCard = (item: HierarchyItem) => {
    const isSelected = draftValue.includes(item.id);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, true)}
        style={{
          minWidth: '70px',
          padding: '8px 14px',
          border: isSelected ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
          borderRadius: '10px',
          background: isSelected ? 'rgba(22, 119, 255, 0.12)' : 'var(--bg-card)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          transition: 'all 0.2s ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {item.name}
      </button>
    );
  };

  // 渲染父标签卡片（标签模式）
  const renderTagParentCard = (item: HierarchyItem, isExpanded: boolean) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, false)}
        style={{
          minWidth: '70px',
          padding: '8px 14px',
          border: isSelected ? `1.5px solid ${tagColor}` : '1px solid var(--border-color)',
          borderRadius: '12px',
          background: isSelected ? `${tagColor}15` : 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          transition: 'all 0.2s ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: tagColor }} />
        {item.name}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
    );
  };

  // 渲染子标签卡片（标签模式）
  const renderTagChildCard = (item: HierarchyItem) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggleSelect(item.id, true)}
        style={{
          minWidth: '60px',
          padding: '6px 12px',
          border: isSelected ? `1.5px solid ${tagColor}` : '1px solid var(--border-color)',
          borderRadius: '10px',
          background: isSelected ? `${tagColor}15` : 'var(--bg-card)',
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
          <span style={{ color: tagColor, fontSize: 10 }}>✓</span>
        )}
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagColor }} />
        {item.name}
      </button>
    );
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

    // 渲染一级分类卡片容器（带展开效果）
    const renderCards = (parentCards: React.ReactNode[], childContainers: React.ReactNode[]) => {
      return parentCards.map((card, idx) => (
        <div key={idx}>
          {card}
          {childContainers[idx]}
        </div>
      ));
    };

    const parentCards: React.ReactNode[] = [];
    const childContainers: React.ReactNode[] = [];

    // 有二级的一级分类
    groups.forEach(({ parent, children }) => {
      parentCards.push(
        isTagMode
          ? renderTagParentCard(parent, expandedParentId === parent.id)
          : renderCategoryParentCard(parent, expandedParentId === parent.id)
      );
      
      if (expandedParentId === parent.id && children.length > 0) {
        childContainers.push(
          <div
            key={parent.id}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              padding: 12,
              background: 'var(--bg-card)',
              borderRadius: 12,
              marginTop: 8,
              marginBottom: 8,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {children.map((child) =>
              isTagMode ? renderTagChildCard(child) : renderCategoryChildCard(child)
            )}
          </div>
        );
      } else {
        childContainers.push(null);
      }
    });

    // 无二级的一级分类（平铺）
    if (singles.length > 0) {
      const singleCards = singles.map((item) =>
        isTagMode ? renderTagParentCard(item, false) : renderCategoryParentCard(item, false)
      );
      
      if (isTagMode) {
        parentCards.push(
          <div key="singles" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {singleCards}
          </div>
        );
        childContainers.push(null);
      } else {
        parentCards.push(
          <div key="singles" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {singleCards}
          </div>
        );
        childContainers.push(null);
      }
    }

    // 未分组的二级标签
    if (orphans.length > 0 && isTagMode) {
      parentCards.push(
        <div key="orphans" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {orphans.map((item) => renderTagChildCard(item))}
        </div>
      );
      childContainers.push(null);
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {parentCards.map((card, idx) => (
          <div key={idx}>
            {card}
            {childContainers[idx]}
          </div>
        ))}
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
      width={420}
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