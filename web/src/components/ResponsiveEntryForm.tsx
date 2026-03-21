import { useState } from 'react';
import { TagMultiSelect } from './TagMultiSelect';

const mockTags = [
  { id: 1, name: '西双版纳自驾游', color: '#10b981' },
  { id: 2, name: '电脑硬件升级', color: '#3b82f6' },
  { id: 3, name: '帕萨特专项', color: '#f59e0b' }
];

export function ResponsiveEntryForm() {
  const [tagIds, setTagIds] = useState<number[]>([]);

  return (
    <form className='grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow md:grid-cols-2 xl:grid-cols-3'>
      <input className='rounded border p-2' placeholder='金额' />
      <input className='rounded border p-2' placeholder='账户' />
      <input className='rounded border p-2' placeholder='分类' />
      <input className='rounded border p-2' placeholder='绑定资产ID（可选）' />
      <div className='md:col-span-2 xl:col-span-3'>
        <TagMultiSelect allTags={mockTags} value={tagIds} onChange={setTagIds} />
      </div>
      <input className='rounded border p-2 md:col-span-2 xl:col-span-3' placeholder='备注' />
      <button className='rounded bg-indigo-600 p-2 text-white md:col-span-2 xl:col-span-1'>保存</button>
    </form>
  );
}
