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
  /**
   * (W3 — đợt "nâng tầm dự án" GĐ2, docs/audit-2026-08-24-nang-tam.md) Module chưa đạt
   * cổng kiểm chứng: xây **vượt cổng roadmap** (ENG-0 nguyên tắc #10 — giai đoạn OS-<n>
   * chỉ được code sau khi ENG-1..4 có traffic thật, hiện chưa có) hoặc **chưa từng chạy
   * được** (lỗi tham số SQL, W1) / là mô phỏng rõ rệt chưa dùng dữ liệu thật.
   * `true` → `isModuleEnabled` mặc định TẮT cho MỌI dự án (kể cả dự án mới tạo, không
   * cần dòng override); Admin vẫn bật thủ công per-project qua `setFlag`/`/admin/features`
   * — override tường minh trong DB luôn thắng mặc định này. Không khai (undefined) = mặc
   * định BẬT như trước (hành vi cũ, tương thích ngược).
   */
  thuNghiem?: boolean;
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
    swExclude: ["/api/events", "/api/tasks/version", "/api/system-uploads/", "/api/systems/"],
    routePrefix: [
      "/api/tasks",
      "/api/dimensions",
      "/api/events",
      "/api/system-uploads",
      "/api/systems",
    ],
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
      {
        group: "Thi công hiện trường",
        label: "Nhật ký",
        href: "/diary",
        icon: "NotebookPen",
      },
      {
        group: "Thi công hiện trường",
        label: "Mặt bằng",
        href: "/work-fronts",
        icon: "LandPlot",
      },
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
      // href PHẢI khớp đúng entry tương ứng trong DASHBOARD_TREE (`dash.boq`), vì
      // AppHeader ẩn nav của module bị tắt bằng cách so khớp CHÍNH XÁC theo href.
      // Trước đây để `/boq` (trang cũ vẫn tồn tại nhưng đã rời khỏi sidebar) nên khớp
      // trượt → tắt module `materials` KHÔNG ẩn được mục này khỏi sidebar.
      {
        group: "Quản lý vật tư",
        label: "Định mức BOQ",
        href: "/procurement?tab=boq",
        icon: "Calculator",
      },
      {
        group: "Quản lý vật tư",
        label: "Vật tư",
        href: "/procurement?tab=inventory",
        icon: "Package",
      },
      {
        group: "Quản lý vật tư",
        label: "Đơn đặt hàng",
        href: "/procurement?tab=orders",
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
    nav: [{ group: "Hệ thống", label: "Hồ sơ dự án", href: "/documents", icon: "FolderOpen" }],
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
  {
    // Mã QR mở URL + tem in (M58 PR1) — không có nav sidebar riêng (nút "In tem QR" nằm
    // trong /equipment, /materials); resolve route dùng chung mọi vai trò đăng nhập, tem
    // in gác quyền CAN.export (Admin/PM).
    key: "qr",
    nav: [],
    permKeys: ["export"],
    routePrefix: ["/api/r", "/api/qr"],
    swExclude: ["/api/r/", "/api/qr/"],
  },
  {
    // Tổng hợp tài nguyên (M59 PR1) — histogram tải nhân lực kế hoạch/thực tế + cảnh báo
    // gán chồng người. Chỉ đọc, mọi vai trò đăng nhập xem (subcon chỉ thấy của mình).
    key: "resources",
    nav: [
      {
        group: "Thi công hiện trường",
        label: "Tài nguyên",
        href: "/site?tab=tasks-diary&sub=resources",
        icon: "Users",
      },
    ],
    permKeys: [],
    routePrefix: ["/api/resources"],
  },
  {
    // Kho nhận Engineering Object từ hệ thống ngoài (ENG-1, docs/nang-cap/ENG-1-mep-agent-
    // integration.md) — Admin/PM xem/duyệt object chờ duyệt trước khi ảnh hưởng BOQ/cost.
    // Ingest thật (/api/v1/engineering/ingest) qua API key scope "engineering", chưa có
    // route API v1 nào cho đọc lại (YAGNI — thêm khi có nhu cầu thật, xem ENG-1 mục 7.1).
    key: "engineering",
    nav: [
      { group: "Hệ thống", label: "Đối tượng kỹ thuật (AI)", href: "/engineering", icon: "Boxes" },
      {
        group: "Hệ thống",
        label: "Đề xuất kỹ thuật (AI)",
        href: "/engineering/suggestions",
        icon: "Lightbulb",
      },
      {
        group: "Hệ thống",
        label: "Workflow kỹ thuật",
        href: "/engineering/workflows",
        icon: "Workflow",
      },
      {
        group: "Hệ thống",
        label: "Phiên phối hợp agent",
        href: "/engineering/agent-sessions",
        icon: "Network",
      },
    ],
    permKeys: [
      "reviewEngineeringObjects",
      "viewEngineeringSuggestions",
      "decideEngineeringSuggestions",
      "viewEngineeringWorkflows",
      "createEngineeringWorkflow",
      "approveEngineeringGate",
      "viewEngineeringAgentSessions",
      "resolveEngineeringConflicts",
    ],
    notificationTypes: [],
    routePrefix: ["/api/engineering", "/api/v1/engineering"],
  },

  // ── W3 (đợt "nâng tầm dự án" GĐ2) — 12 module con của app/api/engineering/** đóng
  // băng bằng `thuNghiem: true`. Registry gốc chỉ có 1 module "engineering" phủ CẢ
  // `/api/engineering/**` (routePrefix rộng) — các entry dưới đây có prefix DÀI HƠN nên
  // `findModuleByRoute` (khớp tiền tố dài nhất) ưu tiên chọn chúng thay vì "engineering"
  // khi route khớp, mà KHÔNG đổi `routePrefix` của "engineering" (không ảnh hưởng phần
  // còn lại: ingest ENG-1, review objects, suggestions, workflows, agent-sessions...).
  //
  // Tiêu chí (a) — vượt cổng roadmap, nhóm OS-phase (ENG-0 #10): autonomy/twin/
  // predictions/graph/prescriptive. Tiêu chí (b) — chưa từng chạy được (lỗi tham số SQL,
  // W1) hoặc mô phỏng rõ rệt: bim-models(-viewer)/iot-telemetry/subcon-ai/god-tier-studio/
  // quantum-hub/swarm/nextgen-apex.
  //
  // KHÔNG gán routePrefix cho routes DÙNG CHUNG với trang khác chưa bị đánh dấu (đọc kỹ
  // trước khi mở rộng prefix — tắt nhầm route đang phục vụ tính năng thật là hồi quy
  // nặng, xem PLAN.md việc W3):
  //   - `/api/engineering/bim-routing` dùng chung bởi `bim-viewer` (thuộc (b), dưới đây)
  //     LẪN `auto-routing` (module thật, KHÔNG đánh dấu) → cố tình KHÔNG đưa vào
  //     `engineering-bim-models`, chỉ gate `/api/engineering/bim-models`.
  //   - Trang `quantum-hub` gọi `/api/engineering/queue`, `/api/engineering/ledger`,
  //     `/api/engineering/spatial` — cả 3 tiền tố này dùng chung với `mepf-studio`,
  //     `chuan-hoa-ban-ve`, `spatial-viewer` (đều là module thật, KHÔNG đánh dấu) →
  //     KHÔNG có tiền tố API nào an toàn để gate riêng `quantum-hub`; `routePrefix: []`
  //     có chủ đích (module vẫn `thuNghiem: true` cho mục đích cờ mặc định/nav/cảnh báo
  //     UI, nhưng không chặn API vì sẽ tắt nhầm 3 trang thật kể trên).
  {
    // OS-4 (a) — Controlled Autonomy: thực thi workflow A0–A2 tự động; OS-4 đòi phê duyệt
    // riêng từng workflow A3+ từ người dùng nên module này BẮT BUỘC phải đóng băng.
    key: "engineering-autonomy",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/autonomy"],
    thuNghiem: true,
  },
  {
    // OS-phase (a) — Digital Twin L0–L3, gồm cả trang "reality" (reality-capture/
    // deviations/sensors đều nằm dưới tiền tố /api/engineering/twin).
    key: "engineering-twin",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/twin"],
    thuNghiem: true,
  },
  {
    // OS-phase (a) — Predictive OS: dự báo rủi ro tự động, chưa có traffic thật ENG-1..4.
    key: "engineering-predictions",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/predictions"],
    thuNghiem: true,
  },
  {
    // OS-phase (a) — Knowledge Graph & phả hệ kỹ thuật.
    key: "engineering-graph",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/graph"],
    thuNghiem: true,
  },
  {
    // OS-phase (a) — Prescriptive: mô phỏng phương án + đề xuất quyết định tự động.
    key: "engineering-prescriptive",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/prescriptive"],
    thuNghiem: true,
  },
  {
    // (b) — 3D BIM & 4D Sim: W1 xác nhận `/api/engineering/bim-models/**` (3 route) sai
    // tham số SQL, chưa từng chạy được lần nào trước khi W1 vá.
    key: "engineering-bim-models",
    nav: [
      {
        group: "Hệ thống",
        label: "3D BIM & 4D Sim",
        href: "/engineering/bim-viewer",
        icon: "Building2",
      },
    ],
    permKeys: [],
    routePrefix: ["/api/engineering/bim-models"],
    thuNghiem: true,
  },
  {
    // (b) — IoT Telemetry: W1 xác nhận cả 3 route devices/alerts/telemetry sai tham số SQL.
    key: "engineering-iot-telemetry",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/iot"],
    thuNghiem: true,
  },
  {
    // (b) — Subcon AI Scoring: W1 xác nhận cả 3 route (scores/evaluate/recommend-shortlist)
    // sai tham số SQL, chưa từng chạy được.
    key: "engineering-subcon-ai",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/subcon-ai"],
    thuNghiem: true,
  },
  {
    // (b) — MEPF CAD/BIM Studio: mô phỏng rõ rệt (AI diagnose/CNC export/point-cloud),
    // chưa dùng dữ liệu thật.
    key: "engineering-god-tier-studio",
    nav: [
      {
        group: "Hệ thống",
        label: "MEPF CAD/BIM Studio",
        href: "/engineering/god-tier-studio",
        icon: "Sparkles",
      },
    ],
    permKeys: [],
    routePrefix: ["/api/engineering/god-tier"],
    thuNghiem: true,
  },
  {
    // (b) — Quantum & Merkle: mô phỏng rõ rệt (WASM giả lập). routePrefix CỐ Ý rỗng —
    // xem ghi chú đầu nhóm W3: API của trang này dùng chung với các trang thật khác.
    key: "engineering-quantum-hub",
    nav: [
      {
        group: "Hệ thống",
        label: "Quantum & Merkle",
        href: "/engineering/quantum-hub",
        icon: "Zap",
      },
    ],
    permKeys: [],
    routePrefix: [],
    thuNghiem: true,
  },
  {
    // (b) — Swarm debate/synthesize giữa các AI agent: mô phỏng rõ rệt.
    key: "engineering-swarm",
    nav: [],
    permKeys: [],
    routePrefix: ["/api/engineering/swarm"],
    thuNghiem: true,
  },
  {
    // (b) — Nextgen Apex: generative-routing/edge-vision-tracking/smart-ipc/fidic-tia,
    // 4 tiền tố API chỉ dùng riêng bởi trang này (đã kiểm không dùng chung).
    key: "engineering-nextgen-apex",
    nav: [],
    permKeys: [],
    routePrefix: [
      "/api/engineering/generative-routing",
      "/api/engineering/edge-vision-tracking",
      "/api/engineering/smart-ipc",
      "/api/engineering/fidic-tia",
    ],
    thuNghiem: true,
  },
];
