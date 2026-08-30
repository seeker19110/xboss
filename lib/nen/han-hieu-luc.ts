// Hạn hiệu lực của hồ sơ (giấy phép môi trường, hồ sơ pháp lý, bảo lãnh/bảo hiểm,
// chứng chỉ nhân sự) — 4 trang đều cần "còn hạn / sắp hết hạn / quá hạn".
//
// Vì sao gom về đây: logic này trước đây chép tay ở `app/environment`, `app/kickoff`,
// `app/insurance` (hàm `isExpiringSoon`/`isExpired` giống hệt nhau) và `app/personnel`
// (hàm `certBadge` cùng ngưỡng). Cả 4 bản đều tính mốc cảnh báo bằng
// `new Date(Date.now() + N * 86400_000)` — tức UTC THUẦN, trong khi `todayISO()` mà chúng
// so sánh cùng lại theo giờ VN (UTC+7). Hệ quả: khoảng 0h–7h sáng giờ VN, mốc cảnh báo
// lùi 1 ngày so với "hôm nay", nên hồ sơ hết hạn đúng ngày thứ 30 KHÔNG được cảnh báo.
// Đúng cái bẫy mà chú thích của `daysFromTodayISO` trong lib/nen/date.ts đã dặn trước.
// Ở đây đi qua `daysFromTodayISO` nên hai đầu so sánh cùng múi giờ.
import { todayISO, daysFromTodayISO } from "@/lib/nen/date";

/** Số ngày trước hạn thì bắt đầu cảnh báo "sắp hết hạn". */
export const EXPIRY_WARN_DAYS = 30;

export type TrangThaiHan = "khong_han" | "qua_han" | "sap_het_han" | "con_han";

/**
 * Trạng thái hạn CHỈ theo ngày — không xét `status` của hồ sơ.
 * Dùng cho nơi mọi bản ghi đều cần nhãn hạn (vd chứng chỉ nhân sự).
 */
export function trangThaiHanTheoNgay(
  expiryDate?: string | null,
  warnDays: number = EXPIRY_WARN_DAYS,
): TrangThaiHan {
  if (!expiryDate) return "khong_han";
  if (expiryDate < todayISO()) return "qua_han";
  if (expiryDate <= daysFromTodayISO(warnDays)) return "sap_het_han";
  return "con_han";
}

/** Hồ sơ có hạn: chỉ cần 2 trường này để xét. */
export type CoHanHieuLuc = { status?: string | null; expiryDate?: string | null };

/**
 * Quá hạn — CHỈ tính cho hồ sơ đang hiệu lực (`status === "valid"`). Hồ sơ đã bị thay thế
 * (`superseded`) hay đã đánh dấu `expired` thì không cảnh báo lại.
 */
export function isExpired(rec: CoHanHieuLuc): boolean {
  return rec.status === "valid" && trangThaiHanTheoNgay(rec.expiryDate) === "qua_han";
}

/** Sắp hết hạn (trong `warnDays` ngày tới) — cùng điều kiện `status` như `isExpired`. */
export function isExpiringSoon(rec: CoHanHieuLuc, warnDays: number = EXPIRY_WARN_DAYS): boolean {
  return rec.status === "valid" && trangThaiHanTheoNgay(rec.expiryDate, warnDays) === "sap_het_han";
}
