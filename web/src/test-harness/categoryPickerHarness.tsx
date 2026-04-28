import React from 'react';
import ReactDOM from 'react-dom/client';
import { HierarchyPickerModal } from '../components/HierarchyPickerModal';

const items = [
  { id: 'food', name: '餐饮', icon: '🍜', category_type: 'expense' },
  { id: 'food-breakfast', name: '早餐', parent_id: 'food', category_type: 'expense' },
  { id: 'food-dinner', name: '晚餐', parent_id: 'food', category_type: 'expense' },
  { id: 'transport', name: '交通', icon: '🚌', category_type: 'expense' },
  { id: 'transport-subway', name: '地铁', parent_id: 'transport', category_type: 'expense' },
  { id: 'transport-taxi', name: '打车', parent_id: 'transport', category_type: 'expense' },
  { id: 'housing', name: '住房', icon: '🏠', category_type: 'expense' },
] as const;

function Harness() {
  const [value, setValue] = React.useState('');
  const [open, setOpen] = React.useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        padding: 24,
        ['--accent-color' as string]: '#2563eb',
        ['--border-color' as string]: '#d1d5db',
        ['--border-light' as string]: '#e5e7eb',
        ['--bg-card' as string]: '#ffffff',
        ['--bg-elevated' as string]: '#f9fafb',
        ['--text-primary' as string]: '#111827',
        ['--text-secondary' as string]: '#4b5563',
        ['--text-tertiary' as string]: '#6b7280',
      }}
    >
      <div data-testid="selected-value">{value || '未选择'}</div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ marginTop: 16, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
      >
        打开分类选择器
      </button>
      <HierarchyPickerModal
        open={open}
        title="选择类别"
        items={[...items]}
        value={value}
        emptyText="暂无可选类别"
        onCancel={() => setOpen(false)}
        onConfirm={(nextValue) => {
          setValue(typeof nextValue === 'string' ? nextValue : nextValue[0] ?? '');
          setOpen(false);
        }}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
