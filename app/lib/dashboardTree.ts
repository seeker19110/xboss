// Cây điều hướng AppShell (M21 — xem docs/nang-cap/M21-appshell-ia.md +
// docs/ke-hoach-appshell-full-ia-2026-07.md). Nguồn DUY NHẤT cho sidebar, title/
// breadcrumb topbar — thay thế app/lib/nav.ts (chỉ 1 nơi import, đã gộp vào đây).
//
// Mô hình 2 tầng trong sidebar: Cụm nghiệp vụ (DashCluster, không bấm) → Dashboard
// (DashNode cấp 3). Dashboard có 2 dạng:
//   - Lá đơn (có `href`, không `children`): bấm vào = điều hướng thẳng (như cũ).
//   - Nhóm (không `href`, có `children`): hàng tiêu đề chỉ bấm để gập/mở — không phải
//     link — các trang con thật (cấp 4 rút gọn) nằm trong `children`, MẶC ĐỊNH MỞ nên
//     không ẩn link nào đang dùng (chỉ ẩn khi người dùng tự gập, nhớ localStorage).
// Dashboard mockup CHƯA có trang thật ("coming-soon"): thiếu `href` VÀ không có
// `children` → AppHeader render <span aria-disabled> + badge "Sắp có" (không phải
// link, không bấm được) — sidebar là "bản đồ lộ trình sống".
// Cây append-only: mỗi module M<x> hoàn thành chỉ đổi `status`/thêm `href` đúng node.
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

export type NavStatus = "available" | "coming-soon";

export type DashNode = {
  /** Bắt buộc cho node có `children` (khoá localStorage gập/mở) — tuỳ chọn cho lá. */
  id?: string;
  label: string;
  icon: LucideIcon;
  /** Có = lá thật (bấm điều hướng). Không có + không children = "coming-soon". */
  href?: string;
  exact?: boolean;
  /** Bỏ trống = mọi vai trò đều thấy (áp cho chính node; con lọc riêng). */
  roles?: Role[];
  /** Trang con thật (cấp 4 rút gọn) — node có children là HÀNG TIÊU ĐỀ, không phải link. */
  children?: DashNode[];
};

export type DashCluster = {
  label: string;
  dashboards: DashNode[];
};

export const DASHBOARD_TREE: DashCluster[] = [
  {
    label: "Tổng quan & Báo cáo",
    dashboards: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/report", label: "Báo cáo", icon: FileText },
    ],
  },
  {
    // Khởi động & tổ chức dự án (mockup: Khởi Động & Pháp Lý; Nhân Sự & Tổ Chức).
    label: "Khởi động & Tổ chức",
    dashboards: [
      {
        id: "dash.nhan-su",
        label: "Nhân sự & Tổ chức",
        icon: Users,
        children: [
          { href: "/users", label: "Tài khoản", icon: Users, roles: ["admin"] },
          { href: "/admin", label: "Phân công", icon: ShieldCheck, roles: ["admin", "pm"] },
        ],
      },
      { label: "Khởi động & Pháp lý", icon: Landmark }, // M23
    ],
  },
  {
    // Thiết kế & Bản vẽ (mockup: Thiết Kế & BPTC; BIM-Shop-Drawing).
    label: "Thiết kế & Bản vẽ",
    dashboards: [
      { href: "/drawings", label: "Bản vẽ", icon: PencilRuler },
      { label: "Thiết kế & Biện pháp thi công", icon: Compass }, // M08 mở rộng
    ],
  },
  {
    // Kế hoạch & Tiến độ (mockup: 1 dashboard "Tiến Độ" — Timeline/Gantt/Lookahead
    // là cấp 4 của nó, không phải 3 dashboard riêng).
    label: "Kế hoạch & Tiến độ",
    dashboards: [
      {
        id: "dash.tien-do",
        label: "Tiến độ",
        icon: CalendarRange,
        children: [
          { href: "/timeline", label: "Timeline", icon: CalendarRange },
          { href: "/gantt", label: "Gantt", icon: GanttChartSquare },
          { href: "/lookahead", label: "Lookahead", icon: CalendarClock },
        ],
      },
    ],
  },
  {
    // Đấu thầu & Nhà thầu phụ (mockup: Đấu Thầu & Chọn Thầu Phụ; NTP).
    label: "Đấu thầu & Nhà thầu phụ",
    dashboards: [
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
    // Vật tư & Thiết bị (mockup: 2 dashboard "Vật Tư" và "Thiết Bị & Máy Móc"). Dashboard
    // "Vật Tư" giữ 3 lá phẳng (không gộp nhóm) — gộp sẽ trùng nhãn "Vật tư" giữa hàng
    // tiêu đề nhóm và trang /materials chính của nó, rối cho người dùng.
    label: "Vật tư & Thiết bị",
    dashboards: [
      { href: "/boq", label: "BOQ", icon: Calculator },
      { href: "/materials", label: "Vật tư", icon: Package },
      { href: "/materials/purchase-orders", label: "Đơn đặt hàng", icon: Truck },
      {
        id: "dash.thiet-bi",
        label: "Thiết bị & Máy móc",
        icon: Wrench,
        children: [
          { href: "/equipment", label: "Thiết bị", icon: Wrench },
          { href: "/vehicles", label: "Xe ra vào", icon: CarFront },
        ],
      },
    ],
  },
  {
    // Thi công hiện trường (mockup: 1 dashboard "Hiện Trường").
    label: "Thi công hiện trường",
    dashboards: [
      {
        id: "dash.hien-truong",
        label: "Hiện trường",
        icon: LandPlot,
        children: [
          { href: "/my-tasks", label: "Việc của tôi", icon: ClipboardList },
          { href: "/approvals", label: "Nghiệm thu", icon: CheckSquare },
          { href: "/diary", label: "Nhật ký", icon: NotebookPen },
          { href: "/work-fronts", label: "Mặt bằng", icon: LandPlot },
        ],
      },
    ],
  },
  {
    // QA/QC + An toàn + Môi trường (mockup: Chất Lượng; An Toàn HSE & Rủi ro; Môi
    // Trường & Giấy Phép; Quan Hệ & Quan Trắc).
    label: "Chất lượng · An toàn · Môi trường",
    dashboards: [
      { href: "/quality", label: "Chất lượng", icon: ClipboardCheck },
      {
        id: "dash.an-toan",
        label: "An toàn – HSE & Rủi ro",
        icon: ShieldAlert,
        children: [
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
        ],
      },
      { label: "Môi trường & Giấy phép", icon: Leaf }, // M25
      { label: "Quan hệ & Quan trắc", icon: Radar }, // M26
    ],
  },
  {
    // Chi phí, hợp đồng, tài chính (mockup: Chi Phí & Hợp Đồng; Tài Chính – Kế Toán;
    // Bảo Hiểm & Bảo Lãnh; Claim & Thay Đổi).
    label: "Chi phí · Hợp đồng · Tài chính",
    dashboards: [
      {
        id: "dash.chi-phi-hop-dong",
        label: "Chi phí & Hợp đồng",
        icon: Coins,
        children: [
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
            href: "/payment-certs",
            label: "Thanh toán KL",
            icon: Receipt,
            roles: ["admin", "pm", "bch"],
          },
        ],
      },
      {
        id: "dash.claim",
        label: "Claim & Thay đổi",
        icon: Scale,
        children: [
          {
            href: "/variations",
            label: "Phát sinh",
            icon: FilePlus2,
            roles: ["admin", "pm", "engineer", "bch"],
          },
          {
            label: "Claim chi phí",
            icon: Scale,
            roles: ["admin", "pm", "engineer", "bch"],
          }, // M06/M19 mở rộng
        ],
      },
      { label: "Tài chính – Kế toán", icon: Banknote, roles: ["admin", "pm", "bch"] }, // M27
      { label: "Bảo hiểm & Bảo lãnh", icon: Umbrella, roles: ["admin", "pm", "bch"] }, // M28
    ],
  },
  {
    // Điều hành & Hồ sơ (mockup: Họp – Công Văn; Hồ Sơ).
    label: "Điều hành & Hồ sơ",
    dashboards: [
      {
        id: "dash.hop-cong-van",
        label: "Họp – Công văn",
        icon: MessagesSquare,
        children: [
          { href: "/meetings", label: "Họp", icon: MessagesSquare },
          {
            href: "/correspondences",
            label: "Công văn",
            icon: Mail,
            roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
          },
        ],
      },
      { href: "/documents", label: "Hồ sơ dự án", icon: FolderOpen },
    ],
  },
  {
    // Bàn giao & Vận hành (mockup: Bàn Giao & Kết Thúc; Bảo Hành – Bảo Trì) — mới hoàn toàn.
    label: "Bàn giao & Vận hành",
    dashboards: [
      { label: "Bàn giao & Kết thúc", icon: PackageCheck }, // M29
      { label: "Bảo hành – Bảo trì", icon: Cog }, // M30
    ],
  },
  {
    // Hệ thống: quản trị + cụm Công nghệ & Số hoá của mockup (gộp theo gợi ý tài liệu
    // để không phình số cụm — CDE/mobile/luồng duyệt đã có nền, xem M31).
    label: "Hệ thống",
    dashboards: [
      { href: "/import", label: "Import Excel", icon: Upload, roles: ["admin", "pm"] },
      { label: "Chuyển đổi số & Công nghệ", icon: Cpu }, // M31
    ],
  },
];

function isLeafActive(node: DashNode, pathname: string): boolean {
  if (!node.href) return false;
  if (node.exact) return pathname === node.href;
  return pathname === node.href || pathname.startsWith(node.href + "/");
}

export function isNavItemActive(node: DashNode, pathname: string): boolean {
  if (isLeafActive(node, pathname)) return true;
  return !!node.children?.some((c) => isNavItemActive(c, pathname));
}

/** Tìm lá khớp nhất với pathname hiện tại — dùng để suy ra title/breadcrumb topbar. */
export function findActiveNav(
  pathname: string,
): { cluster: DashCluster; dashboard: DashNode; item: DashNode } | undefined {
  let best: { cluster: DashCluster; dashboard: DashNode; item: DashNode } | undefined;
  for (const cluster of DASHBOARD_TREE) {
    for (const dashboard of cluster.dashboards) {
      const candidates = dashboard.children?.length ? dashboard.children : [dashboard];
      for (const item of candidates) {
        if (!isLeafActive(item, pathname)) continue;
        if (!best || item.href!.length > best.item.href!.length)
          best = { cluster, dashboard, item };
      }
    }
  }
  return best;
}

export function canSeeNavItem(node: DashNode, role?: string): boolean {
  if (node.roles && !(role && (node.roles as string[]).includes(role))) return false;
  if (!node.children) return true;
  return node.children.some((c) => canSeeNavItem(c, role));
}
