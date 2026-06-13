'use client';
// Header dùng chung cho mọi trang: tiêu đề + điều khiển riêng của trang (children),
// cụm bên phải (tìm kiếm, chuông, user menu) và hàng nav cố định highlight trang hiện tại.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft, LayoutDashboard, ClipboardList, Package, CalendarRange,
  CheckSquare, CalendarClock, Users, KeyRound, LogOut, ShieldCheck,
} from 'lucide-react';
import NotificationBell from '@/app/components/NotificationBell';
import GlobalSearch from '@/app/components/GlobalSearch';
import ThemeToggle from '@/app/components/ThemeToggle';

type Me = { id: number; name: string; email: string; role: string };
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', pm: 'PM', engineer: 'Kỹ sư', subcon: 'Thầu phụ' };

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, color: 'text-emerald-400' },
  { href: '/my-tasks', label: 'Việc của tôi', icon: ClipboardList, color: 'text-violet-400' },
  { href: '/materials', label: 'Vật tư', icon: Package, color: 'text-sky-400' },
  { href: '/gantt', label: 'Gantt', icon: CalendarRange, color: 'text-amber-400' },
  { href: '/approvals', label: 'Nghiệm thu', icon: CheckSquare, color: 'text-teal-400' },
  { href: '/lookahead', label: 'Kế hoạch 2 tuần', icon: CalendarClock, color: 'text-rose-400' },
];

export default function AppHeader({ title, subtitle, back, children, search = true }: {
  title?: ReactNode; subtitle?: ReactNode;
  back?: boolean;          // hiện mũi tên về Dashboard (trang con)
  search?: boolean;        // ẩn GlobalSearch nếu trang chật chỗ
  children?: ReactNode;    // điều khiển riêng của trang (nút export, filter...)
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [path, setPath] = useState('');

  useEffect(() => {
    setPath(window.location.pathname);
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => setMe(j?.user ?? null));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="border-b border-zinc-800 print:hidden">
      {/* Hàng 1: tiêu đề + actions + user menu */}
      <div className="px-4 sm:px-6 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
        {back && <a href="/" aria-label="Về Dashboard" className="text-zinc-400 hover:text-white shrink-0"><ArrowLeft className="w-5 h-5" /></a>}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2 truncate">{title ?? '🏗️ XBoss'}</h1>
          {subtitle && <p className="text-xs text-zinc-400 truncate">{subtitle}</p>}
        </div>
        {/* Search ẩn trên mobile — hiện ở hàng 2 */}
        {search && <div className="hidden sm:block flex-1 max-w-md"><GlobalSearch /></div>}
        <div className="flex items-center gap-2 ml-auto sm:ml-0 shrink-0">
          {children}
          <ThemeToggle />
          <NotificationBell />
          {me && (
            <div className="flex items-center gap-2 ml-1 pl-3 border-l border-zinc-800">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-tight">{me.name}</p>
                <p className="text-xs text-emerald-400 leading-tight">{ROLE_LABEL[me.role] ?? me.role}</p>
              </div>
              {(me.role === 'admin' || me.role === 'pm') && (
                <a href="/admin" title="Quản trị — phân công công việc" aria-label="Quản trị"
                  className="text-zinc-400 hover:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="sr-only">Quản trị</span>
                </a>
              )}
              {me.role === 'admin' && (
                <a href="/users" title="Quản lý người dùng" aria-label="Quản lý người dùng"
                  className="text-zinc-400 hover:text-emerald-400">
                  <Users className="w-4 h-4" />
                  <span className="sr-only">Quản lý người dùng</span>
                </a>
              )}
              <a href="/password" title="Đổi mật khẩu" aria-label="Đổi mật khẩu"
                className="text-zinc-400 hover:text-amber-400">
                <KeyRound className="w-4 h-4" />
                <span className="sr-only">Đổi mật khẩu</span>
              </a>
              <button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"
                className="text-zinc-400 hover:text-red-400">
                <LogOut className="w-4 h-4" />
                <span className="sr-only">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Hàng 2 (mobile only): search */}
      {search && (
        <div className="sm:hidden px-4 pb-2">
          <GlobalSearch />
        </div>
      )}
      {/* Hàng nav: scroll ngang + fade báo hiệu có thêm mục */}
      <div className="relative">
        <nav className="px-4 sm:px-6 pb-3 flex gap-1.5 overflow-x-auto scrollbar-none"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          aria-label="Điều hướng chính">
          {NAV.map(n => {
            const active = path === n.href;
            const Icon = n.icon;
            return (
              <a key={n.href} href={n.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition ${active
                  ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                aria-current={active ? 'page' : undefined}>
                <Icon className={`w-5 h-5 ${n.color}`} /> {n.label}
              </a>
            );
          })}
        </nav>
        {/* Fade báo hiệu còn mục bị cắt bên phải */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-8 bg-gradient-to-l from-zinc-950 to-transparent sm:hidden" aria-hidden />
      </div>
    </header>
  );
}
