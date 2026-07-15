// M16 — Sổ hợp đồng: danh mục loại/trạng thái, validate thuần (unit test được),
// query tổng hợp giá trị + đã thanh toán theo HĐ, và danh sách HĐ sắp hết hiệu lực
// (nguồn cho notification contract_expiry ở PR 3). Xem docs/nang-cap/M16-hop-dong.md.
import { query, queryOne } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const CONTRACT_KINDS = ["nhan_thau", "giao_thau", "ncc"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  nhan_thau: "Nhận thầu",
  giao_thau: "Giao thầu",
  ncc: "Nhà cung cấp",
};

export const CONTRACT_STATUSES = ["draft", "active", "completed", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Nháp",
  active: "Hiệu lực",
  completed: "Hoàn thành",
  terminated: "Chấm dứt",
};

// Ngưỡng cảnh báo sắp hết hiệu lực (ngày) — hằng số, chưa cần settings riêng (YAGNI).
export const EXPIRY_WARN_DAYS = 30;

export type ContractInput = {
  code: string;
  kind: ContractKind;
  title: string;
  partySupplierId: number | null;
  partyName: string | null;
  systemId: number | null;
  value: number;
  advancePct: number;
  retentionPct: number;
  signedDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: ContractStatus;
  note: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validate thuần — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
// Không chạm DB (tồn tại supplier/system do route kiểm riêng).
export function validateContractInput(input: ContractInput): string | null {
  if (!input.code.trim()) return "Thiếu số hợp đồng";
  if (!input.title.trim()) return "Thiếu tên hợp đồng";
  if (!CONTRACT_KINDS.includes(input.kind)) return "Loại hợp đồng không hợp lệ";
  if (!CONTRACT_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (!Number.isFinite(input.value) || input.value < 0) return "Giá trị hợp đồng phải ≥ 0";
  for (const [label, pct] of [
    ["% tạm ứng", input.advancePct],
    ["% giữ lại bảo hành", input.retentionPct],
  ] as const) {
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return `${label} phải trong khoảng 0–100`;
  }
  for (const [label, d] of [
    ["Ngày ký", input.signedDate],
    ["Hiệu lực từ", input.validFrom],
    ["Hiệu lực đến", input.validTo],
  ] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  if (input.validFrom && input.validTo && input.validFrom > input.validTo)
    return "Hiệu lực từ phải trước hoặc bằng hiệu lực đến";
  if (input.kind === "nhan_thau" && !input.partyName?.trim())
    return "Hợp đồng nhận thầu cần tên CĐT/tổng thầu (partyName)";
  if (input.kind !== "nhan_thau" && input.partySupplierId == null)
    return "Hợp đồng giao thầu/NCC cần chọn đối tác (partySupplierId)";
  return null;
}

// Đọc body JSON thành ContractInput (POST dùng nguyên, PATCH merge với bản ghi cũ).
// Đặt ở lib (không phải route) vì route file App Router chỉ được export handler.
export function parseContractBody(body: Record<string, unknown>): ContractInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: str(body.code),
    kind: str(body.kind) as ContractKind,
    title: str(body.title),
    partySupplierId: body.partySupplierId != null ? Number(body.partySupplierId) : null,
    partyName: strOrNull(body.partyName),
    systemId: body.systemId != null ? Number(body.systemId) : null,
    value: body.value != null ? Number(body.value) : 0,
    advancePct: body.advancePct != null ? Number(body.advancePct) : 0,
    retentionPct: body.retentionPct != null ? Number(body.retentionPct) : 0,
    signedDate: strOrNull(body.signedDate),
    validFrom: strOrNull(body.validFrom),
    validTo: strOrNull(body.validTo),
    status: (str(body.status) || "active") as ContractStatus,
    note: strOrNull(body.note),
  };
}

// Kiểm FK tồn tại (supplier/system) — trả thông điệp lỗi hoặc null.
export async function checkContractRefs(input: ContractInput): Promise<string | null> {
  if (input.partySupplierId != null) {
    if (
      !Number.isInteger(input.partySupplierId) ||
      !(await queryOne(`SELECT id FROM suppliers WHERE id = ?`, input.partySupplierId))
    )
      return "Đối tác (NCC/thầu phụ) không tồn tại";
  }
  if (input.systemId != null) {
    if (
      !Number.isInteger(input.systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, input.systemId))
    )
      return "Hệ không hợp lệ";
  }
  return null;
}

export type ContractRow = {
  id: number;
  code: string;
  kind: ContractKind;
  title: string;
  partySupplierId: number | null;
  partySupplierName: string | null;
  partyName: string | null;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  value: number;
  advancePct: number;
  retentionPct: number;
  signedDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: ContractStatus;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
  addendaTotal: number;
  paid: number;
  poCommitted: number;
  deletedAt: string | null;
};

// Bộ lọc soft-delete (M45 PR4): mặc định chỉ dòng còn sống.
export type DeletedView = "alive" | "deleted" | "all";

// Danh sách HĐ kèm tổng hợp: tổng giá trị (gốc + phụ lục), đã thanh toán
// (Σ payment_bills mọi type kể cả advance — nhất quán quyết định M2), giá trị PO
// gắn HĐ (loại đơn huỷ). Còn lại = value + addendaTotal − paid (tính phía gọi).
// projectId (M22): undefined = không lọc dự án (dùng nội bộ/test cũ).
export async function listContracts(
  kind?: ContractKind,
  projectId?: number,
  deletedView: DeletedView = "alive",
): Promise<ContractRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (kind) {
    conds.push("c.kind = ?");
    args.push(kind);
  }
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  if (deletedView === "alive") conds.push("c.deleted_at IS NULL");
  else if (deletedView === "deleted") conds.push("c.deleted_at IS NOT NULL");
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<ContractRow>(
    `SELECT c.id, c.code, c.kind, c.title,
            c.party_supplier_id AS "partySupplierId", s.name AS "partySupplierName",
            c.party_name AS "partyName",
            c.system_id AS "systemId", d.code AS "systemCode",
            d.name AS "systemName", d.color AS "systemColor",
            c.value, c.advance_pct AS "advancePct", c.retention_pct AS "retentionPct",
            c.signed_date AS "signedDate", c.valid_from AS "validFrom", c.valid_to AS "validTo",
            c.status, c.note, c.created_by AS "createdBy", c.created_at AS "createdAt",
            COALESCE(a.total, 0) AS "addendaTotal",
            COALESCE(p.total, 0) AS "paid",
            COALESCE(po.total, 0) AS "poCommitted",
            c.deleted_at AS "deletedAt"
       FROM contracts c
       LEFT JOIN suppliers s ON s.id = c.party_supplier_id
       LEFT JOIN systems d ON d.id = c.system_id
       LEFT JOIN (SELECT contract_id, SUM(value_delta) AS total
                    FROM contract_addenda GROUP BY contract_id) a ON a.contract_id = c.id
       LEFT JOIN (SELECT contract_id, SUM(amount) AS total
                    FROM payment_bills WHERE contract_id IS NOT NULL
                   GROUP BY contract_id) p ON p.contract_id = c.id
       LEFT JOIN (SELECT po.contract_id, SUM(poi.qty_ordered * COALESCE(poi.unit_price, 0)) AS total
                    FROM purchase_orders po
                    JOIN po_items poi ON poi.po_id = po.id
                   WHERE po.contract_id IS NOT NULL AND po.status <> 'cancelled'
                   GROUP BY po.contract_id) po ON po.contract_id = c.id
      ${where}
      ORDER BY c.kind, c.code`,
    ...args,
  );
}

export type ExpiringContract = {
  id: number;
  code: string;
  title: string;
  validTo: string;
  expired: boolean; // true = đã quá hạn (valid_to < hôm nay), false = sắp hết hạn
};

// HĐ đang active có valid_to trong vòng `days` ngày tới (gồm cả đã quá hạn mà chưa
// đổi trạng thái) — so sánh chuỗi ngày theo quy ước lớp DB (DATE giữ nguyên string).
// projectId (M22): undefined = không lọc.
export async function expiringContracts(
  days = EXPIRY_WARN_DAYS,
  projectId?: number,
): Promise<ExpiringContract[]> {
  const limit = daysFromTodayISO(days);
  const today = todayISO();
  const conds = [
    "deleted_at IS NULL",
    "status = 'active'",
    "valid_to IS NOT NULL",
    "valid_to <= ?",
  ];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ id: number; code: string; title: string; validTo: string }>(
    `SELECT id, code, title, valid_to AS "validTo"
       FROM contracts
      WHERE ${conds.join(" AND ")}
      ORDER BY valid_to`,
    ...args,
  );
  return rows.map((r) => ({ ...r, expired: r.validTo < today }));
}

// Số bản ghi dòng tiền đang gắn vào HĐ — dùng chặn DELETE (409 khi > 0, phải gỡ
// liên kết trước để không mất dấu vết tiền đã chi).
export async function contractLinkCounts(
  contractId: number,
): Promise<{ bills: number; pos: number; floorContracts: number; boqItems: number }> {
  const row = await queryOne<{
    bills: number;
    pos: number;
    floorContracts: number;
    boqItems: number;
  }>(
    `SELECT (SELECT COUNT(*) FROM payment_bills   WHERE contract_id = ?) AS bills,
            (SELECT COUNT(*) FROM purchase_orders WHERE contract_id = ?) AS pos,
            (SELECT COUNT(*) FROM floor_contracts WHERE contract_id = ?) AS "floorContracts",
            (SELECT COUNT(*) FROM boq_items       WHERE contract_id = ?) AS "boqItems"`,
    contractId,
    contractId,
    contractId,
    contractId,
  );
  return row ?? { bills: 0, pos: 0, floorContracts: 0, boqItems: 0 };
}
