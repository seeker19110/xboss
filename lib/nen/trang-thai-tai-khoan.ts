// M134 — thuần: tài khoản đã bị Admin vô hiệu hoá (`users.disabled_at` khác NULL). Dùng chung cho
// getCurrentUser và mọi đường phát phiên (mật khẩu, 2FA bước 2, SSO). Đặt ở tầng 0 (không nằm trong
// `lib/bao-mat/auth.ts`) để test mock module auth không phải khai lại hai export này.
// pg trả TIMESTAMPTZ là `Date` (lib/db không đăng ký parser riêng cho oid 1184).
export function taiKhoanBiKhoa(disabledAt: string | Date | null | undefined): boolean {
  return disabledAt != null;
}

export const LOI_TAI_KHOAN_BI_KHOA = "Tài khoản đã bị vô hiệu hoá — liên hệ quản trị viên";
