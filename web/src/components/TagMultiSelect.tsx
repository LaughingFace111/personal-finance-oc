import { useMemo, useState } from 'react';

type TagId = string | number;
type Tag<T extends TagId> = { id: T; name: string; color: string };

export function TagMultiSelect<T extends TagId>({ allTags, value, onChange }: { allTags: Tag<T>[]; value: T[]; onChange: (v: T[]) => void }) {
  const selected = useMemo(() => new Set(value), [value]);
  const [keyword, setKeyword] = useState('');

  const filtered = allTags.filter(t => t.name.toLowerCase().includes(keyword.toLowerCase()));

  const toggle = (id: T) => {
    if (selected.has(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className='space-y-3'>
      <input
        className='h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
        placeholder='搜索标签（如：西双版纳自驾游）'
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
      />
      <div className='flex flex-wrap gap-2'>
        {filtered.map(tag => (
          <button
            type='button'
            key={tag.id}
            onClick={() => toggle(tag.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              selected.has(tag.id)
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-[var(--bg-card)] text-[var(--text-primary)] hover:brightness-95'
            }`}
            style={{ borderColor: selected.has(tag.id) ? '#3b82f6' : tag.color }}
          >
            #{tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}
