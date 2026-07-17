// Module registry (M52 PR3) — manifest tập trung khai báo MỖI module chạm những gì:
// nav sidebar, quyền (perm), loại notification, path loại trừ cache SW, tiền tố route.
//
// VÌ SAO: trước đây thêm 1 module phải sửa ≥4 nơi rời rạc (map `CAN` trong lib/auth.ts,
// cây điều hướng app/lib/dashboardTree.ts, nguồn notification /api/notifications,
// danh sách loại trừ cache public/sw.js) — đã gây race/bỏ sót thật. Registry gom các
// "điểm chạm" đó về 1 bảng khai báo, làm nguồn tra cứu duy nhất khi thêm module mới.
//
// PHẠM VI PR3 (refactor nội bộ — KHÔNG đổi hành vi): file này là bảng khai báo MỚI,
// KHÔNG rút ruột dashboardTree/CAN/notifications hiện có (chúng vẫn là nguồn chạy thật
// để đảm bảo hành vi UI/API không đổi 1 ly). Registry hiện liệt kê nhóm module mới nhất/
// rõ nhất để chứng minh cơ chế; cổng CI đầu tiên đọc registry là scripts/check-sw-exclude.ts
// (đối chiếu `swExclude` với public/sw.js). M52 PR4 (feature flags) sẽ đọc `routePrefix`
// để chặn route theo dự án. Việc phủ 100% module vào registry làm dần theo các PR sau.

/**
 * Khai báo 1 module nghiệp vụ và mọi "điểm chạm" xuyên suốt của nó.
 * Shape bám đúng đặc tả M52 PR3 (docs/nang-cap/M52-mo-rong-cau-hinh.md).
 */
export type ModuleDef = {
  /** Khoá ổn định của module (snake/kebab, vd 'finance', 'alert-rules'). */
  key: string;
  /** Mục sidebar module đóng góp — `group` = nhãn cụm trong dashboardTree, `icon` = tên
   *  component lucide-react (chuỗi, tách khỏi import để manifest thuần dữ liệu). */
  nav: { group: string; label: string; href: string; icon: string }[];
  /** Tên quyền (khoá trong map `CAN`, lib/auth.ts) thuộc module — đối chiếu ma trận M50. */
  permKeys: string[];
  /** Loại notification module phát (khớp cột `type` bảng notifications). */
  notificationTypes?: string[];
  /** Path route động loại trừ khỏi cache SW — phải khớp public/sw.js (check CI). */
  swExclude?: string[];
  /** Tiền tố route API của module — M52 PR4 dùng để chặn route khi module bị tắt. */
  routePrefix: string[];
};

// Ghi chú độ phủ (tính đến M52 PR3):
//  - ĐÃ đưa vào registry: 4 module cắt ngang (tracking, field, materials, documents) +
//    module vận hành (ops, M44) + 5 module quản trị mới nhất M43–M50 (audit, approval-flows,
//    alert-rules, integrations, permissions). Nhóm này phủ ĐỦ cả 4 loại notification thật
//    (delayed/due_soon/comment/material_over) lẫn 4 path loại trừ cache thật của sw.js
//    (/api/photos/, /api/events, /api/documents/, /api/health) — đủ để cơ chế + cổng CI
//    chạy thật, không rỗng.
//  - CHƯA đưa vào: phần lớn module nghiệp vụ đời đầu M01–M42 (chi phí/hợp đồng, chất lượng,
//    HSE, thiết bị, đấu thầu, môi trường, họp/công văn, bàn giao, nhân sự, khởi động, bản
//    vẽ, tài chính...). Bổ sung dần theo các PR sau — dashboardTree/CAN vẫn là nguồn chạy
//    thật cho các module này nên KHÔNG ảnh hưởng hành vi hiện tại.
//  - Hiện KHÔNG có node "Sắp có" (coming-soon) nào trong dashboardTree (mọi dashboard đều
//    đã có href/children) → registry chưa cần entry coming-soon.
export const MODULES: ModuleDef[] = [
  {
    // Tiến độ & tracking realtime — lưới checkbox dimension + đồng bộ đa người qua SSE.
    key: "tracking",
    nav: [
      { group: "Kế hoạch & Tiến độ", label: "ACMV", href: "/progress/acmv", icon: "Wind" },
      { group: "Kế hoạch & Tiến độ", label: "Điện", href: "/progress/dien", icon: "Zap" },
      {
        group: "Kế hoạch & Tiến độ",
        label: "Cấp thoát nước",
        href: "/progress/nuoc",
        icon: "Droplets",
      },
      { group: "Kế hoạch & Tiến độ", label: "PCCC", href: "/progress/pccc", icon: "Flame" },
      {
        group: "Kế hoạch & Tiến độ",
        label: "Kết cấu",
        href: "/progress/ket_cau",
        icon: "Building2",
      },
      {
        group: "Kế hoạch & Tiến độ",
        label: "Xây tô",
        href: "/progress/xay_to",
        icon: "PaintRoller",
      },
    ],
    permKeys: ["editProgress", "editStructure", "assign"],
    notificationTypes: ["delayed", "due_soon"],
    swExclude: ["/api/events"],
    routePrefix: ["/api/tasks", "/api/dimensions", "/api/events"],
  },
  {
    // Thi công hiện trường — việc của tôi, nghiệm thu, nhật ký, mặt bằng + ảnh hiện trường.
    key: "field",
    nav: [
      {
        group: "Thi công hiện trường",
        label: "Việc của tôi",
        href: "/my-tasks",
        icon: "ClipboardList",
      },
      {
        group: "Thi công hiện trường",
        label: "Nghiệm thu",
        href: "/approvals",
        icon: "CheckSquare",
      },
      { group: "Thi công hiện trường", label: "Nhật ký", href: "/diary", icon: "NotebookPen" },
      { group: "Thi công hiện trường", label: "Mặt bằng", href: "/work-fronts", icon: "LandPlot" },
    ],
    permKeys: ["editProgress", "approve", "manageWorkFronts"],
    notificationTypes: ["comment"],
    swExclude: ["/api/photos/"],
    routePrefix: ["/api/photos", "/api/my-tasks", "/api/approvals", "/api/work-fronts"],
  },
  {
    // Quản lý vật tư — BOQ, kho vật tư, đơn đặt hàng (gồm cảnh báo vượt định mức).
    key: "materials",
    nav: [
      { group: "Quản lý vật tư", label: "BOQ", href: "/boq", icon: "Calculator" },
      { group: "Quản lý vật tư", label: "Vật tư", href: "/materials", icon: "Package" },
      {
        group: "Quản lý vật tư",
        label: "Đơn đặt hàng",
        href: "/materials/purchase-orders",
        icon: "Truck",
      },
    ],
    // Ghi/sửa vật tư gác bằng helper cục bộ (canEditMaterials) chứ không phải perm trong
    // map CAN → không có permKey trong ma trận M50 để khai báo.
    permKeys: [],
    notificationTypes: ["material_over"],
    routePrefix: ["/api/materials", "/api/boq", "/api/purchase-orders", "/api/purchase-requests"],
  },
  {
    // Hồ sơ dự án — kho tài liệu chung, tải/stream file có kiểm quyền.
    key: "documents",
    nav: [{ group: "Hồ sơ dự án", label: "Hồ sơ dự án", href: "/documents", icon: "FolderOpen" }],
    permKeys: [],
    swExclude: ["/api/documents/"],
    routePrefix: ["/api/documents", "/api/project-documents", "/api/documents-hub"],
  },
  {
    // Vận hành & giám sát (M44) — health check cho uptime monitor (không có nav sidebar).
    key: "ops",
    nav: [],
    permKeys: [],
    swExclude: ["/api/health"],
    routePrefix: ["/api/health"],
  },
  {
    // Audit trail toàn hệ (M43 PR2) — sổ audit_log ghi bằng trigger, chỉ Admin xem.
    key: "audit",
    nav: [
      {
        group: "Hệ thống",
        label: "Audit trail (tài chính)",
        href: "/admin/audit-log",
        icon: "History",
      },
    ],
    permKeys: ["viewAudit"],
    routePrefix: ["/api/admin/audit-log", "/api/admin/audit"],
  },
  {
    // Approval Engine (M46 PR4) — cấu hình luồng duyệt nhiều cấp; PM xem, Admin sửa.
    key: "approval-flows",
    nav: [
      {
        group: "Hệ thống",
        label: "Cấu hình duyệt",
        href: "/admin/approval-flows",
        icon: "Workflow",
      },
    ],
    permKeys: ["viewApprovalFlows", "manageApprovalFlows"],
    routePrefix: ["/api/admin/approval-flows"],
  },
  {
    // Ngưỡng cảnh báo cấu hình được (M47 PR4) — hạn/vật tư/SPI/CPI; PM xem, Admin sửa.
    key: "alert-rules",
    nav: [
      { group: "Hệ thống", label: "Ngưỡng cảnh báo", href: "/admin/alert-rules", icon: "BellRing" },
    ],
    permKeys: ["viewAlertRules", "manageAlertRules"],
    routePrefix: ["/api/admin/alert-rules"],
  },
  {
    // Khung tích hợp hệ ngoài (M48 PR1) — đồng bộ hệ ngoài; PM xem+đồng bộ, Admin bật/tắt.
    key: "integrations",
    nav: [
      { group: "Hệ thống", label: "Tích hợp hệ ngoài", href: "/admin/integrations", icon: "Cable" },
    ],
    permKeys: ["viewIntegrations", "manageIntegrations"],
    routePrefix: ["/api/admin/integrations", "/api/integrations"],
  },
  {
    // Ma trận override quyền (M50 PR1) — role_permissions; chỉ Admin (gác bằng manageUsers).
    key: "permissions",
    nav: [{ group: "Hệ thống", label: "Phân quyền", href: "/admin/permissions", icon: "KeyRound" }],
    permKeys: ["manageUsers"],
    routePrefix: [
      "/api/admin/role-permissions",
      "/api/admin/permissions-snapshot",
      "/api/admin/sod-report",
    ],
  },
];
