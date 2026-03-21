import ReactECharts from 'echarts-for-react';

export function MonthlyBarChart({ months, income, expense }: { months: string[]; income: number[]; expense: number[] }) {
  return (
    <ReactECharts
      style={{ height: 320 }}
      option={{
        tooltip: { trigger: 'axis' },
        legend: { data: ['收入', '支出'] },
        xAxis: { type: 'category', data: months },
        yAxis: { type: 'value' },
        series: [
          { name: '收入', type: 'bar', data: income },
          { name: '支出', type: 'bar', data: expense }
        ]
      }}
    />
  );
}
