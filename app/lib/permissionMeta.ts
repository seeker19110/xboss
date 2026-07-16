// app/lib/permissionMeta.ts — Nhãn tiếng Việt + nhóm module cho từng quyền, dùng cho
// trang ma trận /admin/permissions. File CLIENT-SAFE (không import lib/auth vì auth kéo
// node:crypto). Danh sách khoá quyền THẬT do API trả (nguồn: CAN_DEFAULT trong lib/auth);
// meta ở đây chỉ trang trí — khoá thiếu meta rơi vào nhóm "Khác" với nhãn = chính khoá.

export type PermMeta = { label: string; group: string };

// Thứ tự nhóm hiển thị trên trang.
export const PERM_GROUP_ORDER: string[] = [
  "Nhập / Xuất & Bảng điều khiển",
  "Tiến độ & Cấu trúc",
  "Người dùng · Dự án · Hệ thống",
  "Nghiệm thu & Kiểm định",
  "Hợp đồng & Tài chính",
  "Phát sinh (VO) & Claim",
  "Bản vẽ",
  "Đấu thầu",
  "Công văn / RFI",
  "Hiện trường & Thiết bị",
  "HSE & Rủi ro",
  "Họp",
  "Khởi động & Nhân sự",
  "Môi trường & Quan trắc",
  "Bàn giao & Bảo hành",
  "Công nghệ & Tích hợp",
  "Thay đổi thiết kế",
  "Nhà thầu phụ",
  "Cấu hình duyệt & Cảnh báo",
  "Khác",
];

export const PERM_META: Record<string, PermMeta> = {
  import: { label: "Nhập Excel", group: "Nhập / Xuất & Bảng điều khiển" },
  export: { label: "Xuất dữ liệu", group: "Nhập / Xuất & Bảng điều khiển" },
  viewDashboard: { label: "Xem bảng điều khiển", group: "Nhập / Xuất & Bảng điều khiển" },

  editProgress: { label: "Sửa tiến độ", group: "Tiến độ & Cấu trúc" },
  editStructure: { label: "Sửa cấu trúc (tên/mã/trục/căn hộ)", group: "Tiến độ & Cấu trúc" },
  assign: { label: "Gán người làm task", group: "Tiến độ & Cấu trúc" },
  approve: { label: "Duyệt / huỷ nghiệm thu", group: "Tiến độ & Cấu trúc" },

  manageUsers: { label: "Quản lý người dùng", group: "Người dùng · Dự án · Hệ thống" },
  manageProjects: { label: "Quản lý dự án", group: "Người dùng · Dự án · Hệ thống" },
  manageNav: { label: "Cấu hình hiển thị AppShell", group: "Người dùng · Dự án · Hệ thống" },
  viewAudit: { label: "Xem sổ audit trail", group: "Người dùng · Dự án · Hệ thống" },

  createInspectionRequest: { label: "Tạo phiếu YCNT", group: "Nghiệm thu & Kiểm định" },

  manageContracts: { label: "Quản lý hợp đồng / phụ lục", group: "Hợp đồng & Tài chính" },
  viewPayments: { label: "Xem trang thanh toán", group: "Hợp đồng & Tài chính" },
  manageFinance: { label: "Quản lý tài chính – kế toán", group: "Hợp đồng & Tài chính" },

  viewVariations: { label: "Xem phát sinh (VO)", group: "Phát sinh (VO) & Claim" },
  createVariation: { label: "Tạo phát sinh (VO)", group: "Phát sinh (VO) & Claim" },
  viewClaims: { label: "Xem claim chi phí", group: "Phát sinh (VO) & Claim" },
  manageClaims: { label: "Quản lý claim chi phí", group: "Phát sinh (VO) & Claim" },

  manageDrawings: { label: "Quản lý bản vẽ", group: "Bản vẽ" },
  decideDrawingRevision: { label: "Duyệt rev bản vẽ", group: "Bản vẽ" },

  viewTenders: { label: "Xem đấu thầu", group: "Đấu thầu" },
  manageTenders: { label: "Quản lý đấu thầu", group: "Đấu thầu" },

  viewCorrespondence: { label: "Xem công văn / RFI", group: "Công văn / RFI" },
  manageCorrespondence: { label: "Quản lý công văn / RFI", group: "Công văn / RFI" },

  manageWorkFronts: { label: "Quản lý mặt bằng thi công", group: "Hiện trường & Thiết bị" },
  manageEquipment: { label: "Quản lý thiết bị / máy móc", group: "Hiện trường & Thiết bị" },
  manageNorms: { label: "Quản lý định mức thi công", group: "Hiện trường & Thiết bị" },

  manageHse: { label: "Quản lý HSE", group: "HSE & Rủi ro" },
  viewRisks: { label: "Xem sổ rủi ro", group: "HSE & Rủi ro" },
  manageRisks: { label: "Quản lý sổ rủi ro", group: "HSE & Rủi ro" },

  manageMeetings: { label: "Quản lý họp & action", group: "Họp" },

  manageKickoff: { label: "Quản lý khởi động & pháp lý", group: "Khởi động & Nhân sự" },
  manageHr: { label: "Quản lý nhân sự & tổ chức", group: "Khởi động & Nhân sự" },
  recordAttendance: { label: "Ghi chấm công", group: "Khởi động & Nhân sự" },

  manageEnv: { label: "Quản lý môi trường & giấy phép", group: "Môi trường & Quan trắc" },
  manageMonitoring: { label: "Quản lý quan hệ & quan trắc", group: "Môi trường & Quan trắc" },

  manageHandover: { label: "Quản lý bàn giao & kết thúc", group: "Bàn giao & Bảo hành" },
  manageWarranty: { label: "Quản lý bảo hành & bảo trì", group: "Bàn giao & Bảo hành" },

  manageTech: { label: "Quản lý chuyển đổi số & công nghệ", group: "Công nghệ & Tích hợp" },
  viewIntegrations: { label: "Xem tích hợp hệ ngoài", group: "Công nghệ & Tích hợp" },
  manageIntegrations: { label: "Quản lý tích hợp hệ ngoài", group: "Công nghệ & Tích hợp" },

  manageDesignChanges: { label: "Quản lý thay đổi thiết kế", group: "Thay đổi thiết kế" },

  manageSuppliers: { label: "Quản lý hồ sơ NTP", group: "Nhà thầu phụ" },

  viewApprovalFlows: { label: "Xem cấu hình luồng duyệt", group: "Cấu hình duyệt & Cảnh báo" },
  manageApprovalFlows: { label: "Sửa cấu hình luồng duyệt", group: "Cấu hình duyệt & Cảnh báo" },
  viewAlertRules: { label: "Xem ngưỡng cảnh báo", group: "Cấu hình duyệt & Cảnh báo" },
  manageAlertRules: { label: "Sửa ngưỡng cảnh báo", group: "Cấu hình duyệt & Cảnh báo" },
};

export function permMeta(permKey: string): PermMeta {
  return PERM_META[permKey] ?? { label: permKey, group: "Khác" };
}
