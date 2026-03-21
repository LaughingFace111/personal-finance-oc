import { lazy, Suspense, ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { getSession } from './auth/session';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const AssetDetailPage = lazy(() => import('./pages/AssetDetailPage'));
const AddTransactionPage = lazy(() => import('./pages/AddTransactionPage'));
const TransferPage = lazy(() => import('./pages/TransferPage'));
const OtherTransactionPage = lazy(() => import('./pages/OtherTransactionPage'));

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<div className='p-4'>Loading...</div>}>{node}</Suspense>;
}

// 简化的路由守卫：只需要检查是否登录
async function guard() {
  const session = await getSession();
  if (!session) {
    throw new Response('', { status: 302, headers: { Location: '/login' } });
  }
  return session;
}

export const router = createBrowserRouter([
  { path: '/login', element: withSuspense(<LoginPage />) },
  { path: '/', loader: () => guard(), element: withSuspense(<DashboardPage />) },
  { path: '/import', loader: () => guard(), element: withSuspense(<ImportPage />) },
  { path: '/assets/:assetId', loader: () => guard(), element: withSuspense(<AssetDetailPage />) },
  { path: '/add-transaction', loader: () => guard(), element: withSuspense(<AddTransactionPage />) },
  { path: '/transfer', loader: () => guard(), element: withSuspense(<TransferPage />) },
  { path: '/other', loader: () => guard(), element: withSuspense(<OtherTransactionPage />) },
  { path: '*', element: <Navigate to='/' replace /> }
]);
