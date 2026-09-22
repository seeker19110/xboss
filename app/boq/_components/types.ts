// Type + helper dùng chung giữa trang /boq và các modal đã tách (M124 việc 2).

export type NormResourceType = "material" | "labor" | "equipment";
export const NORM_RESOURCE_TYPE_LABEL: Record<NormResourceType, string> = {
  material: "Vật tư",
  labor: "Nhân công",
  equipment: "Máy",
};

export type MapEntry = {
  taskId: number;
  taskCode: string;
  taskName: string;
  weight: number;
  progressPercent: number;
};
export type BoqItem = {
  id: number;
  code: string;
  name: string;
  unit: string;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  qtyContract: number;
  unitPrice: number;
  qtySub: number;
  subUnitPrice: number;
  note: string | null;
  sortOrder: number;
  voId: number | null;
  voCode: string | null;
  voStatus: string | null;
  qtyApproved: number | null;
  map: MapEntry[];
  executedQty: number;
};

// Lịch sử thay đổi 1 dòng BOQ (M124 việc 3) — khớp DongLichSuBoq của lib/khoi-luong/boq-history.ts.
export type DongLichSuBoq = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: number | null;
  changedByName: string | null;
  changedAt: string;
};

/** Nhãn tiếng Việt cho từng field lưu trong `boq_item_history.field`. */
export const LICH_SU_BOQ_FIELD_LABEL: Record<string, string> = {
  code: "Mã BOQ",
  name: "Tên",
  unit: "Đơn vị tính",
  system_id: "Hệ",
  qty_contract: "KL nhận thầu",
  unit_price: "Đơn giá",
  qty_sub: "KL giao thầu phụ",
  sub_unit_price: "Đơn giá giao thầu phụ",
  note: "Ghi chú",
  import: "Import từ Excel",
};

export const VO_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  partially_approved: "Duyệt một phần",
  rejected: "Từ chối",
  contract_added: "Đã vào phụ lục HĐ",
};
export type SystemOption = { id: number; code: string; name: string };
export type TaskHit = { id: number; code: string; name: string; sheetType: string };
// Gợi ý task theo tầng (M124 việc 1) — khớp TaskTheoTang của lib/khoi-luong/boq-map-tang.ts.
export type TaskTheoTang = {
  id: number;
  code: string;
  name: string;
  sheetName: string;
  pkgCode: string;
  pkgName: string;
  progressPercent: number;
  daMapDongKhac: boolean;
  diemGiong: number;
};
/** Từ điểm này trở lên coi là "chắc chắn cùng việc" ⇒ tick sẵn hộ người dùng. */
export const NGUONG_TICK_SAN = 0.5;

/**
 * Lệch quá mức này mới coi là Σ tỷ trọng "bất thường" — PHẢI khớp
 * `lib/khoi-luong/boq-coverage.ts` (không import thẳng được ở đây: file đó chạm `lib/db`/`pg`,
 * kéo vào bundle client sẽ vỡ build). Đổi giá trị bên đó thì nhớ đổi luôn ở đây.
 */
export const NGUONG_LECH_WEIGHT = 0.01;

export function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}
export function fmtQty(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

// sw.js áp stale-while-revalidate cho mọi GET /api/* — gọi lại đúng URL ngay sau khi
// tự mình vừa ghi (thêm/sửa/xoá/import) có thể nhận lại bản cache cũ. Thêm nonce để
// bỏ qua cache đúng những lần load lại này (pattern đã dùng ở app/drawings/page.tsx).
export function fetchFresh(url: string): Promise<Response> {
  const sep = url.includes("?") ? "&" : "?";
  return fetch(`${url}${sep}_=${Date.now()}`, { cache: "no-store" });
}
