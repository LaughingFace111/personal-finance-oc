import { useEffect, useMemo, useState } from 'react';
import { HierarchyPickerModal } from './HierarchyPickerModal';

export interface CategoryOption {
  id: string;
  name: string;
  category_type: string;
  parent_id?: string;
  color?: string;
  icon?: string;
}

/**
 * 🛡️ L: 标准分类选择器组件
 * 支持层级选择（父子联动）、Form.Item 受控模式
 */
export function CategorySelector({
  categories,
  value,
  onChange,
  bookId = null,
  onCategoriesUpdated,
  placeholder = "点击选择类别",
  allowClear = true,
}: {
  categories: CategoryOption[];
  value: string;
  onChange: (value: string) => void;
  bookId?: string | null;
  onCategoriesUpdated?: (nextCategories: CategoryOption[]) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [localCategories, setLocalCategories] = useState<CategoryOption[]>(categories);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);
  
  // 过滤有效分类（排除已删除或停用的）
  const validCategories = useMemo(() => 
    localCategories.filter(c => c.category_type !== 'income_expense'), 
    [localCategories]
  );
  
  // 获取选中分类的显示名称
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const cat = validCategories.find(c => c.id === value);
    return cat?.name || '';
  }, [value, validCategories]);

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className="flex h-11 cursor-pointer items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition hover:brightness-95"
        style={{
          color: selectedLabel ? 'var(--text-primary)' : 'var(--text-tertiary)'
        }}
      >
        {selectedLabel || placeholder}
        {allowClear && value && (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="ml-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            ×
          </span>
        )}
      </div>
      
      <HierarchyPickerModal
        open={modalOpen}
        title="选择类别"
        items={validCategories}
        value={value}
        emptyText="暂无可选类别"
        bookId={bookId}
        enableCreate={Boolean(bookId)}
        createButtonText="[+ 新建分类]"
        onItemsUpdated={(nextItems) => {
          setLocalCategories((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            (nextItems as CategoryOption[]).forEach((item) => merged.set(item.id, item));
            const nextCategories = Array.from(merged.values());
            onCategoriesUpdated?.(nextCategories);
            return nextCategories;
          });
        }}
        onCancel={() => setModalOpen(false)}
        onConfirm={(nextValue) => {
          onChange(typeof nextValue === 'string' ? nextValue : '');
          setModalOpen(false);
        }}
      />
    </>
  );
}
