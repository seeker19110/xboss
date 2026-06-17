'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Brain, CheckSquare, BarChart2, Home, Menu, X } from 'lucide-react';

const NAV = [
  { href: '/eng/hoc', label: 'Trang chủ', icon: Home },
  { href: '/eng/tu-vung', label: 'Từ vựng', icon: BookOpen },
  { href: '/eng/ngu-phap', label: 'Ngữ pháp', icon: Brain },
  { href: '/eng/kiem-tra', label: 'Kiểm tra', icon: CheckSquare },
  { href: '/eng/tien-do', label: 'Tiến độ', icon: BarChart2 },
];

export default function EngLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isPublic = pathname === '/eng' || pathname === '/eng/dang-nhap' || pathname === '/eng/dang-ky';

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-900/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/eng" className="flex items-center gap-2 font-bold text-indigo-400 text-lg">
            <span className="text-2xl">🇺🇸</span>
            <span>EnglishVN</span>
          </Link>

          {!isPublic && (
            <>
              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {NAV.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      pathname.startsWith(href)
                        ? 'bg-indigo-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                ))}
              </nav>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                aria-label="Menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          )}

          {isPublic && (
            <div className="flex items-center gap-2">
              <Link href="/eng/dang-nhap" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
                Đăng nhập
              </Link>
              <Link href="/eng/dang-ky" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
                Bắt đầu
              </Link>
            </div>
          )}
        </div>

        {/* Mobile nav dropdown */}
        {!isPublic && menuOpen && (
          <div className="md:hidden border-t border-zinc-800 bg-zinc-900 px-4 py-2">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      {/* Bottom nav for mobile (only logged-in pages) */}
      {!isPublic && (
        <nav className="md:hidden sticky bottom-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 safe-bottom">
          <div className="flex">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] transition-colors ${
                  pathname.startsWith(href)
                    ? 'text-indigo-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon size={20} strokeWidth={pathname.startsWith(href) ? 2.5 : 1.8} />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
