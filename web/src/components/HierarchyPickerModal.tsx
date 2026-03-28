import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from 'antd';

type HierarchyItem = {
  id: string;
  name: string;
  parent_id?: string;
  color?: string;
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

const cardStyle = {
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '10px 16px',
  cursor: 'pointer' as const,
  transition: 'all 0.2s ease',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '40px',
};

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

  // 判断是否为单选模式（点击二级分类即选中并关闭）
  const isSingleSelectMode = !multiple;

  // 切换选中状态
  const toggle = (id: string, isChild: boolean = false) => {
    if (multiple) {
      // 多选模式
      setDraftValue((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
    } else {
      // 单选模式
      if (isChild) {
        // 点击二级分类：直接选中并关闭
        setDraftValue([id]);
        onConfirm(id);
      } else {
        // 点击一级分类：展开/收起
        setExpandedParentId(expandedParentId === id ? null : id);
      }
    }
  };

  // 渲染一级分类卡片
  const renderParentCard = (item: HierarchyItem, isExpanded: boolean) => {
    const isSelected = draftValue.includes(item.id);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggle(item.id, false)}
        style={{
          ...cardStyle,
          background: isSelected ? 'rgba(22, 119, 255, 0.12)' : 'var(--bg-elevated)',
          border: isSelected ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-primary)',
        }}
      >
        {item.name}
        <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontSize: 12 }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>
    );
  };

  // 渲染二级分类卡片
  const renderChildCard = (item: HierarchyItem) => {
    const isSelected = draftValue.includes(item.id);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggle(item.id, true)}
        style={{
          ...cardStyle,
          background: isSelected ? 'rgba(22, 119, 255, 0.12)' : 'var(--bg-card)',
          border: isSelected ? '1.5px solid var(--accent-color)' : '1px solid var(--border-color)',
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--text-primary)',
        }}
      >
        {item.name}
      </button>
    );
  };

  // 渲染标签卡片（带颜色）
  const renderTagCard = (item: HierarchyItem) => {
    const isSelected = draftValue.includes(item.id);
    const tagColor = item.color || 'blue';
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggle(item.id, true)}
        style={{
          ...cardStyle,
          background: isSelected ? `${tagColor}20` : 'var(--bg-elevated)',
          border: isSelected ? `1.5px solid ${tagColor}` : '1px solid var(--border-color)',
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--text-primary)',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: tagColor,
          }}
        />
        {item.name}
      </button>
    );
  };

  // 判断是否为标签模式（通过检查是否有 color 字段或 items 的特征）
  const isTagMode = items.some((item) => item.color) || title.includes('标签');

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 有二级的一级分类 */}
        {groups.map(({ parent, children }) => (
          <div key={parent.id}>
            <div style={{ marginBottom: 8 }}>
              {renderParentCard(parent, expandedParentId === parent.id)}
            </div>
            {/* 展开的二级分类 */}
            {expandedParentId === parent.id && children.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '12px',
                  background: 'var(--bg-card)',
                  borderRadius: 12,
                  marginLeft: 0,
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {children.map((child) => isTagMode ? renderTagCard(child) : renderChildCard(child))}
              </div>
            )}
          </div>
        ))}

        {/* 无二级的一级分类 */}
        {singles.length > 0 && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {singles.map((item) => isTagMode ? renderTagCard(item) : renderParentCard(item, false))}
            </div>
          </div>
        )}

        {/* 未分组的二级分类（标签模式） */}
        {orphans.length > 0 && isTagMode && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {orphans.map((item) => renderTagCard(item))}
            </div>
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
      width={420}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ maxHeight: '50vh', overflowY: 'auto', paddingTop: 8 }}>
        {renderContent()}
      </div>
    </Modal>
  );
}