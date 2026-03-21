import ReactECharts from 'echarts-for-react';

export function CategoryPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ReactECharts
      style={{ height: 320 }}
      option={{
        tooltip: { trigger: 'item' },
        series: [{ type: 'pie', radius: '60%', data, emphasis: { itemStyle: { shadowBlur: 16 } } }]
      }}
    />
  );
}
