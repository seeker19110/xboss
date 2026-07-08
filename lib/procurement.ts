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

export type PurchaseOrderRow = {
  id: number;
  poCode: string;
  status: string;
  expectedDate: string | null;
  note: string | null;
  createdAt: string;
  supplierId: number | null;
  supplierName: string | null;
  createdByName: string | null;
  itemCount: number;
  totalOrdered: number;
  totalReceived: number;
};

// Danh sách đơn hàng kèm tổng số lượng đặt/nhận. projectId (M22): undefined = không lọc
// dự án (dùng nội bộ/cron chưa gắn ngữ cảnh dự án).
export async function listPurchaseOrders(filter?: {
  status?: string;
  projectId?: number;
}): Promise<PurchaseOrderRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (filter?.status) {
    conds.push("po.status = ?");
    args.push(filter.status);
  }
  if (filter?.projectId != null) {
    conds.push("po.project_id = ?");
    args.push(filter.projectId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<PurchaseOrderRow>(
    `SELECT po.id, po.po_code AS "poCode", po.status,
            po.expected_date AS "expectedDate", po.note,
            po.created_at AS "createdAt",
            s.id AS "supplierId", s.name AS "supplierName",
            u.name AS "createdByName",
            COALESCE(pi.item_count, 0) AS "itemCount",
            COALESCE(pi.total_ordered, 0) AS "totalOrdered",
            COALESCE(pi.total_received, 0) AS "totalReceived"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       LEFT JOIN (
         SELECT po_id,
                COUNT(*) AS item_count,
                SUM(qty_ordered) AS total_ordered,
                SUM(qty_received) AS total_received
           FROM po_items GROUP BY po_id
       ) pi ON pi.po_id = po.id
      ${where}
      ORDER BY po.created_at DESC`,
    ...args,
  );
}

// projectId khi truyền → trả undefined nếu PO không thuộc dự án đang chọn (chặn truy
// cập chéo dự án qua đoán ID) — dùng cho route GET/PATCH/DELETE :id.
export async function getPurchaseOrder(
  id: number,
  projectId?: number,
): Promise<{ id: number; status: string } | undefined> {
  const conds = ["id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  return queryOne<{ id: number; status: string }>(
    `SELECT id, status FROM purchase_orders WHERE ${conds.join(" AND ")}`,
    ...args,
  );
}

export type VehicleRow = {
  id: number;
  plate: string;
  driver: string | null;
  driverPhone: string | null;
  cargo: string | null;
  gate: string | null;
  expectedAt: string;
  enteredAt: string | null;
  exitedAt: string | null;
  needsCrane: boolean;
  status: string;
  poId: number | null;
  poCode: string | null;
  supplierId: number | null;
  supplierName: string | null;
  createdAt: string;
};

// Danh sách xe ra vào — projectId (M22): undefined = không lọc dự án.
export async function listVehicles(filter?: {
  date?: string;
  projectId?: number;
}): Promise<VehicleRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (filter?.date) {
    conds.push("v.expected_at::date = ?");
    args.push(filter.date);
  }
  if (filter?.projectId != null) {
    conds.push("v.project_id = ?");
    args.push(filter.projectId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<VehicleRow>(
    `SELECT v.id, v.plate, v.driver, v.driver_phone AS "driverPhone",
            v.cargo, v.gate, v.expected_at AS "expectedAt",
            v.entered_at AS "enteredAt", v.exited_at AS "exitedAt",
            v.needs_crane AS "needsCrane", v.status,
            v.po_id AS "poId", po.po_code AS "poCode",
            v.supplier_id AS "supplierId", s.name AS "supplierName",
            v.created_at AS "createdAt"
       FROM vehicle_logs v
       LEFT JOIN purchase_orders po ON po.id = v.po_id
       LEFT JOIN suppliers s ON s.id = v.supplier_id
      ${where}
      ORDER BY v.expected_at`,
    ...args,
  );
}

// projectId khi truyền → trả undefined nếu xe không thuộc dự án đang chọn.
export async function getVehicle(
  id: number,
  projectId?: number,
): Promise<{ status: string; entered_at: string | null; exited_at: string | null } | undefined> {
  const conds = ["id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  return queryOne<{ status: string; entered_at: string | null; exited_at: string | null }>(
    `SELECT status, entered_at, exited_at FROM vehicle_logs WHERE ${conds.join(" AND ")}`,
    ...args,
  );
}

// PO chưa nhận đủ hàng (chưa received/reconciled/cancelled) mà đã quá ngày giao dự kiến.
export async function poLateList(): Promise<
  { id: number; poCode: string; expectedDate: string; supplierName: string | null }[]
> {
  return query(
    `SELECT po.id, po.po_code AS "poCode", po.expected_date AS "expectedDate",
            s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.expected_date IS NOT NULL AND po.expected_date < ?
        AND po.status NOT IN ('received', 'reconciled', 'cancelled')`,
    todayISO(),
  );
}

// Xe đã đăng ký, quá giờ dự kiến ≥2h mà vẫn chưa vào cổng (entered_at NULL).
export async function vehicleLateList(): Promise<
  { id: number; plate: string; expectedAt: string; supplierName: string | null }[]
> {
  return query(
    `SELECT v.id, v.plate, v.expected_at AS "expectedAt", s.name AS "supplierName"
       FROM vehicle_logs v
       LEFT JOIN suppliers s ON s.id = v.supplier_id
      WHERE v.entered_at IS NULL
        AND v.status NOT IN ('exited', 'no_show', 'cancelled')
        AND v.expected_at < NOW() - INTERVAL '2 hours'`,
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
