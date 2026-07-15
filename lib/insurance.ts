// M28 — Bảo hiểm & Bảo lãnh: sổ theo dõi bảo hiểm (công trình CAR, trách nhiệm bên thứ
// ba, tai nạn LĐ) + bảo lãnh (thực hiện HĐ, tạm ứng, bảo hành), gắn hợp đồng (nullable)
// + cảnh báo sắp hết hiệu lực. Xem docs/nang-cap/M28-bao-hiem-bao-lanh.md.
import { query, queryOne } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const INSURANCE_KINDS = [
  "car",
  "tnbt",
  "tai_nan_ld",
  "bao_lanh_thuc_hien",
  "bao_lanh_tam_ung",
  "bao_lanh_bao_hanh",
  "khac",
] as const;
export type InsuranceKind = (typeof INSURANCE_KINDS)[number];
export const INSURANCE_KIND_LABEL: Record<InsuranceKind, string> = {
  car: "Bảo hiểm công trình (CAR)",
  tnbt: "Bảo hiểm trách nhiệm bên thứ ba",
  tai_nan_ld: "Bảo hiểm tai nạn lao động",
  bao_lanh_thuc_hien: "Bảo lãnh thực hiện HĐ",
  bao_lanh_tam_ung: "Bảo lãnh tạm ứng",
  bao_lanh_bao_hanh: "Bảo lãnh bảo hành",
  khac: "Khác",
};

// Nhóm hiển thị (KPI/lọc) — bảo hiểm vs bảo lãnh, gộp từ INSURANCE_KINDS.
export const INSURANCE_CATEGORY_KINDS: InsuranceKind[] = ["car", "tnbt", "tai_nan_ld"];
export const BOND_CATEGORY_KINDS: InsuranceKind[] = [
  "bao_lanh_thuc_hien",
  "bao_lanh_tam_ung",
  "bao_lanh_bao_hanh",
];

export const INSURANCE_STATUSES = ["valid", "expired", "released"] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];
export const INSURANCE_STATUS_LABEL: Record<InsuranceStatus, string> = {
  valid: "Còn hiệu lực",
  expired: "Hết hạn",
  released: "Đã tất toán/thu hồi",
};

// Ngưỡng cảnh báo sắp hết hiệu lực (ngày) — hằng số, giống pattern EXPIRY_WARN_DAYS của HĐ.
export const INSURANCE_EXPIRY_WARN_DAYS = 30;

export type InsuranceBondRow = {
  id: number;
  projectId: number | null;
  contractId: number | null;
  contractTitle: string | null;
  contractCode: string | null;
  kind: InsuranceKind;
  title: string;
  provider: string | null;
  code: string | null;
  value: number | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: InsuranceStatus;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  deletedAt: string | null;
};

// Danh sách bảo hiểm/bảo lãnh — projectId (M22): undefined = không lọc dự án (test cũ/nội bộ).
export async function listInsuranceBonds(
  projectId?: number,
  filters?: { kind?: InsuranceKind; deletedView?: "alive" | "deleted" | "all" },
): Promise<InsuranceBondRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (projectId != null) {
    conds.push("b.project_id = ?");
    args.push(projectId);
  }
  if (filters?.kind) {
    conds.push("b.kind = ?");
    args.push(filters.kind);
  }
  // Soft-delete (M45 PR4): mặc định chỉ dòng còn sống.
  const dv = filters?.deletedView ?? "alive";
  if (dv === "alive") conds.push("b.deleted_at IS NULL");
  else if (dv === "deleted") conds.push("b.deleted_at IS NOT NULL");
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<InsuranceBondRow>(
    `SELECT b.id, b.project_id AS "projectId", b.contract_id AS "contractId",
            c.title AS "contractTitle", c.code AS "contractCode",
            b.kind, b.title, b.provider, b.code, b.value,
            b.issued_date AS "issuedDate", b.expiry_date AS "expiryDate",
            b.status, b.note,
            b.file_name AS "fileName", b.original_name AS "originalName",
            b.mime_type AS "mimeType", b.size_bytes AS "sizeBytes",
            b.created_by AS "createdBy", u.name AS "createdByName", b.created_at AS "createdAt",
            b.deleted_at AS "deletedAt"
       FROM insurance_bonds b
       LEFT JOIN contracts c ON c.id = b.contract_id
       LEFT JOIN users u ON u.id = b.created_by
      ${where}
      ORDER BY b.kind, b.id DESC`,
    ...args,
  );
}

export type ExpiringInsuranceBond = {
  id: number;
  code: string | null;
  title: string;
  expiryDate: string;
  expired: boolean; // true = đã quá hạn (expiry_date < hôm nay)
};

// Bảo hiểm/bảo lãnh đang 'valid' có expiry_date trong vòng `days` ngày tới (gồm cả đã
// quá hạn mà chưa đổi trạng thái) — so sánh chuỗi ngày (quy ước lớp DB: DATE giữ nguyên
// string). projectId undefined = không lọc dự án.
export async function expiringInsuranceBonds(
  days = INSURANCE_EXPIRY_WARN_DAYS,
  projectId?: number,
): Promise<ExpiringInsuranceBond[]> {
  const limit = daysFromTodayISO(days);
  const today = todayISO();
  const conds = [
    "deleted_at IS NULL",
    "status = 'valid'",
    "expiry_date IS NOT NULL",
    "expiry_date <= ?",
  ];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ id: number; code: string | null; title: string; expiryDate: string }>(
    `SELECT id, code, title, expiry_date AS "expiryDate"
       FROM insurance_bonds
      WHERE ${conds.join(" AND ")}
      ORDER BY expiry_date`,
    ...args,
  );
  return rows.map((r) => ({ ...r, expired: r.expiryDate < today }));
}

export type InsuranceInput = {
  contractId: number | null;
  kind: InsuranceKind;
  title: string;
  provider: string | null;
  code: string | null;
  value: number | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: InsuranceStatus;
  note: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
export function validateInsuranceInput(input: InsuranceInput): string | null {
  if (!input.title.trim()) return "Thiếu tên bảo hiểm/bảo lãnh";
  if (!INSURANCE_KINDS.includes(input.kind)) return "Loại bảo hiểm/bảo lãnh không hợp lệ";
  if (!INSURANCE_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  if (input.contractId != null && !Number.isFinite(input.contractId))
    return "Hợp đồng gắn không hợp lệ";
  for (const [label, d] of [
    ["Ngày cấp", input.issuedDate],
    ["Ngày hết hạn", input.expiryDate],
  ] as const) {
    if (d != null && !DATE_RE.test(d)) return `${label} không đúng định dạng YYYY-MM-DD`;
  }
  if (input.issuedDate && input.expiryDate && input.issuedDate > input.expiryDate)
    return "Ngày cấp phải trước hoặc bằng ngày hết hạn";
  if (input.value != null && (!Number.isFinite(input.value) || input.value < 0))
    return "Giá trị phải là số không âm";
  return null;
}

// Kiểm tra HĐ gắn (nếu có) tồn tại VÀ thuộc đúng dự án đang chọn — chống gán nhầm HĐ
// dự án khác. Trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ/không gắn HĐ.
export async function checkInsuranceContractRef(
  contractId: number | null,
  projectId: number,
): Promise<string | null> {
  if (contractId == null) return null;
  const contract = await queryOne<{ id: number }>(
    `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
    contractId,
    projectId,
  );
  if (!contract) return "Hợp đồng gắn không tồn tại hoặc không thuộc dự án đang chọn";
  return null;
}

// Đọc body JSON/form thành InsuranceInput (POST dùng nguyên, PATCH merge với bản ghi cũ).
export function parseInsuranceBody(body: Record<string, unknown>): InsuranceInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN; // NaN → validate bắt lỗi rõ ràng
  };
  return {
    contractId: body.contractId != null && body.contractId !== "" ? Number(body.contractId) : null,
    kind: str(body.kind) as InsuranceKind,
    title: str(body.title),
    provider: strOrNull(body.provider),
    code: strOrNull(body.code),
    value: numOrNull(body.value),
    issuedDate: strOrNull(body.issuedDate),
    expiryDate: strOrNull(body.expiryDate),
    status: (str(body.status) || "valid") as InsuranceStatus,
    note: strOrNull(body.note),
  };
}
