// Cấu hình điều hướng dùng chung cho sidebar (AppShell) — nguồn duy nhất cho menu,
// title/breadcrumb trên topbar, và (dần dần) menu của các module nâng cấp sau này.
// Việc ẩn/hiện mục theo vai trò ở đây chỉ là UX — ranh giới bảo mật thật nằm ở API route
// (lib/auth.ts CAN, kiểm tra phía server) theo đúng nguyên tắc của dự án.
//
// Cấu trúc 11 cụm nghiệp vụ (M21 — xem docs/ke-hoach-appshell-full-ia-2026-07.md +
// docs/ke-hoach-ia-chi-tiet-2026-07.md) bám vòng đời dự án thay vì gom tuỳ tiện: mỗi
// cụm gộp các dashboard trong file mockup `xBossmockup.xlsx` (PM cung cấp). Mục có
// `href` = trang thật (đang chạy); mục thiếu `href` = dashboard mockup CHƯA có trang
// ("coming-soon") — hiện mờ + badge "Sắp có" trong sidebar (không phải link, xem
// AppHeader.tsx) để sidebar là "bản đồ lộ trình sống" thay vì chỉ ẩn khi chưa build.
// Cây là append-only: mỗi module M<x> hoàn thành chỉ cần thêm `href` vào đúng mục.
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FileText,
  CalendarRange,
  GanttChartSquare,
  CalendarClock,
  ClipboardList,
  ClipboardCheck,
  CheckSquare,
  Calculator,
  Package,
  Truck,
  CarFront,
  Wallet,
  Coins,
  Users,
  ShieldCheck,
  Upload,
  NotebookPen,
  FileSignature,
  FilePlus2,
  Receipt,
  Gavel,
  PencilRuler,
  Mail,
  FolderOpen,
  LandPlot,
  Wrench,
  ShieldAlert,
  MessagesSquare,
  AlertTriangle,
  FileCheck2,
  Landmark,
  Compass,
  HardHat,
  Leaf,
  Radar,
  Banknote,
  Umbrella,
  Scale,
  PackageCheck,
  Cog,
  Cpu,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type NavItem = {
  /** Bỏ trống = dashboard mockup chưa có trang thật ("coming-soon" — xem module đích ở comment). */
  href?: string;
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
    label: "Tổng quan & Báo cáo",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/report", label: "Báo cáo", icon: FileText },
    ],
  },
  {
    // Khởi động & tổ chức dự án (mockup: Khởi Động & Pháp Lý; Nhân Sự & Tổ Chức).
    label: "Khởi động & Tổ chức",
    items: [
      { href: "/users", label: "Tài khoản", icon: Users, roles: ["admin"] },
      { href: "/admin", label: "Phân công", icon: ShieldCheck, roles: ["admin", "pm"] },
      { label: "Khởi động & Pháp lý", icon: Landmark }, // M23
    ],
  },
  {
    // Thiết kế & Bản vẽ (mockup: Thiết Kế & BPTC; BIM-Shop-Drawing).
    label: "Thiết kế & Bản vẽ",
    items: [
      { href: "/drawings", label: "Bản vẽ", icon: PencilRuler },
      { label: "Thiết kế & Biện pháp thi công", icon: Compass }, // M08 mở rộng
    ],
  },
  {
    // Kế hoạch & Tiến độ (mockup: Tiến Độ tổng + theo hệ — xem thêm nhóm "Hệ thi công" động).
    label: "Kế hoạch & Tiến độ",
    items: [
      { href: "/timeline", label: "Timeline", icon: CalendarRange },
      { href: "/gantt", label: "Gantt", icon: GanttChartSquare },
      { href: "/lookahead", label: "Lookahead", icon: CalendarClock },
    ],
  },
  {
    // Đấu thầu & Nhà thầu phụ (mockup: Đấu Thầu & Chọn Thầu Phụ; NTP).
    label: "Đấu thầu & Nhà thầu phụ",
    items: [
      {
        href: "/tenders",
        label: "Đấu thầu",
        icon: Gavel,
        roles: ["admin", "pm", "engineer", "bch"],
      },
      { label: "Nhà thầu phụ", icon: HardHat }, // M15/M16 mở rộng (hồ sơ năng lực, đánh giá)
    ],
  },
  {
    // Vật tư & Thiết bị (mockup: Vật Tư; Thiết Bị & Máy Móc).
    label: "Vật tư & Thiết bị",
    items: [
      { href: "/boq", label: "BOQ", icon: Calculator },
      { href: "/materials", label: "Vật tư", icon: Package },
      { href: "/materials/purchase-orders", label: "Đơn đặt hàng", icon: Truck },
      { href: "/vehicles", label: "Xe ra vào", icon: CarFront },
      { href: "/equipment", label: "Thiết bị", icon: Wrench },
    ],
  },
  {
    // Thi công hiện trường (mockup: Hiện Trường — mặt bằng, nhật ký, nghiệm thu).
    label: "Thi công hiện trường",
    items: [
      { href: "/my-tasks", label: "Việc của tôi", icon: ClipboardList },
      { href: "/approvals", label: "Nghiệm thu", icon: CheckSquare },
      { href: "/diary", label: "Nhật ký", icon: NotebookPen },
      { href: "/work-fronts", label: "Mặt bằng", icon: LandPlot },
    ],
  },
  {
    // QA/QC + An toàn + Môi trường (mockup: Chất Lượng; An Toàn HSE & Rủi ro; Môi
    // Trường & Giấy Phép; Quan Hệ & Quan Trắc).
    label: "Chất lượng · An toàn · Môi trường",
    items: [
      { href: "/quality", label: "Chất lượng", icon: ClipboardCheck },
      {
        href: "/hse",
        label: "HSE",
        icon: ShieldAlert,
        roles: ["admin", "pm", "engineer", "subcon"],
      },
      {
        href: "/risks",
        label: "Rủi ro",
        icon: AlertTriangle,
        roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
      },
      { label: "Môi trường & Giấy phép", icon: Leaf }, // M25
      { label: "Quan hệ & Quan trắc", icon: Radar }, // M26
    ],
  },
  {
    // Chi phí, hợp đồng, tài chính (mockup: Chi Phí & Hợp Đồng; Tài Chính – Kế Toán;
    // Bảo Hiểm & Bảo Lãnh; Claim & Thay Đổi).
    label: "Chi phí · Hợp đồng · Tài chính",
    items: [
      { href: "/proposals", label: "Đề xuất & duyệt", icon: FileCheck2 },
      { href: "/payments", label: "Thanh toán", icon: Wallet },
      { href: "/costs", label: "Chi phí", icon: Coins, roles: ["admin", "pm", "bch"] },
      {
        href: "/contracts",
        label: "Hợp đồng",
        icon: FileSignature,
        roles: ["admin", "pm", "bch"],
      },
      {
        href: "/variations",
        label: "Phát sinh",
        icon: FilePlus2,
        roles: ["admin", "pm", "engineer", "bch"],
      },
      {
        href: "/payment-certs",
        label: "Thanh toán KL",
        icon: Receipt,
        roles: ["admin", "pm", "bch"],
      },
      { label: "Tài chính – Kế toán", icon: Banknote, roles: ["admin", "pm", "bch"] }, // M27
      { label: "Bảo hiểm & Bảo lãnh", icon: Umbrella, roles: ["admin", "pm", "bch"] }, // M28
      {
        label: "Claim & Thay đổi",
        icon: Scale,
        roles: ["admin", "pm", "engineer", "bch"],
      }, // M06/M19 mở rộng
    ],
  },
  {
    // Điều hành & Hồ sơ (mockup: Họp – Công Văn; Hồ Sơ).
    label: "Điều hành & Hồ sơ",
    items: [
      { href: "/meetings", label: "Họp", icon: MessagesSquare },
      {
        href: "/correspondences",
        label: "Công văn",
        icon: Mail,
        roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
      },
      { href: "/documents", label: "Hồ sơ dự án", icon: FolderOpen },
    ],
  },
  {
    // Bàn giao & Vận hành (mockup: Bàn Giao & Kết Thúc; Bảo Hành – Bảo Trì) — mới hoàn toàn.
    label: "Bàn giao & Vận hành",
    items: [
      { label: "Bàn giao & Kết thúc", icon: PackageCheck }, // M29
      { label: "Bảo hành – Bảo trì", icon: Cog }, // M30
    ],
  },
  {
    // Hệ thống: quản trị + cụm Công nghệ & Số hoá của mockup (gộp theo gợi ý tài liệu
    // để không phình số cụm — CDE/mobile/luồng duyệt đã có nền, xem M31).
    label: "Hệ thống",
    items: [
      { href: "/import", label: "Import Excel", icon: Upload, roles: ["admin", "pm"] },
      { label: "Chuyển đổi số & Công nghệ", icon: Cpu }, // M31
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Tìm mục nav khớp nhất với pathname hiện tại — dùng để suy ra title/breadcrumb topbar. */
export function findActiveNav(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  let best: { group: NavGroup; item: NavItem } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.href || !isNavItemActive(item, pathname)) continue;
      if (!best || item.href.length > best.item.href!.length) best = { group, item };
    }
  }
  return best;
}

export function canSeeNavItem(item: NavItem, role?: string): boolean {
  if (!item.roles) return true;
  return !!role && (item.roles as string[]).includes(role);
}
