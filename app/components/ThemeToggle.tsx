'use client';
// Nút chuyển chế độ sáng/tối — mọi vai trò đều dùng được.
// Lựa chọn lưu trong localStorage('xboss_theme'), script trong layout đọc lại khi tải trang.
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    const el = document.documentElement;
    el.classList.remove('light', 'dark');
    el.classList.add(next);
    try { localStorage.setItem('xboss_theme', next); } catch { /* private mode */ }
    setTheme(next);
  }

  const label = theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
  return (
    <button onClick={toggle} title={label} aria-label={label}
      className="text-zinc-400 hover:text-amber-400 shrink-0">
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span className="sr-only">{label}</span>
    </button>
  );
}
