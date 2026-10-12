// Link click-through tới lưới tracking của một task (M132). Slug sheet chỉ duy nhất TRONG một dự án
// (migration 0161) — link từ thông báo/push phải mang `project` để trang tracking đổi đúng dự án trước
// khi tải lưới, thay vì giải slug theo dự án đang chọn (mở nhầm sheet cùng slug của dự án khác).

export const THAM_SO_DU_AN = "project";

export function linkTracking(
  slug: string,
  opts: { floor?: string | null; projectId?: number | null } = {},
): string {
  const q = new URLSearchParams();
  if (opts.floor) q.set("floor", opts.floor);
  if (opts.projectId != null) q.set(THAM_SO_DU_AN, String(opts.projectId));
  const s = q.toString();
  return `/tracking/${encodeURIComponent(slug)}${s ? `?${s}` : ""}`;
}

/** Id dự án hợp lệ từ chuỗi (query/cookie): số nguyên dương thập phân canonical, không thì null. */
export function docIdDuAn(raw: string | null | undefined): number | null {
  if (!raw || !/^[1-9][0-9]{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Trang tracking mở với `?project=`: `khong-co` (không tham số) · `go-tham-so` (trùng dự án đang chọn,
 * hoặc tham số hỏng — chỉ gỡ khỏi URL) · `chuyen` (khác dự án / chưa có cookie → đổi dự án trước khi tải).
 */
export function quyetDinhDuAnTuLink(
  thamSo: string | null,
  duAnHienTai: number | null,
): "khong-co" | "go-tham-so" | "chuyen" {
  if (thamSo == null) return "khong-co";
  const id = docIdDuAn(thamSo);
  if (id == null || id === duAnHienTai) return "go-tham-so";
  return "chuyen";
}
