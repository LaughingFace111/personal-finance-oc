import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { FixedSizeList as List } from 'react-window';

type Row = { description: string; amount: string; happenedAt: string; categoryId?: number };

export function StagingImportTable() {
  const [rows, setRows] = useState<Row[]>([]);

  const categories = useMemo(() => [
    { id: 1, name: '餐饮美食' },
    { id: 2, name: '交通出行' },
    { id: 3, name: '居住物业' },
    { id: 4, name: '宠物开销' },
    { id: 5, name: '购物娱乐' }
  ], []);

  const onFile = (file: File) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => setRows(result.data)
    });
  };

  const submitAll = async () => {
    await fetch('/api/import/staging/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows })
    });
  };

  return (
    <div className='space-y-3'>
      <input type='file' accept='.csv' onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      <List height={420} width={'100%'} itemCount={rows.length} itemSize={54}>
        {({ index, style }) => {
          const row = rows[index];
          return (
            <div style={style} className='grid grid-cols-4 items-center gap-2 border-b px-2 text-sm'>
              <span>{row.description}</span>
              <span>{row.amount}</span>
              <span>{row.happenedAt}</span>
              <select
                value={row.categoryId ?? ''}
                onChange={e =>
                  setRows(prev => prev.map((r, i) => (i === index ? { ...r, categoryId: Number(e.target.value) } : r)))
                }
              >
                <option value=''>未分类</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          );
        }}
      </List>
      <button className='rounded bg-emerald-600 px-3 py-2 text-white' onClick={submitAll}>确认导入</button>
    </div>
  );
}
