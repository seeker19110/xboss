// M6 — Phát sinh/thay đổi khối lượng (VO — variation order): danh mục lý do/trạng
// thái, validate thuần, và các query tổng hợp (danh sách VO + dòng KL, VO quá hạn
// chưa quyết). Dòng KL của VO dùng chung bảng boq_items (vo_id, qty_approved) —
// xem docs/nang-cap/M06-phat-sinh-vo.md.
import { query } from "@/lib/db";
import { daysFromTodayISO } from "@/lib/date";
import { boqTakenBy } from "@/lib/boq";
import { nextSeqCode } from "@/lib/seqcode";
import { isAdminOrPm, type User } from "@/lib/auth";

export const VO_REASONS = ["design_change", "client_request", "site_condition", "other"] as const;
export type VoReason = (typeof VO_REASONS)[number];
export const VO_REASON_LABEL: Record<VoReason, string> = {
  design_change: "Thay đổi thiết kế",
  client_request: "Yêu cầu CĐT",
  site_condition: "Điều kiện hiện trường",
  other: "Khác",
};

export const VO_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "partially_approved",
  "rejected",
  "contract_added",
] as const;
export type VoStatus = (typeof VO_STATUSES)[number];
export const VO_STATUS_LABEL: Record<VoStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  partially_approved: "Duyệt một phần",
  rejected: "Từ chối",
  contract_added: "Đã vào phụ lục HĐ",
};

// Trạng thái coi là "đã duyệt" (đóng góp vào ngân sách/KL nhận thầu, dùng ở
// lib/boq.ts + lib/cost.ts + M17 sau này).
export const VO_APPROVED_STATUSES: VoStatus[] = [
  "approved",
  "partially_approved",
  "contract_added",
];

// Notification vo_pending: VO ở trạng thái 'submitted' quá N ngày chưa được quyết.
export const VO_PENDING_DAYS = 7;

export type VoLineInput = {
  code: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
};

export type VoInput = {
  title: string;
  reason: VoReason;
  description: string | null;
  disciplineId: number | null;
  lines: VoLineInput[];
};

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null.
export function validateVoInput(input: VoInput): string | null {
  if (!input.title.trim()) return "Thiếu tên phát sinh";
  if (!VO_REASONS.includes(input.reason)) return "Lý do phát sinh không hợp lệ";
  if (!Array.isArray(input.lines) || input.lines.length === 0)
    return "Cần ít nhất 1 dòng khối lượng";

  const seen = new Set<string>();
  for (const [i, line] of input.lines.entries()) {
    const n = i + 1;
    if (!line.code?.trim()) return `Dòng ${n}: thiếu mã`;
    if (!line.name?.trim()) return `Dòng ${n}: thiếu tên`;
    if (!line.unit?.trim()) return `Dòng ${n}: thiếu đơn vị tính`;
    if (!Number.isFinite(line.qty) || line.qty <= 0) return `Dòng ${n}: khối lượng phải > 0`;
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0)
      return `Dòng ${n}: đơn giá phải ≥ 0`;
    const key = line.code.trim().toLowerCase();
    if (seen.has(key))
      return `Dòng ${n}: mã "${line.code}" trùng với dòng khác trong cùng phát sinh`;
    seen.add(key);
  }
  return null;
}

export function parseVoBody(body: Record<string, unknown>): VoInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  return {
    title: str(body.title),
    reason: str(body.reason) as VoReason,
    description: strOrNull(body.description),
    disciplineId: body.disciplineId != null ? Number(body.disciplineId) : null,
    lines: lines.map((l) => {
      const line = (l ?? {}) as Record<string, unknown>;
      return {
        code: str(line.code),
        name: str(line.name),
        unit: str(line.unit),
        qty: line.qty != null ? Number(line.qty) : NaN,
        unitPrice: line.unitPrice != null ? Number(line.unitPrice) : NaN,
      };
    }),
  };
}

// Check mã dòng KL không trùng BOQCODE toàn hệ thống (task/package/material/boq_item khác).
// Trả thông điệp lỗi dòng đầu tiên bị trùng, hoặc null nếu tất cả đều rảnh.
export async function checkVoLinesTaken(lines: VoLineInput[]): Promise<string | null> {
  for (const line of lines) {
    const takenBy = await boqTakenBy(line.code.trim());
    if (takenBy) return `Mã "${line.code}" đã được dùng bởi ${takenBy}`;
  }
  return null;
}

export type VoLineRow = {
  id: number;
  code: string;
  name: string;
  unit: string;
  qtyProposed: number;
  qtyApproved: number | null;
  unitPrice: number;
};

export type VoRow = {
  id: number;
  code: string;
  title: string;
  reason: VoReason;
  description: string | null;
  disciplineId: number | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  disciplineColor: string | null;
  contractId: number | null;
  contractCode: string | null;
  status: VoStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  proposedValue: number;
  approvedValue: number;
  lines: VoLineRow[];
};

// Danh sách VO kèm dòng KL con + tổng giá trị đề xuất (Σ qty_contract×unit_price)
// và giá trị được duyệt (Σ qty_approved×unit_price, chỉ tính khi status đã duyệt).
// Lọc theo status hoặc id (getVariation dùng id để lấy đúng 1 VO không quét cả bảng).
// projectId (M22): undefined = không lọc dự án (dùng nội bộ/test cũ).
export async function listVariations(filter?: {
  status?: VoStatus;
  id?: number;
  projectId?: number;
}): Promise<VoRow[]> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (filter?.id != null) {
    conds.push("v.id = ?");
    args.push(filter.id);
  }
  if (filter?.status) {
    conds.push("v.status = ?");
    args.push(filter.status);
  }
  if (filter?.projectId != null) {
    conds.push("v.project_id = ?");
    args.push(filter.projectId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await query<VoRow>(
    `SELECT v.id, v.code, v.title, v.reason, v.description,
            v.discipline_id AS "disciplineId", d.code AS "disciplineCode",
            d.name AS "disciplineName", d.color AS "disciplineColor",
            v.contract_id AS "contractId", c.code AS "contractCode",
            v.status, v.submitted_at AS "submittedAt", v.decided_at AS "decidedAt",
            v.created_by AS "createdBy", u.name AS "createdByName", v.created_at AS "createdAt",
            COALESCE(SUM(bi.qty_contract * bi.unit_price), 0) AS "proposedValue",
            COALESCE(SUM(
              CASE WHEN v.status IN ('approved','partially_approved','contract_added')
                   THEN COALESCE(bi.qty_approved, 0) * bi.unit_price ELSE 0 END
            ), 0) AS "approvedValue",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', bi.id, 'code', bi.code, 'name', bi.name, 'unit', bi.unit,
                  'qtyProposed', bi.qty_contract, 'qtyApproved', bi.qty_approved,
                  'unitPrice', bi.unit_price
                ) ORDER BY bi.id
              ) FILTER (WHERE bi.id IS NOT NULL),
              '[]'
            ) AS lines
       FROM variation_orders v
       LEFT JOIN disciplines d ON d.id = v.discipline_id
       LEFT JOIN contracts c ON c.id = v.contract_id
       LEFT JOIN users u ON u.id = v.created_by
       LEFT JOIN boq_items bi ON bi.vo_id = v.id
      ${where}
      GROUP BY v.id, d.code, d.name, d.color, c.code, u.name
      ORDER BY v.created_at DESC, v.id DESC`,
    ...args,
  );
  return rows;
}

// projectId khi truyền → trả undefined nếu VO không thuộc dự án đang chọn (chặn
// truy cập chéo dự án qua đoán ID).
export async function getVariation(id: number, projectId?: number): Promise<VoRow | undefined> {
  const rows = await listVariations({ id, projectId });
  return rows[0];
}

// VO 'submitted' quá VO_PENDING_DAYS ngày mà chưa được quyết → nhắc Admin/PM (M6).
export async function pendingVariations(
  days = VO_PENDING_DAYS,
): Promise<{ id: number; code: string; title: string; submittedAt: string }[]> {
  const limit = daysFromTodayISO(-days);
  return query(
    `SELECT id, code, title, submitted_at AS "submittedAt"
       FROM variation_orders
      WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at <= ?
      ORDER BY submitted_at`,
    limit,
  );
}

export async function nextVoCode(): Promise<string> {
  return nextSeqCode("variation_orders", "code", "VO-", 4);
}

// Sửa được (metadata, file) khi: nháp (người tạo/Admin/PM) hoặc đã trình (chỉ
// Admin/PM) — khoá hẳn sau khi đã có quyết định (approved/partially_approved/
// rejected/contract_added). Dùng chung cho PATCH + upload/xoá file đính kèm.
export function canEditVo(
  vo: { status: string; createdBy: number | null },
  user: User,
): string | null {
  if (vo.status !== "draft" && vo.status !== "submitted")
    return "Phát sinh đã có quyết định — không thể sửa";
  if (vo.status === "draft") {
    if (vo.createdBy === user.id || isAdminOrPm(user.role)) return null;
    return "Chỉ người tạo hoặc Admin/PM được sửa phát sinh đang ở trạng thái nháp";
  }
  if (isAdminOrPm(user.role)) return null;
  return "Phát sinh đã trình — chỉ Admin/PM được sửa";
}
