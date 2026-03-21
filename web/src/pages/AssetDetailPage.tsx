import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

type AssetPayload = {
  asset: { name: string; assetType: string; purchaseDate: string; purchaseCost: string; status: string };
  totalSpend: string;
  transactions: { id: number; happened_at: string; amount: string; memo: string }[];
};

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const [data, setData] = useState<AssetPayload | null>(null);

  useEffect(() => {
    fetch(`/api/assets/${assetId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(setData);
  }, [assetId]);

  if (!data) return <div className='p-4'>加载中...</div>;

  return (
    <main className='space-y-4 p-4'>
      <section className='rounded-xl bg-white p-4 shadow'>
        <h1 className='text-xl font-semibold'>{data.asset.name}</h1>
        <p>类型：{data.asset.assetType} ｜ 购入成本：¥{data.asset.purchaseCost} ｜ 状态：{data.asset.status}</p>
        <p>累计关联投入：¥{data.totalSpend}</p>
      </section>

      <section className='rounded-xl bg-white p-4 shadow'>
        <h2 className='mb-2 font-medium'>生命周期关联花费明细</h2>
        <div className='space-y-2'>
          {data.transactions.map(tx => (
            <div key={tx.id} className='flex items-center justify-between rounded border p-2'>
              <span>{new Date(tx.happened_at).toLocaleDateString()} · {tx.memo || '无备注'}</span>
              <span>¥{tx.amount}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
