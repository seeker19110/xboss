// Bảng màu vẽ CAD theo hệ kỹ thuật MEP (tương đương bảng chỉ số màu ACI của AutoCAD)
// dùng để tô thực thể trên khung nhìn vector CadViewportStudio khi bản vẽ không tự
// mang màu layer (colorHex/ACI). Đây là DỮ LIỆU bản vẽ, không phải màu giao diện —
// cố ý GIỮ NGUYÊN giá trị hex, KHÔNG đảo theo theme sáng/tối như các màu UI khác.
export const CAD_SYSTEM_LAYER_COLORS: { match: (upperLayerName: string) => boolean; hex: string }[] = [
  {
    // Điều hoà không khí (Đường gió / giá đỡ)
    match: (u) =>
      u.includes("01_") ||
      u.includes("DUCT") ||
      u.includes("SUPP") ||
      u.includes("-M-") ||
      u.startsWith("M-"),
    hex: "#ef4444",
  },
  {
    // Hệ hồi gió (Return)
    match: (u) => u.includes("02_") || u.includes("RET"),
    hex: "#eab308",
  },
  {
    // Điện (Thang máng cáp / nguồn)
    match: (u) =>
      u.includes("ELEC") ||
      u.includes("TRAY") ||
      u.includes("PWR") ||
      u.includes("-E-") ||
      u.startsWith("E-"),
    hex: "#d946ef",
  },
  {
    // Cấp nước / nước lạnh
    match: (u) =>
      u.includes("PLUMB") ||
      u.includes("CHW") ||
      u.includes("PPR") ||
      u.includes("-P-") ||
      u.startsWith("P-"),
    hex: "#06b6d4",
  },
  {
    // Thoát nước
    match: (u) => u.includes("DRAIN") || u.includes("SAN") || u.includes("THOAT"),
    hex: "#10b981",
  },
  {
    // Phòng cháy chữa cháy
    match: (u) =>
      u.includes("FIRE") ||
      u.includes("SPRN") ||
      u.includes("PCCC") ||
      u.includes("-F-") ||
      u.startsWith("F-"),
    hex: "#f87171",
  },
  {
    // Lưới trục kết cấu
    match: (u) => u.includes("GRID") || u.includes("TRUC") || u.includes("-S-") || u.startsWith("S-"),
    hex: "#71717a",
  },
  {
    // Kiến trúc (Tường)
    match: (u) => u.includes("WALL") || u.includes("-A-") || u.startsWith("A-"),
    hex: "#a1a1aa",
  },
];

// Màu mặc định khi layer không khớp hệ nào ở trên và bản vẽ không tự mang màu (ACI/colorHex).
export const CAD_UNMATCHED_LAYER_COLOR = "#e4e4e7";

// Màu mặc định cho ô chú thích màu layer (legend/danh sách layer) khi layer thiếu cả
// colorHex lẫn colorNumber hợp lệ trong bảng ACI_TO_HEX.
export const CAD_LAYER_SWATCH_FALLBACK_COLOR = "#a1a1aa";
