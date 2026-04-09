import { useEffect, useMemo, useState } from 'react';
import { Select, Tag } from 'antd';
import { TagCreateModal } from './TagCreateModal';

type TagId = string | number;
type Tag<T extends TagId> = {
  id: T;
  name: string;
  color?: string;
  parent_id?: T | string;
  is_active?: boolean;
};

interface TagMultiSelectProps<T extends TagId> {
  allTags: Tag<T>[];
  value: T[];
  onChange: (v: T[]) => void;
  bookId?: string | null;
  onTagsUpdated?: (tags: Tag<T>[]) => void;
  placeholder?: string;
}

export function TagMultiSelect<T extends TagId>({
  allTags,
  value,
  onChange,
  bookId = null,
  onTagsUpdated,
  placeholder = '搜索标签',
}: TagMultiSelectProps<T>) {
  const selected = useMemo(() => new Set(value), [value]);
  const [keyword, setKeyword] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [localTags, setLocalTags] = useState<Tag<T>[]>(allTags);

  useEffect(() => {
    setLocalTags(allTags);
  }, [allTags]);

  const tagMap = useMemo(() => new Map(localTags.map((tag) => [String(tag.id), tag])), [localTags]);
  const options = useMemo(() => {
    return localTags.map((tag) => {
      const parent = tag.parent_id
        ? localTags.find((item) => String(item.id) === String(tag.parent_id))
        : undefined;
      const label = parent ? `${parent.name} / ${tag.name}` : tag.name;
      return {
        value: tag.id,
        searchLabel: label.toLowerCase(),
        label,
        color: tag.color,
        isActive: tag.is_active !== false,
      };
    });
  }, [localTags]);

  const filteredOptions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return options;
    return options.filter((item) => item.searchLabel.includes(normalizedKeyword));
  }, [keyword, options]);

  return (
    <>
      <Select<T[]>
        mode="multiple"
        showSearch
        value={value}
        searchValue={keyword}
        placeholder={placeholder}
        className="w-full"
        style={{ width: '100%' }}
        optionFilterProp="label"
        filterOption={false}
        maxTagCount="responsive"
        onSearch={setKeyword}
        onBlur={() => setKeyword('')}
        onChange={(nextValue) => onChange(nextValue)}
        options={filteredOptions.map((tag) => ({
          value: tag.value,
          label: tag.label,
        }))}
        dropdownRender={(menu) => (
          <div>
            {menu}
            <div
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCreateModalOpen(true)}
              style={{
                position: 'sticky',
                bottom: 0,
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                padding: '10px 12px',
                color: 'var(--accent-color)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              + 新建标签
            </div>
          </div>
        )}
        optionRender={(option) => {
          const tag = filteredOptions.find((item) => String(item.value) === String(option.value));
          if (!tag) return <span>{String(option.label)}</span>;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color={tag.color || 'blue'} style={{ marginInlineEnd: 0, opacity: tag.isActive ? 1 : 0.6 }}>
                {tag.label}
              </Tag>
            </div>
          );
        }}
        tagRender={({ value: tagValue, closable, onClose }) => {
          const tag = tagMap.get(String(tagValue));
          const label = tag
            ? (() => {
                const parent = tag.parent_id
                  ? localTags.find((item) => String(item.id) === String(tag.parent_id))
                  : undefined;
                return parent ? `${parent.name} / ${tag.name}` : tag.name;
              })()
            : String(tagValue);

          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: '999px',
                border: `1px solid ${tag?.color || 'var(--border-color)'}`,
                background: tag?.color ? `${tag.color}1a` : 'var(--bg-card)',
                padding: '4px 10px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                marginInlineEnd: '6px',
                marginBlock: '2px',
              }}
            >
              {label}
              {closable ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onClose}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          );
        }}
      />

      <TagCreateModal
        open={createModalOpen}
        bookId={bookId}
        initialName={keyword.trim()}
        onCancel={() => setCreateModalOpen(false)}
        onCreated={(createdTag) => {
          const nextTag = {
            id: String(createdTag.id || createdTag.name) as T,
            name: createdTag.name,
            parent_id: createdTag.parent_id,
            color: createdTag.color,
          } as Tag<T>;
          const nextTags = [...localTags, nextTag];
          setLocalTags(nextTags);
          onTagsUpdated?.(nextTags);
          if (!selected.has(nextTag.id)) {
            onChange([...value, nextTag.id]);
          }
          setKeyword(createdTag.name);
          setCreateModalOpen(false);
        }}
      />
    </>
  );
}
