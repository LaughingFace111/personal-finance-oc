import { useMemo, useState } from 'react';

type Tag = { id: number; name: string; color: string };

export function TagMultiSelect({ allTags, value, onChange }: { allTags: Tag[]; value: number[]; onChange: (v: number[]) => void }) {
  const selected = useMemo(() => new Set(value), [value]);
  const [keyword, setKeyword] = useState('');

  const filtered = allTags.filter(t => t.name.toLowerCase().includes(keyword.toLowerCase()));

  const toggle = (id: number) => {
    if (selected.has(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className='space-y-2'>
      <input
        className='w-full rounded border p-2'
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
            className={`rounded-full border px-3 py-1 text-sm ${selected.has(tag.id) ? 'bg-indigo-600 text-white' : 'bg-white'}`}
            style={{ borderColor: tag.color }}
          >
            #{tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}
