"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  ChevronRight,
} from "lucide-react";
import NotificationBell from "@/app/components/NotificationBell";
import GlobalSearch from "@/app/components/GlobalSearch";
import ThemeToggle from "@/app/components/ThemeToggle";
import OnlineUsers from "@/app/components/OnlineUsers";
import { fetchMe } from "@/app/lib/me";
import { NAV_GROUPS, isNavItemActive, canSeeNavItem, findActiveNav } from "@/app/lib/nav";

type Me = { id: number; name: string; email: string; role: string };

const SIDEBAR_KEY = "xboss_sidebar";

// AppShell: sidebar trái (thu gọn được, drawer trên mobile) + topbar mỏng hiển thị
// title/breadcrumb của mục đang chọn. Giữ nguyên props API cũ (title/subtitle/children/
// search/bottomActions) để mọi trang gọi AppHeader không phải sửa gì (M0 — xem
// docs/nang-cap/M00-khung-ui-sidebar.md).
//
// Trạng thái thu gọn desktop điều khiển bằng class `sidebar-collapsed` trên <html>
// (đặt bởi script beforeInteractive trong layout.tsx, giống cơ chế theme) — tránh
// giật layout lúc tải trang. State `collapsed` ở đây chỉ để đồng bộ icon nút bấm,
// không quyết định bố cục (bố cục do CSS trong globals.css đảm nhiệm).
export default function AppHeader({
  title,
  subtitle,
  children,
  search = true,
  bottomActions,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean; // giữ prop để không vỡ trang gọi cũ — không dùng nữa
  search?: boolean;
  children?: ReactNode;
  /** Nút hành động riêng của trang (vd Excel/PDF/Import) — hiển thị chung thanh cố định dưới đáy. */
  bottomActions?: ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [path, setPath] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname);
    fetchMe().then((u) => setMe(u));
    setCollapsed(document.documentElement.classList.contains("sidebar-collapsed"));
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle("sidebar-collapsed", next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  }

  const isHome = path === "/";
  const active = path ? findActiveNav(path) : undefined;
  const pageTitle = title ?? active?.item.label ?? "XBoss";
  const breadcrumbGroup =
    !title && active && active.group.label !== active.item.label ? active.group.label : undefined;

  return (
    <>
      {/* ── Sidebar (desktop: cố định thu gọn được · mobile: drawer off-canvas) ──
          Chiều rộng/ẩn nhãn khi thu gọn do CSS đảm nhiệm (xem #app-sidebar, .sidebar-label
          trong globals.css) — ở đây chỉ toggle-transform cho drawer mobile. */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-60 bg-zinc-950 border-r border-zinc-800 safe-top
          transition-transform duration-200 lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          print:hidden`}
      >
        <div className="flex items-center gap-2 h-12 px-3 border-b border-zinc-800 shrink-0">
          <LayoutDashboard className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="sidebar-label text-sm font-bold truncate">XBoss</span>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
            className="ml-auto p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 lg:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Điều hướng chính">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((it) => canSeeNavItem(it, me?.role));
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="mb-3">
                <div className="sidebar-label px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {group.label}
                </div>
                {items.map((item) => {
                  const itemActive = isNavItemActive(item, path);
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      aria-current={itemActive ? "page" : undefined}
                      className={`flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg text-sm transition min-h-10 border-l-2 ${
                        itemActive
                          ? "bg-zinc-800 text-white font-medium border-emerald-400"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent"
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                      <span className="sidebar-label">{item.label}</span>
                    </a>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          className="hidden lg:flex items-center gap-2.5 px-2.5 py-2.5 mx-2 mb-2 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-t border-zinc-800 shrink-0"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
          )}
          <span className="sidebar-label">Thu gọn</span>
        </button>
      </aside>

      {/* Overlay tối khi drawer mobile đang mở */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-30 bg-zinc-950 border-b border-zinc-800 safe-top print:hidden">
        <div className="flex items-center gap-2 px-3 sm:px-6 h-12 min-w-0">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Mở menu"
            className="p-1.5 -ml-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 lg:hidden shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">
              {breadcrumbGroup && (
                <>
                  <span className="text-zinc-400 font-normal hidden sm:inline">
                    {breadcrumbGroup}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:inline shrink-0" />
                </>
              )}
              <span className="inline-flex items-center gap-1.5 min-w-0 truncate">{pageTitle}</span>
            </div>
            {subtitle && (
              <p className="text-[11px] text-zinc-400 truncate leading-none">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1">
            {children}
            <ThemeToggle />
            <OnlineUsers isAdmin={me?.role === "admin"} />
            <NotificationBell />
            {me && (
              <a
                href="/account"
                title="Tài khoản"
                aria-label={`Tài khoản — ${me.name}`}
                className="flex items-center gap-1.5 ml-1 pl-2 border-l border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"
              >
                <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[11px] font-bold text-emerald-400 shrink-0">
                  {me.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="hidden lg:inline text-xs font-medium">{me.name}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Thanh cố định dưới đáy — chỉ hiện khi có nội dung: tìm kiếm chỉ ở trang chủ,
          hành động riêng của trang (Excel/PDF/Import…) ở trang có truyền bottomActions.
          .app-bottombar tự bù chiều rộng sidebar trên desktop (xem globals.css). */}
      {(isHome || bottomActions) && (
        <div className="app-bottombar fixed bottom-0 inset-x-0 z-30 bg-zinc-950 border-t border-zinc-800 safe-bottom print:hidden">
          <div className="flex items-center gap-2 px-3 sm:px-6 py-2 overflow-x-auto scrollbar-none">
            {search && isHome && (
              <div className="flex-1 min-w-[140px]">
                <GlobalSearch />
              </div>
            )}
            {bottomActions}
          </div>
        </div>
      )}
    </>
  );
}
