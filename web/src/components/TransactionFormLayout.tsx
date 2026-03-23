import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export const transactionFormLabelClass = 'mb-2 block text-sm font-medium text-[var(--text-secondary)]';
export const transactionFormFieldClass =
  'h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-color)] focus:ring-4 focus:ring-[rgba(22,119,255,0.15)]';
export const transactionFormTextareaClass = `${transactionFormFieldClass} min-h-[104px] py-3`;
export const transactionFormPrimaryButtonClass =
  'w-full rounded-xl bg-[var(--accent-color)] py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60';
export const transactionFormSectionClass = 'space-y-4';

export function transactionFormToggleClass(active: boolean) {
  return `rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
    active
      ? 'bg-blue-500 text-white shadow-sm'
      : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
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
    <div className="min-h-screen px-4 py-5" style={{ background: 'var(--bg-page)' }}>
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-3">
          {showBackButton ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="返回"
              className="flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition"
              style={{
                borderColor: 'var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="text-xl leading-none">←</span>
            </button>
          ) : onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="打开导航"
              className="flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition"
              style={{
                borderColor: 'var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="text-xl leading-none">☰</span>
            </button>
          ) : (
            <div className="w-11" />
          )}
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{pageTitle}</h1>
        </div>

        <div
          className="rounded-[28px] border p-5 shadow-sm sm:p-6"
          style={{
            borderColor: 'var(--border-color)',
            background: 'var(--bg-card)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {cardTitle && (
            <div className="border-b pb-4" style={{ borderColor: 'var(--border-light)' }}>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">{cardTitle}</h2>
            </div>
          )}
          <div className={cardTitle ? 'pt-5' : ''}>{children}</div>
        </div>
      </div>
    </div>
  );
}
