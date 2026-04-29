import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../services/api';
import { useAppStore } from '../stores/appStore';
import { CategoryOption, getDefaultBookId, loadTransactionFormData } from '../pages/transactionFormSupport';

interface MenuItem {
  label: string;
  icon: string;
  path: string;
  color: string;
}

const menuItems: MenuItem[] = [
  { label: '记录收入', icon: '💰', path: '/add-transaction?type=income', color: 'bg-green-500' },
  { label: '记录支出', icon: '💸', path: '/add-transaction?type=expense', color: 'bg-red-500' },
  { label: '记录转账', icon: '🔄', path: '/transfer', color: 'bg-blue-500' },
  { label: '其他', icon: '📋', path: '/other', color: 'bg-purple-500' },
];

interface TransactionTemplateRecord {
  id: string;
  name: string;
  transaction_type: 'income' | 'expense';
  category_id: string;
  amount?: string | number | null;
  is_active: boolean;
}

export function FABMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { showTemplateAmounts } = useAppStore();
  const [templates, setTemplates] = useState<TransactionTemplateRecord[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const loadQuickTemplates = async () => {
      const bookId = await getDefaultBookId();
      if (!bookId) return;

      const [templateData, formData] = await Promise.all([
        apiGet<TransactionTemplateRecord[]>(`/api/transaction-templates?book_id=${bookId}&is_active=true`),
        loadTransactionFormData(bookId),
      ]);

      setTemplates(templateData ?? []);
      setCategories(formData.categories);
    };

    void loadQuickTemplates();
  }, []);

  const handleItemClick = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* 菜单项 */}
      <div
        className={`mb-3 space-y-2 transition-all duration-300 ease-in-out ${
          isOpen ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        {menuItems.map((item, index) => (
          <button
            key={item.label}
            onClick={() => handleItemClick(item.path)}
            className={`flex min-w-[9.5rem] items-center justify-end gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:scale-105 hover:shadow-xl ${item.color}`}
            style={{
              transitionDelay: isOpen ? `${index * 50}ms` : '0ms',
            }}
          >
            <span>{item.label}</span>
            <span className="text-base">{item.icon}</span>
          </button>
        ))}
        {templates.map((template, index) => {
          const category = categoriesById.get(template.category_id);
          const amountText =
            showTemplateAmounts && template.amount != null ? ` · ¥${Number(template.amount).toFixed(2)}` : '';
          const path = `/add-transaction?type=${template.transaction_type}&template_id=${template.id}`;

          return (
            <button
              key={template.id}
              onClick={() => handleItemClick(path)}
              className="flex min-w-[12rem] items-center justify-between gap-3 rounded-full bg-slate-800/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:scale-105 hover:shadow-xl"
              style={{
                transitionDelay: isOpen ? `${(menuItems.length + index) * 50}ms` : '0ms',
              }}
            >
              <span className="truncate text-left">
                {category?.icon ? `${category.icon} ` : ''}
                {template.name}
                {amountText}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${template.transaction_type === 'income' ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'}`}>
                {template.transaction_type === 'income' ? '收入' : '支出'}
              </span>
            </button>
          );
        })}
      </div>

      {/* 主按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl ${
          isOpen ? 'rotate-45 bg-gray-600' : 'bg-indigo-500'
        }`}
      >
        {isOpen ? '✕' : '+'}
      </button>
    </div>
  );
}
