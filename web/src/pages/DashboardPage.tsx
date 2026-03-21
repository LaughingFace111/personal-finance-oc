import { MonthlyBarChart } from '../charts/MonthlyBarChart';
import { CategoryPieChart } from '../charts/CategoryPieChart';
import { ResponsiveEntryForm } from '../components/ResponsiveEntryForm';
import { FABMenu } from '../components/FABMenu';

export default function DashboardPage() {
  return (
    <main className='space-y-4 p-4'>
      <ResponsiveEntryForm />
      <section className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <MonthlyBarChart months={['1月', '2月', '3月']} income={[10000, 9800, 12000]} expense={[6200, 7000, 6500]} />
        <CategoryPieChart data={[{ name: '餐饮', value: 1800 }, { name: '交通', value: 900 }, { name: '购物', value: 1300 }]} />
      </section>
      <FABMenu />
    </main>
  );
}
