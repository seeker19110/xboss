// Chế độ trang chủ theo vai trò (M127 FR1).
//
// `/` phục vụ 7 vai trò với hai nhu cầu khác hẳn nhau: quản lý cần tổng quan dự án, người
// thi công cần "hôm nay tôi làm gì". Thay vì một bố cục chung nửa vời (thầu phụ vốn không
// có quyền `viewDashboard` nên chỉ thấy trang trống), trang chủ chọn một trong hai chế độ:
//   - `dieu-hanh`   : bố cục M125 (KPI, biểu đồ, bảng trễ) — mặc định cho mọi vai trò quản lý
//   - `hien-truong` : việc của tôi hôm nay — mặc định cho kỹ sư, bắt buộc với thầu phụ
//
// Chỉ kỹ sư được chuyển qua lại (lưu lựa chọn trong localStorage); thầu phụ không có quyền
// xem dashboard nên không có nút chuyển, các vai trò chỉ-xem (bch/cdt/viewer) không có việc
// được giao nên chế độ Hiện trường sẽ trống với họ.

export type HomeMode = "dieu-hanh" | "hien-truong";

export const HOME_MODE_KEY = "xboss_home_mode";

/** Chế độ hợp lệ theo vai trò + lựa chọn đã lưu (`saved` chỉ có tác dụng với kỹ sư). */
export function resolveHomeMode(role: string | undefined | null, saved: HomeMode | null): HomeMode {
  if (role === "subcon") return "hien-truong";
  if (role === "engineer") return saved ?? "hien-truong";
  return "dieu-hanh";
}

/** Đọc lựa chọn đã lưu — null khi chưa chọn/không đọc được (SSR, storage bị chặn). */
export function readSavedMode(): HomeMode | null {
  try {
    const v = window.localStorage.getItem(HOME_MODE_KEY);
    return v === "dieu-hanh" || v === "hien-truong" ? v : null;
  } catch {
    return null;
  }
}

/** Ghi lựa chọn (bỏ qua im lặng khi storage bị chặn — chế độ vẫn đúng trong phiên này). */
export function saveMode(mode: HomeMode): void {
  try {
    window.localStorage.setItem(HOME_MODE_KEY, mode);
  } catch {
    /* trình duyệt chặn localStorage (chế độ riêng tư) — không ảnh hưởng hiển thị */
  }
}
