// Helper ngày tháng dùng chung — an toàn ở cả client lẫn server (không import lib/db).

// Hôm nay dạng ISO (YYYY-MM-DD) theo giờ Việt Nam (UTC+7, không có DST) —
// dùng UTC sẽ lệch ranh giới ngày 7 tiếng (0h–7h sáng trạng thái "trễ" tính sai).
export const todayISO = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// Ngày ISO cách hôm nay `days` ngày (âm = quá khứ), cùng múi giờ VN với todayISO —
// mọi phép cộng/trừ ngày phải đi qua đây, tự tính bằng UTC sẽ lệch 1 ngày lúc 0h–7h sáng.
export const daysFromTodayISO = (days: number) =>
  new Date(Date.now() + 7 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);

// Ngày ISO = `iso` + `days` ngày (âm = trừ lùi) — thuần cộng lịch, KHÔNG phụ thuộc "hôm
// nay" (khác daysFromTodayISO). Parse ép giờ UTC 00:00 để tránh lệch múi giờ khi cộng.
export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * 86400_000).toISOString().slice(0, 10);
}

// Định dạng ngày kiểu vi-VN (dd/mm/yyyy) cho hiển thị, "—" khi rỗng/không hợp lệ.
// Luôn ép ngày/tháng đủ 2 chữ số (Intl "vi-VN" mặc định KHÔNG đệm 0, vd "1/7/2026") —
// nguồn định dạng ngày dùng chung toàn app, sửa ở đây là sửa toàn cục.
export function formatDateVN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Định dạng ngày giờ kiểu vi-VN (dd/mm/yyyy hh:mm) cho hiển thị, "—" khi rỗng/không hợp lệ.
// Cùng cơ chế đệm 0 với formatDateVN — dùng cho mọi nơi hiển thị "tạo lúc/khoá lúc...".
export function formatDateTimeVN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

// Định dạng nhanh chuỗi ISO "YYYY-MM-DD" → "DD/MM/YYYY" bằng tách chuỗi (không
// qua Date/timezone) — dùng khi ngày chắc chắn có giá trị hợp lệ (vd chứng từ thanh toán).
export function formatDateDMY(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
