import React from 'react';
import ReactDOM from 'react-dom/client';
import { TagMultiSelect } from '../components/TagMultiSelect';

const tags = [
  { id: 'groceries', name: '买菜', color: '#16a34a' },
  { id: 'breakfast', name: '早餐', parent_id: 'groceries', color: '#f97316' },
  { id: 'dinner', name: '晚餐', parent_id: 'groceries', color: '#f97316' },
  { id: 'transport', name: '交通', color: '#2563eb' },
  { id: 'subway', name: '地铁', parent_id: 'transport', color: '#dc2626' },
  { id: 'taxi', name: '打车', parent_id: 'transport', color: '#dc2626' },
  { id: 'fun', name: '娱乐', color: '#db2777' },
  { id: 'movie', name: '电影', parent_id: 'fun', color: '#111827' },
] as const;

const frequentTags = [
  { id: 'breakfast', name: '早餐', parent_id: 'groceries', color: '#16a34a', usage_count: 8 },
  { id: 'taxi', name: '打车', parent_id: 'transport', color: '#2563eb', usage_count: 5 },
] as const;

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

  if (url.includes('/api/tags/frequent')) {
    return new Response(JSON.stringify(frequentTags), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/api/tags/first-level')) {
    return new Response(
      JSON.stringify(tags.filter((tag) => !('parent_id' in tag)).map(({ id, name, color }) => ({ id, name, color }))),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (url.endsWith('/api/tags') && (init?.method || 'GET').toUpperCase() === 'POST') {
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    return new Response(
      JSON.stringify({
        id: `created-${payload.name}`,
        name: payload.name,
        parent_id: payload.parent_id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return originalFetch(input, init);
};

function Harness() {
  const [value, setValue] = React.useState<string[]>([]);

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
      <div data-testid="selected-tags">{value.join(',') || '未选择'}</div>
      <div style={{ marginTop: 16, maxWidth: 420 }}>
        <TagMultiSelect
          tags={[...tags]}
          value={value}
          onChange={setValue}
          bookId="book-harness"
          placeholder="点击选择标签"
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>
);
