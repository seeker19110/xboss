// M4 — NCC & đơn hàng nâng cao: dòng đời PO (stepper 6 bước + huỷ), đánh giá NCC/công nợ,
// cảnh báo PO trễ giao + xe NCC quá giờ. Logic tách khỏi route để test tích hợp trực tiếp
// (cùng pattern lib/cost.ts, lib/qaqc.ts). Xem docs/nang-cap/M04-ncc-don-hang.md.
import { query, queryOne, run, todayISO } from "@/lib/db";

// Trạng thái PO là cột TEXT không CHECK constraint (giữ tương thích dữ liệu cũ) — thứ tự
// tiến (không nhảy cóc) validate ở đây. "partial"/"received" do route /receive tự set theo
// số lượng đã nhận (không qua validator này) — "delivering"/"reconciled" là bước thủ công mới.
export const PO_STATUS_ORDER = [
  "draft",
  "confirmed",
  "delivering",
  "partial",
  "received",
  "reconciled",
] as const;
export type PoStatus = (typeof PO_STATUS_ORDER)[number] | "cancelled";
export const PO_ALL_STATUSES: string[] = [...PO_STATUS_ORDER, "cancelled"];

// Bước tiến thủ công hợp lệ (không tính "partial"/"received" — do /receive tự set).
const MANUAL_FORWARD: Record<string, string> = {
  draft: "confirmed",
  confirmed: "delivering",
  received: "reconciled",
};
// Huỷ được từ các trạng thái chưa nhận đủ hàng (draft dùng xoá thay vì huỷ — xem DELETE route).
const CANCELLABLE_FROM = new Set(["confirmed", "delivering", "partial"]);

export function isValidPoTransition(from: string, to: string): boolean {
  if (!PO_ALL_STATUSES.includes(to)) return false;
  if (from === to) return true;
  if (to === "cancelled") return CANCELLABLE_FROM.has(from);
  return MANUAL_FORWARD[from] === to;
}

// PO chưa nhận đủ hàng (chưa received/reconciled/cancelled) mà đã quá ngày giao dự kiến.
// projectId: lọc theo dự án đang chọn (đa dự án, M22+) — không truyền = không lọc (mọi dự án).
export async function poLateList(
  projectId?: number,
): Promise<{ id: number; poCode: string; expectedDate: string; supplierName: string | null }[]> {
  const projectFilter = projectId != null ? " AND po.project_id = ?" : "";
  return query(
    `SELECT po.id, po.po_code AS "poCode", po.expected_date AS "expectedDate",
            s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.expected_date IS NOT NULL AND po.expected_date < ?
        AND po.status NOT IN ('received', 'reconciled', 'cancelled')${projectFilter}`,
    ...(projectId != null ? [todayISO(), projectId] : [todayISO()]),
  );
}

// Xe đã đăng ký, quá giờ dự kiến ≥2h mà vẫn chưa vào cổng (entered_at NULL).
// projectId: lọc theo dự án đang chọn — không truyền = không lọc.
export async function vehicleLateList(
  projectId?: number,
): Promise<{ id: number; plate: string; expectedAt: string; supplierName: string | null }[]> {
  const projectFilter = projectId != null ? " AND v.project_id = ?" : "";
  return query(
    `SELECT v.id, v.plate, v.expected_at AS "expectedAt", s.name AS "supplierName"
       FROM vehicle_logs v
       LEFT JOIN suppliers s ON s.id = v.supplier_id
      WHERE v.entered_at IS NULL
        AND v.status NOT IN ('exited', 'no_show', 'cancelled')
        AND v.expected_at < NOW() - INTERVAL '2 hours'${projectFilter}`,
    ...(projectId != null ? [projectId] : []),
  );
}

export type SupplierSummary = {
  ratingsCount: number;
  avgQuality: number | null;
  avgDelivery: number | null;
  avgPrice: number | null;
  totalOrdered: number;
  totalPaid: number;
  debt: number;
  ratings: {
    id: number;
    poId: number | null;
    poCode: string | null;
    quality: number | null;
    delivery: number | null;
    price: number | null;
    note: string | null;
    ratedByName: string | null;
    createdAt: string;
  }[];
};

// Điểm TB 3 tiêu chí + công nợ (Σ giá trị PO chưa huỷ − Σ payment_bills đã trả cho NCC đó,
// khớp qua payment_bills.responsible_supplier_id — backfill ở M2).
export async function supplierSummary(supplierId: number): Promise<SupplierSummary> {
  const agg = await queryOne<{
    ratingsCount: number;
    avgQuality: number | null;
    avgDelivery: number | null;
    avgPrice: number | null;
  }>(
    `SELECT COUNT(*)::int AS "ratingsCount",
            AVG(quality) AS "avgQuality", AVG(delivery) AS "avgDelivery", AVG(price) AS "avgPrice"
       FROM supplier_ratings WHERE supplier_id = ?`,
    supplierId,
  );

  const ordered = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(poi.qty_ordered * COALESCE(poi.unit_price, 0)), 0) AS total
       FROM po_items poi
       JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.supplier_id = ? AND po.status <> 'cancelled'`,
    supplierId,
  );
  const paid = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payment_bills WHERE responsible_supplier_id = ?`,
    supplierId,
  );

  const ratings = await query<SupplierSummary["ratings"][number]>(
    `SELECT r.id, r.po_id AS "poId", po.po_code AS "poCode",
            r.quality, r.delivery, r.price, r.note,
            u.name AS "ratedByName", r.created_at AS "createdAt"
       FROM supplier_ratings r
       LEFT JOIN purchase_orders po ON po.id = r.po_id
       LEFT JOIN users u ON u.id = r.rated_by
      WHERE r.supplier_id = ?
      ORDER BY r.created_at DESC`,
    supplierId,
  );

  const totalOrdered = ordered?.total ?? 0;
  const totalPaid = paid?.total ?? 0;
  return {
    ratingsCount: agg?.ratingsCount ?? 0,
    avgQuality: agg?.avgQuality != null ? Number(agg.avgQuality) : null,
    avgDelivery: agg?.avgDelivery != null ? Number(agg.avgDelivery) : null,
    avgPrice: agg?.avgPrice != null ? Number(agg.avgPrice) : null,
    totalOrdered,
    totalPaid,
    debt: totalOrdered - totalPaid,
    ratings,
  };
}

// Hành động thao tác xe tại cổng (nút to, 1 chạm) → trạng thái đích + điều kiện xuất phát.
// Idempotent: gọi lại hành động đã ở đúng đích trả về chính trạng thái đó (route không UPDATE
// lại timestamp entered_at/exited_at nếu đã có — xem app/api/vehicles/[id]/route.ts).
export type VehicleAction = "approve" | "enter" | "exit" | "no_show" | "cancel";
const VEHICLE_ACTION_FROM: Record<VehicleAction, string[]> = {
  approve: ["registered"],
  enter: ["registered", "approved"],
  exit: ["entered"],
  no_show: ["registered", "approved"],
  cancel: ["registered", "approved"],
};
const VEHICLE_ACTION_TO: Record<VehicleAction, string> = {
  approve: "approved",
  enter: "entered",
  exit: "exited",
  no_show: "no_show",
  cancel: "cancelled",
};
export function nextVehicleStatus(action: VehicleAction, current: string): string | null {
  const target = VEHICLE_ACTION_TO[action];
  if (current === target) return current; // idempotent: đã ở đích, không phải lỗi
  if (!VEHICLE_ACTION_FROM[action].includes(current)) return null; // sai thứ tự
  return target;
}

// Ghi audit đổi trạng thái PO (đối xứng task_history) — gọi trong cùng transaction với UPDATE.
export async function logPoStatusChange(
  poId: number,
  fromStatus: string | null,
  toStatus: string,
  changedBy: number,
): Promise<void> {
  await run(
    `INSERT INTO po_status_history (po_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)`,
    poId,
    fromStatus,
    toStatus,
    changedBy,
  );
}
