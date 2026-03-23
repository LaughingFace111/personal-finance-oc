import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'antd';

type HierarchyItem = {
  id: string;
  name: string;
  parent_id?: string;
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

const sectionTitleStyle = {
  marginBottom: '10px',
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-tertiary)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

const groupCardStyle = {
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  background: 'var(--bg-elevated)',
  overflow: 'hidden',
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

  useEffect(() => {
    if (!open) return;
    setDraftValue(Array.isArray(value) ? value : value ? [value] : []);
  }, [open, value]);

  const sections = useMemo(() => {
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

  const selectedSet = useMemo(() => new Set(draftValue), [draftValue]);

  const toggle = (id: string) => {
    if (multiple) {
      setDraftValue((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
      return;
    }
    setDraftValue([id]);
  };

  const renderOption = (item: HierarchyItem, depth: 1 | 2 = 1) => {
    const selected = selectedSet.has(item.id);

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggle(item.id)}
        style={{
          width: '100%',
          border: 'none',
          borderTop: depth === 2 ? '1px solid var(--border-light)' : undefined,
          background: selected ? 'rgba(22, 119, 255, 0.12)' : 'transparent',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: depth === 1 ? '14px 16px' : '12px 16px 12px 28px',
          textAlign: 'left' as const,
          transition: 'background 0.2s ease',
        }}
      >
        <span style={{ fontSize: depth === 1 ? '15px' : '14px', fontWeight: depth === 1 ? 600 : 500 }}>
          {item.name}
        </span>
        <span
          style={{
            minWidth: '22px',
            height: '22px',
            borderRadius: '999px',
            border: `1px solid ${selected ? 'var(--accent-color)' : 'var(--border-color)'}`,
            background: selected ? 'var(--accent-color)' : 'transparent',
            color: selected ? '#fff' : 'transparent',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✓
        </span>
      </button>
    );
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={() => onConfirm(multiple ? draftValue : draftValue[0] || '')}
      okText="确定"
      cancelText="取消"
    >
      <div style={{ display: 'flex', maxHeight: '60vh', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingTop: '8px' }}>
        {sections.groups.length === 0 && sections.singles.length === 0 && sections.orphans.length === 0 ? (
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
        ) : null}

        {sections.groups.length > 0 ? (
          <div>
            <div style={sectionTitleStyle}>一级 / 二级</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sections.groups.map(({ parent, children }) => (
                <div key={parent.id} style={groupCardStyle}>
                  {renderOption(parent, 1)}
                  {children.map((child) => renderOption(child, 2))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {sections.singles.length > 0 ? (
          <div>
            <div style={sectionTitleStyle}>一级</div>
            <div style={groupCardStyle}>{sections.singles.map((item) => renderOption(item, 1))}</div>
          </div>
        ) : null}

        {sections.orphans.length > 0 ? (
          <div>
            <div style={sectionTitleStyle}>未分组二级</div>
            <div style={groupCardStyle}>{sections.orphans.map((item) => renderOption(item, 2))}</div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
