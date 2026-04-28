import { useMemo, useState } from 'react';
import { HierarchyPickerModal } from './HierarchyPickerModal';
import { getHierarchyPathLabel } from '../utils/hierarchySelection';

type CategoryOption = {
  id: string;
  name: string;
  category_type: string;
  parent_id?: string;
  is_active?: boolean;
};

export function CategoryMultiSelect({
  categories,
  value,
  onChange,
  placeholder = '选择分类',
}: {
  categories: CategoryOption[];
  value: string[];
  onChange: (nextValue: string[]) => void;
  placeholder?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const selectedLabels = useMemo(
    () =>
      value
        .map((itemId) => getHierarchyPathLabel(categories, itemId))
        .filter(Boolean),
    [categories, value],
  );

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setModalOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setModalOpen(true);
          }
        }}
        style={{
          width: '100%',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          background: 'var(--bg-card)',
          padding: '12px 14px',
          cursor: 'pointer',
        }}
      >
        {selectedLabels.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>{placeholder}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {selectedLabels.map((label) => (
              <span
                key={label}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 999,
                  background: 'var(--bg-elevated)',
                  padding: '4px 10px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <HierarchyPickerModal
        open={modalOpen}
        title="选择分类"
        items={categories}
        value={value}
        multiple
        emptyText="暂无可选分类"
        onCancel={() => setModalOpen(false)}
        onConfirm={(nextValue) => {
          onChange(Array.isArray(nextValue) ? nextValue : []);
          setModalOpen(false);
        }}
      />
    </>
  );
}
