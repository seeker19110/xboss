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
  // Thứ tự 17 cụm bám mockup xBoss-mockup.xlsx bản mới (commit "chore(attachments):
  // update xBoss mockup"), sắp theo đúng thứ tự 24 dashboard cấp cao của mockup —
  // tách nhỏ các cụm cũ không còn liền kề thay vì gộp cưỡng ép. Riêng 2 cụm
  // "Bản vẽ (BIM-Shop)" + "Thiết kế & BPTC" của mockup đã GỘP làm 1, nhãn hiển thị
  // đổi thành "Thiết Kế-BIM-Shopdrawings" (cùng trỏ /drawings, để riêng gây trùng
  // lặp — quyết định 2026-07-15):
  // 1. Tổng quan & Báo cáo · 2. Kế hoạch & Tiến độ · 3. Thi công hiện trường ·
  // 4. Thiết Kế-BIM-Shopdrawings (gộp Bản vẽ BIM-Shop + Thiết kế & BPTC) · 5. Quản lý vật tư ·
  // 6. Chất lượng (QA/QC) · 7. An toàn – HSE & Rủi ro · 8. Thiết bị & Máy móc ·
  // 9. Đấu thầu & Nhà thầu phụ · 10. Môi trường & Quan trắc · 11. Họp – Công văn ·
  // 12. Chi phí · Hợp đồng · Tài chính (Claim đứng trước Bảo hiểm & Bảo lãnh) ·
  // 13. Bàn giao & Vận hành · 14. Hệ thống (Chuyển đổi số đứng trước Import Excel) ·
  // 15. Hồ sơ dự án · 16. Nhân sự & Tổ chức · 17. Khởi động & Pháp lý (dời xuống cuối).
  {
    label: "Tổng quan & Báo cáo",
    dashboards: [
      { id: "dash.dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { id: "dash.bao-cao", href: "/report", label: "Báo cáo", icon: FileText },
      { id: "dash.bao-cao-luu", href: "/reports", label: "Báo cáo lưu", icon: BookMarked },
    ],
  },
  {
    // Kế hoạch & Tiến độ — 6 hệ đang thi công, mỗi hệ 1 trang `/progress/[system]` gộp
    // đủ 7 khối tiến độ của riêng hệ đó: tổng quan, S-curve, timeline, SPI, dự báo,
    // nguyên nhân trễ, danh sách trễ. Bỏ nhóm cha "Tiến độ" (chỉ gập/mở, không phải
    // trang riêng) — hiển thị thẳng 6 hệ dưới cụm, không qua bước gập/mở thừa.
    label: "Kế hoạch & Tiến độ",
    dashboards: [
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
      // Cụm chỉ còn 6 hệ đang thi công — bỏ hẳn view chung KHÔNG lọc theo hệ (từng có
      // S-Curve, trước đó là nhóm gập/mở Timeline/Gantt/Lookahead/Đường găng). Các trang
      // đó vẫn tồn tại (S-Curve nhúng trong từng `/progress/[system]` + Dashboard tổng
      // qua `ScheduleControlPanel`; Timeline/Gantt/Lookahead vào qua link trong trang hệ
      // hoặc URL trực tiếp) — chỉ không còn link riêng trong sidebar.
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
    // Thiết kế & BPTC (nhãn hiển thị "Thiết Kế-BIM-Shopdrawings") — gộp cụm "Bản vẽ
    // (BIM-Shop)" cũ vào đây (2 cụm cùng trỏ /drawings gây trùng lặp): mục "Tất cả bản
    // vẽ" (thay node "Thiết kế & Biện pháp thi công" cũ trùng tên cụm) + 5 loại bản vẽ
    // deep-link ?kind= — trang /drawings đã BỎ hàng chip lọc loại, sidebar là nơi duy
    // nhất chọn loại (nhãn/thứ tự khớp DRAWING_KINDS ở lib/drawings.ts). "Tất cả bản
    // vẽ" cần `exact` để không sáng chung khi đang xem 1 loại (xem isLeafActive).
    label: "Thiết Kế-BIM-Shopdrawings",
    dashboards: [
      {
        id: "dash.ban-ve",
        href: "/drawings",
        label: "Tất cả bản vẽ",
        icon: PencilRuler,
        exact: true,
      },
      {
        id: "dash.thiet-ke",
        href: "/drawings?kind=design",
        label: "Thiết kế",
        icon: Compass,
      },
      {
        id: "dash.bien-phap-thi-cong",
        href: "/drawings?kind=method",
        label: "Biện pháp thi công",
        icon: HardHat,
      },
      { id: "dash.bim", href: "/drawings?kind=bim", label: "BIM", icon: Box },
      {
        id: "dash.shop-drawing",
        href: "/drawings?kind=shop",
        label: "Shop drawing",
        icon: FileText,
      },
      { id: "dash.as-built", href: "/drawings?kind=asbuilt", label: "As-built", icon: BadgeCheck },
    ],
  },
  {
    // Quản lý vật tư (mockup đổi tên dashboard "Dashboard Vật Tư" → "Quản Lý Vật Tư").
    // Giữ 3 lá phẳng (không gộp nhóm) — gộp sẽ trùng nhãn "Vật tư" giữa hàng tiêu đề
    // nhóm và trang /materials chính của nó, rối cho người dùng (quyết định cũ M21).
    label: "Quản lý vật tư",
    dashboards: [
      { id: "dash.boq", href: "/boq", label: "BOQ", icon: Calculator },
      { id: "dash.vat-tu", href: "/materials", label: "Vật tư", icon: Package },
      {
        id: "dash.don-dat-hang",
        href: "/materials/purchase-orders",
        label: "Đơn đặt hàng",
        icon: Truck,
      },
    ],
  },
  {
    // Chất lượng (QA/QC) — tách ra cụm riêng khỏi cụm QA/QC · An toàn · Môi trường cũ.
    label: "Chất lượng (QA/QC)",
    dashboards: [
      { id: "dash.chat-luong", href: "/quality", label: "Chất lượng", icon: ClipboardCheck },
    ],
  },
  {
    // An toàn – HSE & Rủi ro — tách ra cụm riêng khỏi cụm QA/QC · An toàn · Môi trường cũ.
    label: "An toàn – HSE & Rủi ro",
    dashboards: [
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
    ],
  },
  {
    // Thiết bị & Máy móc — tách khỏi cụm "Vật tư & Thiết bị" cũ.
    label: "Thiết bị & Máy móc",
    dashboards: [
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
    // Đấu thầu & Nhà thầu phụ (mockup: Đấu Thầu & Chọn Thầu Phụ; NTP).
    label: "Đấu thầu & Nhà thầu phụ",
    dashboards: [
      {
        id: "dash.dau-thau",
        href: "/tenders",
        label: "Đấu thầu",
        icon: Gavel,
        roles: ["admin", "pm", "engineer", "bch"],
      },
      { id: "dash.nha-thau-phu", href: "/subcontractors", label: "Nhà thầu phụ", icon: HardHat }, // M33: hồ sơ năng lực + đánh giá NTP
    ],
  },
  {
    // Môi trường & Quan trắc — tách khỏi cụm "Chất lượng · An toàn · Môi trường" cũ.
    // Giữ 2 dashboard này chung cụm vì mockup mới xếp liền kề nhau.
    label: "Môi trường & Quan trắc",
    dashboards: [
      {
        id: "dash.moi-truong",
        href: "/environment",
        label: "Môi trường & Giấy phép",
        icon: Leaf,
      }, // M25
      {
        id: "dash.quan-he-quan-trac",
        href: "/monitoring",
        label: "Quan hệ & Quan trắc",
        icon: Radar,
      }, // M26
    ],
  },
  {
    // Họp – Công văn — tách khỏi cụm "Điều hành & Hồ sơ" cũ.
    label: "Họp – Công văn",
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
    ],
  },
  {
    // Chi phí, hợp đồng, tài chính (mockup: Chi Phí & Hợp Đồng; Tài Chính – Kế Toán;
    // Claim & Thay Đổi; Bảo Hiểm & Bảo Lãnh — mockup mới đổi chỗ Claim đứng TRƯỚC
    // Bảo hiểm & Bảo lãnh so với thứ tự cũ).
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
        id: "dash.tai-chinh-ke-toan",
        href: "/finance",
        label: "Tài chính – Kế toán",
        icon: Banknote,
        roles: ["admin", "pm", "bch"],
      }, // M27
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
            href: "/claims",
            label: "Claim chi phí",
            icon: Scale,
            roles: ["admin", "pm", "engineer", "bch"],
          }, // M34
        ],
      },
      {
        id: "dash.bao-hiem-bao-lanh",
        href: "/insurance",
        label: "Bảo hiểm & Bảo lãnh",
        icon: Umbrella,
        roles: ["admin", "pm", "bch"],
      }, // M28
    ],
  },
  {
    // Bàn giao & Vận hành (mockup: Bàn Giao & Kết Thúc; Bảo Hành – Bảo Trì) — mới hoàn toàn.
    label: "Bàn giao & Vận hành",
    dashboards: [
      {
        id: "dash.ban-giao-ket-thuc",
        href: "/handover",
        label: "Bàn giao & Kết thúc",
        icon: PackageCheck,
      }, // M29
      {
        id: "dash.bao-hanh-bao-tri",
        href: "/warranty",
        label: "Bảo hành – Bảo trì",
        icon: Cog,
      }, // M30
    ],
  },
  {
    // Hệ thống: quản trị + cụm Công nghệ & Số hoá của mockup (gộp theo gợi ý tài liệu
    // để không phình số cụm — CDE/mobile/luồng duyệt đã có nền, xem M31). Mockup xếp
    // Chuyển đổi số & Công nghệ TRƯỚC Import Excel (tiện ích quản trị không có trong mockup).
    label: "Hệ thống",
    dashboards: [
      { id: "dash.chuyen-doi-so", href: "/tech", label: "Chuyển đổi số & Công nghệ", icon: Cpu }, // M31 — đã có trang thật
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
      }, // M43 PR2 — sổ audit toàn hệ (bảng audit_log ghi bằng trigger), chỉ Admin
      {
        id: "dash.approval-flows",
        href: "/admin/approval-flows",
        label: "Cấu hình duyệt",
        icon: Workflow,
        roles: ["admin", "pm"],
      }, // M46 PR4 — Approval Engine: cấu hình luồng duyệt nhiều cấp; PM chỉ xem, Admin sửa
      {
        id: "dash.alert-rules",
        href: "/admin/alert-rules",
        label: "Ngưỡng cảnh báo",
        icon: BellRing,
        roles: ["admin", "pm"],
      }, // M47 PR4 — alert_rules: cấu hình ngưỡng cảnh báo (hạn/vật tư/SPI/CPI); PM chỉ xem, Admin sửa
    ],
  },
  {
    // Hồ sơ dự án — tách khỏi cụm "Điều hành & Hồ sơ" cũ, dời xuống gần cuối vì
    // mockup xếp "Dashboard Hồ Sơ" ở vị trí #22.
    label: "Hồ sơ dự án",
    dashboards: [
      { id: "dash.ho-so-du-an", href: "/documents", label: "Hồ sơ dự án", icon: FolderOpen },
    ],
  },
  {
    // Nhân sự & Tổ chức — tách khỏi cụm "Khởi động & Tổ chức" cũ, dời xuống vị trí #23
    // vì mockup xếp cuối.
    label: "Nhân sự & Tổ chức",
    dashboards: [
      {
        id: "dash.nhan-su",
        label: "Nhân sự & Tổ chức",
        icon: Users,
        children: [
          { href: "/users", label: "Tài khoản", icon: Users, roles: ["admin"] },
          { href: "/admin", label: "Phân công", icon: ShieldCheck, roles: ["admin", "pm"] },
          { href: "/attendance", label: "Chấm công", icon: CalendarCheck }, // M24
          { href: "/personnel", label: "Nhân sự", icon: UserCog }, // M24
          { href: "/org", label: "Sơ đồ tổ chức", icon: Network }, // M24
        ],
      },
    ],
  },
  {
    // Khởi động & Pháp lý — tách khỏi cụm "Khởi động & Tổ chức" cũ, dời xuống CUỐI
    // CÙNG vì mockup xếp ở vị trí #24. Thay đổi lớn nhất so với thứ tự cũ (trước đây
    // node này nằm gần đầu sidebar).
    label: "Khởi động & Pháp lý",
    dashboards: [
      {
        id: "dash.khoi-dong-phap-ly",
        href: "/kickoff",
        label: "Khởi động & Pháp lý",
        icon: Landmark,
      }, // M23
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
