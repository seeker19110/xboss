// Cấu hình điều hướng dùng chung cho sidebar (AppShell) — nguồn duy nhất cho menu,
// title/breadcrumb trên topbar, và (dần dần) menu của các module nâng cấp sau này.
// Việc ẩn/hiện mục theo vai trò ở đây chỉ là UX — ranh giới bảo mật thật nằm ở API route
// (lib/auth.ts CAN, kiểm tra phía server) theo đúng nguyên tắc của dự án.
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FileText,
  CalendarRange,
  GanttChartSquare,
  CalendarClock,
  ClipboardList,
  CheckSquare,
  Package,
  Truck,
  Wallet,
  Users,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mặc định: active khi pathname === href hoặc bắt đầu bằng href + "/". */
  exact?: boolean;
  /** Bỏ trống = mọi vai trò đều thấy. */
  roles?: Role[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/report", label: "Báo cáo", icon: FileText },
      { href: "/timeline", label: "Timeline", icon: CalendarRange },
      { href: "/gantt", label: "Gantt", icon: GanttChartSquare },
      { href: "/lookahead", label: "Lookahead", icon: CalendarClock },
    ],
  },
  {
    label: "Thi công",
    items: [
      { href: "/my-tasks", label: "Việc của tôi", icon: ClipboardList },
      { href: "/approvals", label: "Nghiệm thu", icon: CheckSquare },
    ],
  },
  {
    label: "Vật tư & mua sắm",
    items: [
      { href: "/materials", label: "Vật tư", icon: Package },
      { href: "/materials/purchase-orders", label: "Đơn đặt hàng", icon: Truck },
    ],
  },
  {
    label: "Tiền",
    items: [{ href: "/payments", label: "Thanh toán", icon: Wallet }],
  },
  {
    label: "Quản trị",
    items: [
      { href: "/users", label: "Tài khoản", icon: Users, roles: ["admin"] },
      { href: "/admin", label: "Phân công", icon: ShieldCheck, roles: ["admin", "pm"] },
      { href: "/import", label: "Import Excel", icon: Upload, roles: ["admin", "pm"] },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Tìm mục nav khớp nhất với pathname hiện tại — dùng để suy ra title/breadcrumb topbar. */
export function findActiveNav(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  let best: { group: NavGroup; item: NavItem } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!isNavItemActive(item, pathname)) continue;
      if (!best || item.href.length > best.item.href.length) best = { group, item };
    }
  }
  return best;
}

export function canSeeNavItem(item: NavItem, role?: string): boolean {
  if (!item.roles) return true;
  return !!role && (item.roles as string[]).includes(role);
}
