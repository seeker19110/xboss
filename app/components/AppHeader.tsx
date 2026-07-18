"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import NotificationBell from "@/app/components/NotificationBell";
import OfflineQueueBadge from "@/app/components/OfflineQueueBadge";
import ProjectSwitcher from "@/app/components/ProjectSwitcher";
import GlobalSearch from "@/app/components/GlobalSearch";
import ThemeToggle from "@/app/components/ThemeToggle";
import OnlineUsers from "@/app/components/OnlineUsers";
import { Modal } from "@/app/components/dialogs";
import { fetchMe } from "@/app/lib/me";
import {
  DASHBOARD_TREE,
  isNavItemActive,
  canSeeNavItem,
  findActiveNav,
  resolveVisibleTree,
  flattenDashboards,
  type DashNode,
  type DashCluster,
} from "@/app/lib/dashboardTree";
import { MODULES } from "@/lib/modules";

type Me = { id: number; name: string; email: string; role: string };

const SIDEBAR_KEY = "xboss_sidebar";
const NAV_OPEN_KEY = "xboss_nav_open";

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
  // Query string hiện tại — link sidebar phân biệt nhau bằng query (vd 5 loại bản vẽ
  // /drawings?kind=) cần path kèm query mới sáng đúng mục (xem isLeafActive).
  const [pathQuery, setPathQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Gập/mở dashboard có children (M21) — mặc định MỞ (không có bản ghi = true) nên
  // không ẩn link nào đang dùng; chỉ ẩn khi người dùng tự gập, nhớ localStorage.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  // Bật/tắt dashboard qua khu "Hiển thị AppShell" ở /admin (M21 PR3). Rỗng lúc đầu =
  // coi như mọi dashboard đều bật (tránh sidebar nhấp nháy ẩn/hiện lúc tải trang).
  const [navSettings, setNavSettings] = useState<Map<string, boolean>>(new Map());
  // Cờ tính năng theo dự án (M52 PR4) — module tắt thì ẩn nav của nó (đọc registry
  // lib/modules.ts + /api/feature-flags). Rỗng lúc đầu = coi như mọi module đều bật.
  const [featureFlags, setFeatureFlags] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    setPath(window.location.pathname);
    setPathQuery(window.location.search);
    fetchMe().then((u) => setMe(u));
    setCollapsed(document.documentElement.classList.contains("sidebar-collapsed"));
    // `cache: "no-store"` chỉ chặn cache HTTP của trình duyệt — service worker
    // (stale-while-revalidate cho mọi /api/* GET, xem public/sw.js) vẫn có thể trả
    // thẳng bản cache cũ trước khi kiểm request init, nên phải bust cache bằng query
    // param (pattern `fetchFresh` ở app/boq/page.tsx, app/drawings/page.tsx) để chắc
    // chắn đọc đúng nav_settings vừa ghi (vd ngay sau khi admin bật/tắt ở /admin).
    fetch(`/api/nav-settings?_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.settings && setNavSettings(new Map(Object.entries(data.settings))))
      .catch(() => {});
    fetch(`/api/feature-flags?_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.flags && setFeatureFlags(new Map(Object.entries(data.flags))))
      .catch(() => {});
    try {
      const raw = localStorage.getItem(NAV_OPEN_KEY);
      if (raw) setOpenMap(JSON.parse(raw));
    } catch {
      /* private mode / JSON hỏng — giữ mặc định mở hết */
    }
  }, []);

  function toggleDash(id: string, currentlyOpen: boolean) {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !currentlyOpen };
      try {
        localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }

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
  const navPath = path + pathQuery;
  const active = path ? findActiveNav(navPath) : undefined;
  const pageTitle = title ?? active?.item.label ?? "XBoss";
  const breadcrumbGroup =
    !title && active && active.cluster.label !== active.item.label
      ? active.cluster.label
      : undefined;

  // Lá thật (có href) hoặc dashboard mockup chưa có trang ("coming-soon" — thiếu href
  // VÀ không children): dùng chung cho cả dashboard cấp 3 đơn lẫn mục con cấp 4.
  function renderLeaf(item: DashNode) {
    const Icon = item.icon;
    if (!item.href) {
      return (
        <span
          key={item.label}
          aria-disabled="true"
          title={`${item.label} — sắp có`}
          className="flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg text-sm min-h-10 border-l-2 border-transparent text-zinc-400 select-none"
        >
          <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
          <span className="sidebar-label flex-1 truncate">{item.label}</span>
          <span className="sidebar-label shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300">
            Sắp có
          </span>
        </span>
      );
    }
    const itemActive = isNavItemActive(item, navPath);
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
        <span className="sidebar-label flex-1 truncate">{item.label}</span>
      </a>
    );
  }

  // Dashboard cấp 3: lá đơn (có href, render thẳng) hoặc nhóm (không href, có children
  // — flatten ngang hàng dưới cụm cha, không còn hàng tiêu đề/chevron riêng: cụm cha
  // (renderCluster) đã là accordion duy nhất ở cấp này).
  function renderDashboard(dash: DashNode) {
    if (!dash.children) return renderLeaf(dash);
    const visibleChildren = dash.children.filter((c) => canSeeNavItem(c, me?.role));
    if (visibleChildren.length === 0) return null;
    return (
      <div key={dash.id ?? dash.label} role="group" aria-label={dash.label}>
        {dash.id && (
          <a
            href={`/hub/${dash.id}`}
            title={`Tổng quan ${dash.label}`}
            aria-current={path === `/hub/${dash.id}` ? "page" : undefined}
            className={`flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg text-sm transition min-h-10 border-l-2 ${
              path === `/hub/${dash.id}`
                ? "bg-zinc-800 text-white font-medium border-emerald-400"
                : "text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent"
            }`}
          >
            <LayoutDashboard className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
            <span className="sidebar-label italic">Tổng quan</span>
          </a>
        )}
        {visibleChildren.map((child) => renderLeaf(child))}
      </div>
    );
  }

  function renderCluster(cluster: DashCluster) {
    // Vai trò + nav_settings đã lọc sẵn trong resolveVisibleTree (visibleTree bên dưới).
    // Tiêu đề cụm gập/mở được cả nhóm, cùng cơ chế với hàng tiêu đề dashboard
    // (renderDashboard) — dùng chung toggleDash/openMap, khoá riêng theo "cluster:<label>".
    const id = `cluster:${cluster.label}`;
    const containsActive = cluster.dashboards.some((dash) => isNavItemActive(dash, navPath));
    const open = collapsed || containsActive || (openMap[id] ?? true);
    return (
      <div key={cluster.label} className="mb-3">
        {collapsed ? (
          // Thu gọn sidebar (icon-only): luôn mở — không có chỗ hiện chevron/nhãn để
          // gập riêng, ẩn hẳn con sẽ làm mất link (giống lý do ở renderDashboard).
          <div className="sidebar-label px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {cluster.label}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => toggleDash(id, open)}
            aria-expanded={open}
            title={cluster.label}
            className="w-full flex items-center gap-1.5 mx-2 mb-1 px-2.5 py-1.5 rounded-lg text-left min-h-10 hover:bg-zinc-900/60 transition"
          >
            <span className="flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {cluster.label}
            </span>
            <ChevronDown
              className={`w-3 h-3 shrink-0 text-zinc-500 transition-transform ${open ? "" : "-rotate-90"}`}
            />
          </button>
        )}
        {open && cluster.dashboards.map((dash) => renderDashboard(dash))}
      </div>
    );
  }

  // M52 PR4: module tắt (feature_flags) → ẩn thêm nav của module đó, cộng dồn lên trên
  // nav_settings (M21 PR3). Khớp theo `href` — MODULES.nav được giữ đồng bộ với các
  // dashboard cấp 3 thật trong DASHBOARD_TREE (xem ghi chú lib/modules.ts).
  const disabledModuleHrefs = new Set(
    MODULES.filter((m) => featureFlags.get(m.key) === false).flatMap((m) =>
      m.nav.map((n) => n.href),
    ),
  );
  const effectiveNavSettings = new Map(navSettings);
  if (disabledModuleHrefs.size > 0) {
    for (const { dashboard } of flattenDashboards()) {
      if (dashboard.id && dashboard.href && disabledModuleHrefs.has(dashboard.href)) {
        effectiveNavSettings.set(dashboard.id, false);
      }
    }
  }

  // Cây đã lọc theo vai trò + bật/tắt admin (M21 PR3) + cờ tính năng (M52 PR4) — nguồn
  // duy nhất để render sidebar.
  const visibleTree = resolveVisibleTree(DASHBOARD_TREE, me?.role, effectiveNavSettings);

  // Nội dung điều hướng dùng chung cho cả sidebar desktop lẫn drawer mobile.
  function renderNav() {
    return (
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2" aria-label="Điều hướng chính">
        {visibleTree.map(renderCluster)}
      </nav>
    );
  }

  return (
    <>
      {/* ── Sidebar desktop: cố định, thu gọn được ──
          Chiều rộng/ẩn nhãn khi thu gọn do CSS đảm nhiệm (xem #app-sidebar, .sidebar-label
          trong globals.css). Luôn mount (ẩn dưới lg bằng `hidden lg:flex`) — không phải
          overlay/dismissible nên không cần Modal (không có backdrop/Escape). */}
      <aside
        id="app-sidebar"
        className="hidden lg:flex fixed inset-y-0 left-0 z-50 flex-col w-64 bg-zinc-950 border-r border-zinc-800 safe-top print:hidden"
      >
        <div className="flex items-center h-12 px-1 shrink-0">
          <div className="flex-1 min-w-0">
            <ProjectSwitcher collapsed={collapsed} />
          </div>
        </div>

        {renderNav()}

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          className="flex items-center gap-2.5 px-2.5 py-2.5 mx-2 mb-2 rounded-lg text-xs min-h-10 text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-t border-zinc-800 shrink-0"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
          )}
          <span className="sidebar-label">Thu gọn</span>
        </button>
      </aside>

      {/* ── Drawer mobile: dùng Modal chung (backdrop/Escape/focus-trap/khoá scroll có sẵn)
          thay vì tự dựng overlay + bẫy focus thủ công. */}
      {mobileOpen && (
        <Modal
          id="app-sidebar-mobile"
          onClose={() => setMobileOpen(false)}
          drawer
          className="w-64 lg:hidden flex flex-col"
        >
          <div className="flex items-center h-12 px-1 shrink-0">
            <div className="flex-1 min-w-0">
              <ProjectSwitcher collapsed={false} />
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Đóng menu"
              className="ml-1 mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {renderNav()}
        </Modal>
      )}

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-30 bg-zinc-950 border-b border-zinc-800 safe-top print:hidden">
        <div className="flex items-center gap-2 px-3 sm:px-6 h-12 min-w-0">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Mở menu"
            className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 lg:hidden shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold truncate flex items-center gap-1.5">
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
            <OfflineQueueBadge />
            <ThemeToggle />
            <OnlineUsers isAdmin={me?.role === "admin"} />
            <NotificationBell />
            {me && (
              <a
                href="/account"
                title="Tài khoản"
                aria-label={`Tài khoản — ${me.name}`}
                className="flex items-center gap-1.5 ml-1 pl-2 min-h-[44px] border-l border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"
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
