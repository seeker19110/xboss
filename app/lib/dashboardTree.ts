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
  BookMarked,
  Wind,
  Zap,
  Droplets,
  Flame,
  Building2,
  PaintRoller,
  ClipboardList,
  ClipboardCheck,
  Box,
  BadgeCheck,
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
  CalendarCheck,
  UserCog,
  Network,
  History,
  Workflow,
  BellRing,
  Cable,
  ListTree,
  SlidersHorizontal,
  KeyRound,
  ToggleRight,
  Boxes,
  Lightbulb,
  Sparkles,
  Scissors,
  Brain,
  Split,
  LayoutGrid,
  Scan,
  Route,
  QrCode,
  Bot,
  TrendingUp,
  Layers,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type NavStatus = "available" | "coming-soon";

export type DashNode = {
  /**
   * Bắt buộc ở cấp 3 (dashboard) — khoá ổn định dùng cho `localStorage` gập/mở (nhóm)
   * VÀ cho `nav_settings.node_key` (M21 PR3, xem `lib/nav-settings.ts`). Đổi label
   * không đổi `id`. Cấp 4 (children) không cần — chưa có bật/tắt riêng từng mục con.
   */
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
  // Cụm 1: 7 Đại Trung Tâm Điều Hành Hợp Nhất (7 Unified Cockpits & Command Centers)
  {
    label: "🏛️ 7 Đại Trung Tâm Điều Hành (Unified Hubs)",
    dashboards: [
      {
        id: "dash.mepf-cad-bim-studio",
        href: "/engineering/god-tier-studio",
        label: "MEPF CAD/BIM Studio",
        icon: Sparkles,
      },
      {
        id: "dash.site-command",
        href: "/site",
        label: "Chỉ Huy Tác Nghiệp Hiện Trường & HSE",
        icon: HardHat,
      },
      {
        id: "dash.schedule-control",
        href: "/schedule",
        label: "Quản Trị Kế Hoạch & Tiến Độ WBS",
        icon: CalendarCheck,
      },
      {
        id: "dash.procurement-hub",
        href: "/procurement",
        label: "Chuỗi Cung Ứng, Mua Sắm & Kho Vận",
        icon: Package,
      },
      {
        id: "dash.commercial-cockpit",
        href: "/commercial",
        label: "Hợp Đồng, Chi Phí & Pháp Lý FIDIC",
        icon: Coins,
      },
      {
        id: "dash.engineering-intelligence-hub",
        href: "/engineering-intelligence",
        label: "Trí Tuệ Kỹ Thuật AI & Digital Twin",
        icon: Brain,
      },
      {
        id: "dash.governance-hub",
        href: "/governance",
        label: "Quản Trị Dự Án, Bàn Giao & Cấu Hình",
        icon: Landmark,
      },
    ],
  },
  // Cụm 2: Kỹ thuật Không gian & AI (Engineering OS) — Đỉnh cao công nghệ XBoss
  {
    label: "Kỹ thuật Không gian & AI (Engineering OS)",
    dashboards: [
      {
        id: "dash.god-tier-studio",
        href: "/engineering/god-tier-studio",
        label: "MEPF CAD/BIM Studio (M96)",
        icon: Sparkles,
      },
      {
        id: "dash.apex-cockpit",
        href: "/engineering",
        label: "Apex Cockpit (M88)",
        icon: Sparkles,
      },
      {
        id: "dash.bim-viewer",
        href: "/engineering/bim-viewer",
        label: "3D BIM & 4D Sim (M80)",
        icon: Building2,
      },
      {
        id: "dash.cad-nesting",
        href: "/engineering/cad-nesting",
        label: "Fabrication Nesting (M89)",
        icon: Scissors,
      },
      {
        id: "dash.auto-routing",
        href: "/engineering/auto-routing",
        label: "Auto-Routing 3D (M77)",
        icon: Route,
      },
      {
        id: "dash.scan-to-bim",
        href: "/engineering/scan-to-bim",
        label: "Scan-to-BIM (M70)",
        icon: Scan,
      },
      {
        id: "dash.spatial-viewer",
        href: "/engineering/spatial-viewer",
        label: "Spatial Viewer (M74)",
        icon: Layers,
      },
      {
        id: "dash.hse-vision",
        href: "/engineering/hse-vision",
        label: "HSE AI Vision (M87)",
        icon: ShieldAlert,
      },
      {
        id: "dash.zalo-copilot",
        href: "/engineering/zalo-copilot",
        label: "Zalo Copilot (M86)",
        icon: Bot,
      },
      {
        id: "dash.dynamic-cashflow",
        href: "/engineering/cashflow",
        label: "Dynamic Cashflow (M85)",
        icon: TrendingUp,
      },
      {
        id: "dash.esign-protocol",
        href: "/engineering/esign",
        label: "Smart e-Sign (M84)",
        icon: ShieldCheck,
      },
      {
        id: "dash.fidic-claims",
        href: "/engineering/fidic-claims",
        label: "FIDIC Claims & EOT (M79)",
        icon: Scale,
      },
      {
        id: "dash.qr-logistics",
        href: "/procurement?tab=qr-logistics",
        label: "QR Logistics (M78)",
        icon: QrCode,
      },
      {
        id: "dash.quantum-hub",
        href: "/engineering/quantum-hub",
        label: "Quantum & Merkle (M73)",
        icon: Zap,
      },
      {
        id: "dash.gate0-workflows",
        href: "/engineering/workflows",
        label: "Workflow Gate 0 (ENG-3)",
        icon: Workflow,
      },
      {
        id: "dash.ai-suggestions",
        href: "/engineering/suggestions",
        label: "Đề xuất AI (ENG-2)",
        icon: Lightbulb,
      },
    ],
  },
  // Cụm 3: Kế hoạch & Tiến độ WBS — Gộp Dashboard tổng quan, Báo cáo & 6 Phân hệ thi công
  {
    label: "Kế hoạch & Tiến độ",
    dashboards: [
      { id: "dash.dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      {
        id: "dash.mepf-process",
        href: "/mepf-process",
        label: "Quy trình thi công MEPF",
        icon: Workflow,
      },
      { id: "dash.bao-cao", href: "/report", label: "Báo cáo", icon: FileText },
      { id: "dash.bao-cao-luu", href: "/reports", label: "Báo cáo lưu", icon: BookMarked },
      { id: "dash.tien-do-acmv", href: "/progress/acmv", label: "ACMV", icon: Wind },
      { id: "dash.tien-do-dien", href: "/progress/dien", label: "Điện", icon: Zap },
      {
        id: "dash.tien-do-nuoc",
        href: "/progress/nuoc",
        label: "Cấp thoát nước",
        icon: Droplets,
      },
      { id: "dash.tien-do-pccc", href: "/progress/pccc", label: "PCCC", icon: Flame },
      {
        id: "dash.tien-do-ket-cau",
        href: "/progress/ket_cau",
        label: "Kết cấu",
        icon: Building2,
      },
      {
        id: "dash.tien-do-xay-to",
        href: "/progress/xay_to",
        label: "Xây tô",
        icon: PaintRoller,
      },
    ],
  },
  // Cụm 4: Thi công hiện trường, QA/QC & HSE — Gộp Tác nghiệp, Nghiệm thu, Chất lượng, HSE, Thiết bị & Xe
  {
    label: "Thi công hiện trường",
    dashboards: [
      {
        id: "dash.hien-truong",
        label: "Hiện trường",
        icon: LandPlot,
        children: [
          { href: "/my-tasks", label: "Việc của tôi", icon: ClipboardList },
          { href: "/approvals", label: "Nghiệm thu", icon: CheckSquare },
          { href: "/site?tab=tasks-diary&sub=diary", label: "Nhật ký", icon: NotebookPen },
          { href: "/site?tab=work-fronts", label: "Mặt bằng", icon: LandPlot },
          { href: "/site?tab=tasks-diary&sub=resources", label: "Tài nguyên", icon: Users },
        ],
      },
      {
        id: "dash.chat-luong",
        href: "/site?tab=approvals-qc&sub=ncr",
        label: "Chất lượng (QA/QC)",
        icon: ClipboardCheck,
      },
      {
        id: "dash.an-toan",
        label: "An toàn – HSE & Rủi ro",
        icon: ShieldAlert,
        children: [
          {
            href: "/site?tab=hse-safety",
            label: "HSE",
            icon: ShieldAlert,
            roles: ["admin", "pm", "engineer", "subcon"],
          },
          {
            href: "/site?tab=hse-safety",
            label: "Rủi ro",
            icon: AlertTriangle,
            roles: ["admin", "pm", "engineer", "bch", "cdt", "viewer"],
          },
        ],
      },
      {
        id: "dash.thiet-bi",
        label: "Thiết bị & Máy móc",
        icon: Wrench,
        children: [
          { href: "/site?tab=equipment&sub=equipment", label: "Thiết bị", icon: Wrench },
          { href: "/site?tab=equipment&sub=vehicles", label: "Xe ra vào", icon: CarFront },
        ],
      },
    ],
  },
  // Cụm 5: Thiết Kế-BIM-Shopdrawings — Gộp Bản vẽ Thiết kế, BPTC, BIM, Shop, As-built
  {
    label: "Thiết Kế-BIM-Shopdrawings",
    dashboards: [
      {
        id: "dash.thiet-ke",
        href: "/ban-ve-thiet-ke",
        label: "Thiết kế",
        icon: Compass,
      },
      {
        id: "dash.chuan-hoa-ban-ve",
        href: "/engineering/chuan-hoa-ban-ve",
        label: "Chuẩn hóa bản vẽ",
        icon: PencilRuler,
      },
      { id: "dash.bim", href: "/mo-hinh-bim", label: "Mô hình BIM", icon: Box },
      { id: "dash.combine", href: "/combine", label: "Combine", icon: Split },
      {
        id: "dash.shop-drawing",
        href: "/shopdrawings",
        label: "Shop drawing",
        icon: FileText,
      },
      {
        id: "dash.bien-phap-thi-cong",
        href: "/bien-phap-thi-cong",
        label: "Biện pháp thi công",
        icon: HardHat,
      },
      {
        id: "dash.as-built",
        href: "/ban-ve-hoan-cong",
        label: "Bản vẽ hoàn công",
        icon: BadgeCheck,
      },
    ],
  },
  // Cụm 6: Quản lý vật tư & Chuỗi cung ứng — Gộp BOQ, Kho, PO/PR, Quét QR, NCC & Đấu thầu thầu phụ
  {
    label: "Quản lý vật tư",
    dashboards: [
      {
        id: "dash.procurement-all",
        href: "/procurement",
        label: "Tổng quan Chuỗi cung ứng",
        icon: Package,
      },
      { id: "dash.boq", href: "/procurement?tab=boq", label: "Định mức BOQ", icon: Calculator },
      {
        id: "dash.vat-tu",
        href: "/procurement?tab=inventory",
        label: "Kho & Tồn kho",
        icon: Package,
      },
      {
        id: "dash.don-dat-hang",
        href: "/procurement?tab=orders",
        label: "Đơn hàng PO & PR",
        icon: Truck,
      },
      {
        id: "dash.qr-nhap-kho",
        href: "/procurement?tab=qr-logistics",
        label: "Quét QR & GRN",
        icon: QrCode,
      },
      {
        id: "dash.nha-cung-cap",
        href: "/procurement?tab=suppliers",
        label: "Nhà cung cấp",
        icon: Building2,
      },
      {
        id: "dash.dau-thau",
        href: "/tenders",
        label: "Đấu thầu",
        icon: Gavel,
        roles: ["admin", "pm", "engineer", "bch"],
      },
      { id: "dash.nha-thau-phu", href: "/subcontractors", label: "Nhà thầu phụ", icon: HardHat },
    ],
  },
  // Cụm 7: Chi phí · Hợp đồng · Tài chính — Gộp Hợp đồng, Chi phí, Đề xuất chi, IPC, Tài chính, Claim, Bảo hiểm
  {
    label: "Chi phí · Hợp đồng · Tài chính",
    dashboards: [
      {
        id: "dash.chi-phi-hop-dong",
        label: "Chi phí & Hợp đồng",
        icon: Coins,
        children: [
          {
            href: "/commercial?tab=ipc-payments&sub=proposals",
            label: "Đề xuất & duyệt",
            icon: FileCheck2,
          },
          { href: "/commercial?tab=ipc-payments&sub=payments", label: "Thanh toán", icon: Wallet },
          {
            href: "/commercial?tab=contracts&sub=costs",
            label: "Chi phí",
            icon: Coins,
            roles: ["admin", "pm", "bch"],
          },
          {
            href: "/commercial?tab=contracts",
            label: "Hợp đồng",
            icon: FileSignature,
            roles: ["admin", "pm", "bch"],
          },
          {
            href: "/commercial?tab=ipc-payments&sub=ipc",
            label: "Thanh toán KL",
            icon: Receipt,
            roles: ["admin", "pm", "bch"],
          },
        ],
      },
      {
        id: "dash.tai-chinh-ke-toan",
        href: "/commercial?tab=cashflow-esign",
        label: "Tài chính – Kế toán",
        icon: Banknote,
        roles: ["admin", "pm", "bch"],
      },
      {
        id: "dash.claim",
        label: "Claim & Thay đổi",
        icon: Scale,
        children: [
          {
            href: "/commercial?tab=vo-variations",
            label: "Phát sinh",
            icon: FilePlus2,
            roles: ["admin", "pm", "engineer", "bch"],
          },
          {
            href: "/commercial?tab=fidic-claims",
            label: "Claim chi phí",
            icon: Scale,
            roles: ["admin", "pm", "engineer", "bch"],
          },
        ],
      },
      {
        id: "dash.bao-hiem-bao-lanh",
        href: "/commercial?tab=contracts&sub=insurance",
        label: "Bảo hiểm & Bảo lãnh",
        icon: Umbrella,
        roles: ["admin", "pm", "bch"],
      },
    ],
  },
  // Cụm 8: Quản trị dự án, Bàn giao & Hệ thống — Gộp Khởi động, Bàn giao, Bảo hành, CDE, Họp, Môi trường, Nhân sự & Cấu hình Admin
  {
    label: "Hệ thống",
    dashboards: [
      {
        id: "dash.khoi-dong-phap-ly",
        href: "/kickoff",
        label: "Khởi động & Pháp lý",
        icon: Landmark,
      },
      {
        id: "dash.ban-giao-ket-thuc",
        href: "/handover",
        label: "Bàn giao & Kết thúc",
        icon: PackageCheck,
      },
      {
        id: "dash.bao-hanh-bao-tri",
        href: "/warranty",
        label: "Bảo hành – Bảo trì",
        icon: Cog,
      },
      { id: "dash.ho-so-du-an", href: "/documents", label: "Hồ sơ dự án", icon: FolderOpen },
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
      {
        id: "dash.moi-truong",
        href: "/environment",
        label: "Môi trường & Giấy phép",
        icon: Leaf,
      },
      {
        id: "dash.quan-he-quan-trac",
        href: "/monitoring",
        label: "Quan hệ & Quan trắc",
        icon: Radar,
      },
      {
        id: "dash.nhan-su",
        label: "Nhân sự & Tổ chức",
        icon: Users,
        children: [
          { href: "/users", label: "Tài khoản", icon: Users, roles: ["admin"] },
          { href: "/admin", label: "Phân công", icon: ShieldCheck, roles: ["admin", "pm"] },
          { href: "/site?tab=tasks-diary&sub=attendance", label: "Chấm công", icon: CalendarCheck },
          { href: "/personnel", label: "Nhân sự", icon: UserCog },
          { href: "/org", label: "Sơ đồ tổ chức", icon: Network },
        ],
      },
      { id: "dash.chuyen-doi-so", href: "/tech", label: "Chuyển đổi số & Công nghệ", icon: Cpu },
      {
        id: "dash.import-excel",
        href: "/import",
        label: "Import Excel",
        icon: Upload,
        roles: ["admin", "pm"],
      },
      {
        id: "dash.audit-log",
        href: "/admin/audit-log",
        label: "Audit trail (tài chính)",
        icon: History,
        roles: ["admin"],
      },
      {
        id: "dash.approval-flows",
        href: "/admin/approval-flows",
        label: "Cấu hình duyệt",
        icon: Workflow,
        roles: ["admin", "pm"],
      },
      {
        id: "dash.permissions",
        href: "/admin/permissions",
        label: "Phân quyền",
        icon: KeyRound,
        roles: ["admin"],
      },
      {
        id: "dash.alert-rules",
        href: "/admin/alert-rules",
        label: "Ngưỡng cảnh báo",
        icon: BellRing,
        roles: ["admin", "pm"],
      },
      {
        id: "dash.integrations",
        href: "/admin/integrations",
        label: "Tích hợp hệ ngoài",
        icon: Cable,
        roles: ["admin", "pm"],
      },
      {
        id: "dash.code-lists",
        href: "/admin/code-lists",
        label: "Danh mục mềm",
        icon: ListTree,
        roles: ["admin"],
      },
      {
        id: "dash.custom-fields",
        href: "/admin/custom-fields",
        label: "Trường tuỳ biến",
        icon: SlidersHorizontal,
        roles: ["admin", "pm"],
      },
      {
        id: "dash.feature-flags",
        href: "/admin/features",
        label: "Cờ tính năng",
        icon: ToggleRight,
        roles: ["admin", "pm"],
      },
    ],
  },
];

function splitPathQuery(value: string): [string, string] {
  const i = value.indexOf("?");
  return i < 0 ? [value, ""] : [value.slice(0, i), value.slice(i + 1)];
}

// `path` truyền vào có thể kèm query ("/drawings?kind=bim") để các link chỉ khác nhau
// ở query (5 loại bản vẽ trong cụm Thiết kế & BPTC) sáng đúng mục đang xem:
//   - href CÓ query: mọi param của href phải khớp URL hiện tại.
//   - href KHÔNG query + `exact`: URL không được mang query — để "Tất cả bản vẽ"
//     không sáng chung khi đang xem 1 loại.
function isLeafActive(node: DashNode, path: string): boolean {
  if (!node.href) return false;
  const [pathname, search] = splitPathQuery(path);
  const [hrefPath, hrefSearch] = splitPathQuery(node.href);
  if (hrefSearch) {
    if (pathname !== hrefPath) return false;
    const current = new URLSearchParams(search);
    return Array.from(new URLSearchParams(hrefSearch)).every(([k, v]) => current.get(k) === v);
  }
  if (node.exact) return pathname === hrefPath && search === "";
  return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
}

export function isNavItemActive(node: DashNode, path: string): boolean {
  if (isLeafActive(node, path)) return true;
  return !!node.children?.some((c) => isNavItemActive(c, path));
}

/** Tìm lá khớp nhất với path hiện tại (pathname, kèm query nếu có) — dùng để suy ra
 *  title/breadcrumb topbar. */
export function findActiveNav(
  path: string,
): { cluster: DashCluster; dashboard: DashNode; item: DashNode } | undefined {
  let best: { cluster: DashCluster; dashboard: DashNode; item: DashNode } | undefined;
  for (const cluster of DASHBOARD_TREE) {
    for (const dashboard of cluster.dashboards) {
      const candidates = dashboard.children?.length ? dashboard.children : [dashboard];
      for (const item of candidates) {
        if (!isLeafActive(item, path)) continue;
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

/** Lọc cây theo vai trò (canSeeNavItem) + nav_settings (M21 PR3, xem lib/nav-settings.ts)
 *  — dùng cho AppHeader render sidebar và khu "Hiển thị AppShell" ở /admin. Cụm rỗng
 *  sau lọc thì bị bỏ. `navSettings` rỗng (chưa tải xong) = coi như mọi dashboard đều bật,
 *  tránh sidebar nhấp nháy ẩn/hiện lúc tải trang. */
export function resolveVisibleTree(
  tree: DashCluster[],
  role: string | undefined,
  navSettings: Map<string, boolean>,
): DashCluster[] {
  return tree
    .map((cluster) => ({
      ...cluster,
      dashboards: cluster.dashboards.filter(
        (dashboard) =>
          canSeeNavItem(dashboard, role) &&
          (!dashboard.id || navSettings.get(dashboard.id) !== false),
      ),
    }))
    .filter((cluster) => cluster.dashboards.length > 0);
}

/** Tìm dashboard nhóm (có `children`) theo `id` — dùng cho trang hub khuôn chung (M21 PR2). */
export function findDashboardById(
  id: string,
): { cluster: DashCluster; dashboard: DashNode } | undefined {
  for (const cluster of DASHBOARD_TREE) {
    for (const dashboard of cluster.dashboards) {
      if (dashboard.id === id) return { cluster, dashboard };
    }
  }
  return undefined;
}

/** Suy trạng thái hiển thị của 1 dashboard cấp 3 — có href/children = đã có trang thật. */
export function dashboardStatus(dash: DashNode): NavStatus {
  return dash.href || dash.children ? "available" : "coming-soon";
}

/** Phẳng hoá toàn bộ dashboard cấp 3 (mọi cụm) — dùng cho `lib/nav-settings.ts`
 *  (mặc định bật/tắt, validate `node_key`, khu "Hiển thị AppShell" ở `/admin`). */
export function flattenDashboards(): { cluster: DashCluster; dashboard: DashNode }[] {
  return DASHBOARD_TREE.flatMap((cluster) =>
    cluster.dashboards.map((dashboard) => ({ cluster, dashboard })),
  );
}
