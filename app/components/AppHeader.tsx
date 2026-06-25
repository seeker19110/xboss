'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, ClipboardList, Package,
  CheckSquare, Users, KeyRound, LogOut, ShieldCheck,
  Layers, DollarSign,
} from 'lucide-react';
import NotificationBell from '@/app/components/NotificationBell';
import GlobalSearch from '@/app/components/GlobalSearch';
import ThemeToggle from '@/app/components/ThemeToggle';
import EditableText from '@/app/components/EditableText';
import OnlineUsers from '@/app/components/OnlineUsers';
import { ROLE_LABELS } from '@/lib/roles';
import { fetchMe, invalidateMe } from '@/app/lib/me';

type Me = { id: number; name: string; email: string; role: string };
const ROLE_LABEL: Record<string, string> = ROLE_LABELS;

const NAV = [
  { href: '/', tkey: 'nav.dashboard', label: 'ACMV', icon: LayoutDashboard, color: 'text-emerald-400' },
  { href: '/my-tasks', tkey: 'nav.my_tasks', label: 'Việc của tôi', icon: ClipboardList, color: 'text-violet-400' },
  { href: '/materials', tkey: 'nav.materials', label: 'Vật tư', icon: Package, color: 'text-sky-400' },
  { href: '/approvals', tkey: 'nav.approvals', label: 'Nghiệm thu', icon: CheckSquare, color: 'text-teal-400' },
  { href: '/timeline', tkey: 'nav.timeline', label: 'Timeline tầng', icon: Layers, color: 'text-indigo-400' },
  { href: '/payments', tkey: 'nav.payments', label: 'Thanh toán', icon: DollarSign, color: 'text-emerald-400' },
];

export default function AppHeader({ title, subtitle, children, search = true }: {
  title?: ReactNode; subtitle?: ReactNode;
  back?: boolean;       // giữ prop để không vỡ trang gọi cũ — không dùng nữa
  search?: boolean;
  children?: ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [path, setPath] = useState('');

  useEffect(() => {
    setPath(window.location.pathname);
    fetchMe().then(u => setMe(u));
  }, []);

  async function logout() {
    invalidateMe();
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
    window.location.href = '/login';
  }

  return (
    <header className="border-b border-zinc-800 print:hidden">
      {/* Hàng duy nhất: brand · nav · [title trang con] · controls */}
      <div className="flex items-center gap-1 px-3 h-12 min-w-0">

        {/* Brand */}
        <Link href="/" className="shrink-0 flex items-center gap-1.5 mr-1 text-white hover:opacity-80">
          <span className="font-bold text-sm leading-none">XBoss</span>
        </Link>

        {/* Nav chính — cuộn ngang khi chật, ẩn label trên mobile */}
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none shrink-0"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          aria-label="Điều hướng chính">
          {NAV.map(n => {
            const active = path === n.href || (n.href !== '/' && path.startsWith(n.href));
            const Icon = n.icon;
            return (
              <a key={n.href} href={n.href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition ${active
                  ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                aria-current={active ? 'page' : undefined}>
                <Icon className={`w-4 h-4 shrink-0 ${n.color}`} />
                <span className="hidden sm:inline"><EditableText tkey={n.tkey}>{n.label}</EditableText></span>
              </a>
            );
          })}
        </nav>

        {/* Tiêu đề trang con (tracking, admin…) */}
        {title && (
          <div className="min-w-0 flex-1 px-2 border-l border-zinc-800 ml-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">{title}</div>
            {subtitle && <p className="text-[11px] text-zinc-400 truncate leading-none">{subtitle}</p>}
          </div>
        )}

        {/* Spacer khi không có title */}
        {!title && <div className="flex-1 min-w-0" />}

        {/* Controls bên phải */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {search && <div className="hidden sm:block w-52 lg:w-72"><GlobalSearch /></div>}
          {children}
          <ThemeToggle />
          <OnlineUsers isAdmin={me?.role === 'admin'} />
          <NotificationBell />
          {me && (
            <div className="flex items-center gap-0.5 ml-1 pl-2 border-l border-zinc-800">
              <div className="text-right hidden lg:block mr-1">
                <p className="text-xs font-medium leading-tight">{me.name}</p>
                <p className="text-[10px] text-emerald-400 leading-tight">{ROLE_LABEL[me.role] ?? me.role}</p>
              </div>
              {(me.role === 'admin' || me.role === 'pm') && (
                <a href="/admin" title="Quản trị" aria-label="Quản trị"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition">
                  <ShieldCheck className="w-4 h-4" />
                </a>
              )}
              {me.role === 'admin' && (
                <a href="/users" title="Quản lý người dùng" aria-label="Quản lý người dùng"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition">
                  <Users className="w-4 h-4" />
                </a>
              )}
              <a href="/password" title="Đổi mật khẩu" aria-label="Đổi mật khẩu"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition">
                <KeyRound className="w-4 h-4" />
              </a>
              <button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: search hàng 2 */}
      {search && (
        <div className="sm:hidden px-3 pb-2">
          <GlobalSearch />
        </div>
      )}
    </header>
  );
}
