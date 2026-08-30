// Vai trò + nhãn dùng chung cho cả server (API validate) lẫn client (UI).
// Tách khỏi lib/auth.ts để client component import được mà không kéo theo
// node:crypto / next/headers (chỉ có ở server).

// bch (Ban chỉ huy), cdt (Chủ đầu tư), viewer: vai trò chỉ-xem + bình luận.
export type Role = "admin" | "pm" | "engineer" | "subcon" | "bch" | "cdt" | "viewer";

export const ROLES: Role[] = ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  pm: "PM",
  engineer: "Kỹ sư",
  subcon: "Thầu phụ",
  bch: "BCH",
  cdt: "CĐT",
  viewer: "Viewer",
};

// Vai trò chỉ được xem + bình luận, không sửa tiến độ/cấu trúc.
export const VIEW_ONLY_ROLES: Role[] = ["bch", "cdt", "viewer"];

// Vai trò được xem trang Thanh toán (Admin, PM và BCH — ban chỉ huy/site manager).
// Dùng chung cho server (API 403) lẫn client (ẩn/hiện link).
export const PAYMENT_VIEW_ROLES: Role[] = ["admin", "pm", "bch"];
