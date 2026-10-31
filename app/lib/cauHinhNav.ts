// Cache module phía client cho cấu hình điều hướng của AppShell (P7 / FE-1 bước 2):
// GET /api/nav-settings (bật/tắt dashboard) và GET /api/feature-flags (module theo dự án).
//
// Hai bản đồ này gần như không đổi trong phiên nhưng AppHeader nằm trong từng trang (không ở
// layout) nên remount ở MỖI lần chuyển trang. Giống `fetchMe` (app/lib/me.ts): một promise dùng
// chung cho cả tab, sống TTL_MS, khoá theo dự án đang chọn (cookie `xboss_project`) — đổi dự án là
// tự hết khớp khoá. Xoá chủ động khi đổi ngữ cảnh (`phatDoiNguCanh`: đổi dự án/đăng xuất/đổi tài
// khoản) và ngay sau khi admin ghi nav-settings/feature-flags trong tab này. Tab khác thấy cấu
// hình mới chậm tối đa TTL_MS — chấp nhận được vì server vẫn chặn module tắt bằng
// assertModuleEnabled, cache này chỉ quyết định ẩn/hiện mục menu.
//
// Lần tải thật VẪN bust cache (query `_` + no-store) như trước để không bao giờ đọc bản HTTP cũ
// ngay sau khi admin vừa ghi.
import { docIdDuAn } from "@/lib/nen/link-tracking";

export type BanDoBat = Record<string, boolean>;

/** Thời gian sống của một lần tải (ms). */
export const TTL_CAU_HINH_NAV_MS = 60_000;

type Muc = { khoa: string; han: number; promise: Promise<BanDoBat | null> };

const _cache = new Map<string, Muc>();

/** Khoá ngữ cảnh: dự án đang chọn theo cookie (null = chưa chọn → server tự chọn mặc định). */
function khoaDuAn(): string {
  if (typeof document === "undefined") return "-";
  const m = document.cookie.match(/(?:^|; )xboss_project=([^;]+)/);
  return String(docIdDuAn(m ? m[1] : null) ?? "-");
}

function taiCoCache(url: string, truong: string): Promise<BanDoBat | null> {
  const khoa = khoaDuAn();
  const now = Date.now();
  const cu = _cache.get(url);
  if (cu && cu.khoa === khoa && now < cu.han) return cu.promise;
  const muc: Muc = {
    khoa,
    han: now + TTL_CAU_HINH_NAV_MS,
    promise: fetch(`${url}?_=${now}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, unknown> | null) => {
        const v = d?.[truong];
        return v && typeof v === "object" && !Array.isArray(v) ? (v as BanDoBat) : null;
      })
      .catch(() => null)
      .then((ketQua) => {
        // Lỗi/401/không đúng hình dạng → không giữ, lần mount sau thử lại.
        if (ketQua == null && _cache.get(url) === muc) _cache.delete(url);
        return ketQua;
      }),
  };
  _cache.set(url, muc);
  return muc.promise;
}

/** Bản đồ bật/tắt dashboard (`settings` của GET /api/nav-settings); null = không tải được. */
export function taiCauHinhNav(): Promise<BanDoBat | null> {
  return taiCoCache("/api/nav-settings", "settings");
}

/** Cờ module theo dự án (`flags` của GET /api/feature-flags); null = không tải được. */
export function taiCoTinhNang(): Promise<BanDoBat | null> {
  return taiCoCache("/api/feature-flags", "flags");
}

/** Quên cấu hình đã tải — gọi khi đổi ngữ cảnh hoặc sau khi admin ghi nav-settings/feature-flags. */
export function xoaCacheCauHinhNav(): void {
  _cache.clear();
}
