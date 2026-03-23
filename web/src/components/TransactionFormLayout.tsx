import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export const transactionFormLabelClass = 'mb-2 block text-sm font-medium text-slate-700';
export const transactionFormFieldClass =
  'w-full h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';
export const transactionFormTextareaClass = `${transactionFormFieldClass} min-h-[104px] py-3`;
export const transactionFormPrimaryButtonClass =
  'w-full rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60';
export const transactionFormSectionClass = 'space-y-4';

export function transactionFormToggleClass(active: boolean) {
  return `rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
    active
      ? 'bg-blue-500 text-white shadow-sm'
      : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
  }`;
}

interface TransactionFormLayoutProps {
  pageTitle: string;
  cardTitle?: string;
  showBackButton?: boolean;
  onMenuClick?: () => void;
  children: ReactNode;
}

export function TransactionFormLayout({
  pageTitle,
  cardTitle,
  showBackButton = true,
  onMenuClick,
  children,
}: TransactionFormLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-3">
          {showBackButton ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="返回"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              <span className="text-xl leading-none">←</span>
            </button>
          ) : onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="打开导航"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              <span className="text-xl leading-none">☰</span>
            </button>
          ) : (
            <div className="w-11" />
          )}
          <h1 className="text-lg font-semibold text-slate-900">{pageTitle}</h1>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {cardTitle && (
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-xl font-semibold text-slate-900">{cardTitle}</h2>
            </div>
          )}
          <div className={cardTitle ? 'pt-5' : ''}>{children}</div>
        </div>
      </div>
    </div>
  );
}
