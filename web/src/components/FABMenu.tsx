import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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

export function FABMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  const handleItemClick = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

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
