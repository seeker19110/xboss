"use client";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, ClipboardList, Package, CheckSquare } from "lucide-react";
import NotificationBell from "@/app/components/NotificationBell";
import GlobalSearch from "@/app/components/GlobalSearch";
import ThemeToggle from "@/app/components/ThemeToggle";
import EditableText from "@/app/components/EditableText";
import OnlineUsers from "@/app/components/OnlineUsers";
import { fetchMe } from "@/app/lib/me";

type Me = { id: number; name: string; email: string; role: string };

const NAV = [
  {
    href: "/",
    tkey: "nav.dashboard",
    label: "ACMV",
    icon: LayoutDashboard,
    color: "text-emerald-400",
  },
  {
    href: "/my-tasks",
    tkey: "nav.my_tasks",
    label: "Việc của tôi",
    icon: ClipboardList,
    color: "text-violet-400",
  },
  {
    href: "/materials",
    tkey: "nav.materials",
    label: "Vật tư",
    icon: Package,
    color: "text-sky-400",
  },
  {
    href: "/approvals",
    tkey: "nav.approvals",
    label: "Nghiệm thu",
    icon: CheckSquare,
    color: "text-teal-400",
  },
];

export default function AppHeader({
  title,
  subtitle,
  children,
  search = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean; // giữ prop để không vỡ trang gọi cũ — không dùng nữa
  search?: boolean;
  children?: ReactNode;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [path, setPath] = useState("");

  useEffect(() => {
    setPath(window.location.pathname);
    fetchMe().then((u) => setMe(u));
  }, []);

  // Thanh cố định dưới đáy không chiếm chỗ trong flow — gắn class lên <body>
  // để globals.css chừa padding-bottom cho nội dung không bị che.
  useEffect(() => {
    document.body.classList.add("has-bottom-nav");
    if (search) document.body.classList.add("has-bottom-search");
    return () => document.body.classList.remove("has-bottom-nav", "has-bottom-search");
  }, [search]);

  return (
    <header className="fixed bottom-0 inset-x-0 z-40 bg-zinc-950 border-t border-zinc-800 safe-bottom print:hidden">
      {/* Mobile: search hàng riêng phía trên nav */}
      {search && (
        <div className="sm:hidden px-3 pt-2 pb-1">
          <GlobalSearch dropUp />
        </div>
      )}

      {/* Hàng duy nhất: nav · [title trang con] · controls */}
      <div className="flex items-center gap-1 px-3 h-12 min-w-0">
        {/* Nav chính — cuộn ngang khi chật, ẩn label trên mobile */}
        <nav
          className="flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          aria-label="Điều hướng chính"
        >
          {NAV.map((n) => {
            const active = path === n.href || (n.href !== "/" && path.startsWith(n.href));
            const Icon = n.icon;
            return (
              <a
                key={n.href}
                href={n.href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition ${
                  active
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={`w-4 h-4 shrink-0 ${n.color}`} />
                <span className="hidden sm:inline">
                  <EditableText tkey={n.tkey}>{n.label}</EditableText>
                </span>
              </a>
            );
          })}
        </nav>

        {/* Tiêu đề trang con (tracking, admin…) */}
        {title && (
          <div className="min-w-0 flex-1 px-2 border-l border-zinc-800 ml-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1.5">{title}</div>
            {subtitle && (
              <p className="text-[11px] text-zinc-400 truncate leading-none">{subtitle}</p>
            )}
          </div>
        )}

        {/* Spacer khi không có title */}
        {!title && <div className="flex-1 min-w-0" />}

        {/* Controls bên phải */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {search && (
            <div className="hidden sm:block w-52 lg:w-72">
              <GlobalSearch dropUp />
            </div>
          )}
          {children}
          <ThemeToggle dropUp />
          <OnlineUsers isAdmin={me?.role === "admin"} dropUp />
          <NotificationBell dropUp />
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
  );
}
