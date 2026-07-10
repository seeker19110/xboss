// M34 — Claim chi phí & Gia hạn thời gian (EOT): tách khỏi VO (M6) vì claim là PHẢN
// ỨNG với sự kiện gây chậm/phát sinh chi phí ngoài kiểm soát (chờ mặt bằng, thay đổi
// thiết kế của CĐT, điều kiện công trường...), có vòng đời riêng notice→quantified→
// negotiating→settled/rejected. Xem docs/nang-cap/M34-claim.md.
import { query, queryOne, run, withTransaction, daysFromTodayISO } from "@/lib/db";
import { nextSeqCode } from "@/lib/seqcode";

export const CLAIM_KINDS = ["cost", "eot"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  cost: "Chi phí",
  eot: "Gia hạn (EOT)",
};

export const CLAIM_STATUSES = [
  "notice",
  "quantified",
  "negotiating",
  "settled",
  "rejected",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  notice: "Đã thông báo",
  quantified: "Đã định lượng",
  negotiating: "Đang đàm phán",
  settled: "Đã chốt",
  rejected: "Từ chối",
};

// Claim ở trạng thái này coi là "đang mở" (chưa có quyết định cuối) — dùng cho KPI +
// pendingClaims + gate sửa/xoá.
export const CLAIM_OPEN_STATUSES: ClaimStatus[] = ["notice", "quantified", "negotiating"];

// Claim quá N ngày kể từ notice_date mà chưa chốt/từ chối → nhắc Admin/PM (mirror
// pendingVariations/pendingProposalsOver).
export const CLAIM_PENDING_DAYS = 14;

export type ClaimInput = {
  kind: ClaimKind;
  title: string;
  contractId: number | null;
  voId: number | null;
  noticeDate: string;
  cause: string;
  amountRequested: number | null;
  daysRequested: number | null;
};

export function parseClaimBody(body: Record<string, unknown>): ClaimInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    kind: str(body.kind) as ClaimKind,
    title: str(body.title),
    contractId: body.contractId != null && body.contractId !== "" ? Number(body.contractId) : null,
    voId: body.voId != null && body.voId !== "" ? Number(body.voId) : null,
    noticeDate: str(body.noticeDate),
    cause: str(body.cause),
    amountRequested:
      body.amountRequested != null && body.amountRequested !== ""
        ? Number(body.amountRequested)
        : null,
    daysRequested:
      body.daysRequested != null && body.daysRequested !== "" ? Number(body.daysRequested) : null,
  };
}

// Validate thuần (không chạm DB) — kind='cost' bắt buộc amountRequested > 0,
// kind='eot' bắt buộc daysRequested > 0.
export function validateClaimInput(input: ClaimInput): string | null {
  if (!CLAIM_KINDS.includes(input.kind)) return "Loại claim không hợp lệ (cost/eot)";
  if (!input.title.trim()) return "Thiếu tiêu đề claim";
  if (!input.noticeDate.trim()) return "Thiếu ngày thông báo";
  if (!input.cause.trim()) return "Thiếu nguyên nhân";
  if (input.kind === "cost") {
    if (!Number.isFinite(input.amountRequested) || (input.amountRequested ?? 0) <= 0)
      return "Claim chi phí cần giá trị đề xuất > 0";
  }
  if (input.kind === "eot") {
    if (!Number.isFinite(input.daysRequested) || (input.daysRequested ?? 0) <= 0)
      return "Claim gia hạn cần số ngày đề xuất > 0";
  }
  return null;
}

// Kiểm FK tồn tại (hợp đồng/VO nối kèm) — trả thông điệp lỗi hoặc null.
export async function checkClaimRefs(input: ClaimInput): Promise<string | null> {
  if (input.contractId != null) {
    if (
      !Number.isInteger(input.contractId) ||
      !(await queryOne(`SELECT id FROM contracts WHERE id = ?`, input.contractId))
    )
      return "Hợp đồng gắn kèm không tồn tại";
  }
  if (input.voId != null) {
    if (
      !Number.isInteger(input.voId) ||
      !(await queryOne(`SELECT id FROM variation_orders WHERE id = ?`, input.voId))
    )
      return "Phát sinh/VO gắn kèm không tồn tại";
  }
  return null;
}

export type ClaimRow = {
  id: number;
  projectId: number | null;
  code: string;
  kind: ClaimKind;
  title: string;
  contractId: number | null;
  contractCode: string | null;
  voId: number | null;
  voCode: string | null;
  noticeDate: string;
  cause: string;
  amountRequested: number | null;
  daysRequested: number | null;
  amountSettled: number | null;
  daysSettled: number | null;
  status: ClaimStatus;
  settlementNote: string | null;
  settledBy: number | null;
  settledByName: string | null;
  settledAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  documentCount: number;
};

export async function listClaims(
  projectId?: number | null,
  filters?: { kind?: ClaimKind; status?: ClaimStatus; contractId?: number; id?: number },
): Promise<ClaimRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (projectId != null) {
    clauses.push("c.project_id = ?");
    params.push(projectId);
  }
  if (filters?.id != null) {
    clauses.push("c.id = ?");
    params.push(filters.id);
  }
  if (filters?.kind) {
    clauses.push("c.kind = ?");
    params.push(filters.kind);
  }
  if (filters?.status) {
    clauses.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters?.contractId != null) {
    clauses.push("c.contract_id = ?");
    params.push(filters.contractId);
  }
  return query<ClaimRow>(
    `SELECT c.id, c.project_id AS "projectId", c.code, c.kind, c.title,
            c.contract_id AS "contractId", ct.code AS "contractCode",
            c.vo_id AS "voId", v.code AS "voCode",
            c.notice_date AS "noticeDate", c.cause,
            c.amount_requested AS "amountRequested", c.days_requested AS "daysRequested",
            c.amount_settled AS "amountSettled", c.days_settled AS "daysSettled",
            c.status, c.settlement_note AS "settlementNote",
            c.settled_by AS "settledBy", us.name AS "settledByName", c.settled_at AS "settledAt",
            c.created_by AS "createdBy", uc.name AS "createdByName", c.created_at AS "createdAt",
            (SELECT COUNT(*) FROM claim_documents d WHERE d.claim_id = c.id) AS "documentCount"
       FROM claims c
       LEFT JOIN contracts ct ON ct.id = c.contract_id
       LEFT JOIN variation_orders v ON v.id = c.vo_id
       LEFT JOIN users uc ON uc.id = c.created_by
       LEFT JOIN users us ON us.id = c.settled_by
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY c.created_at DESC, c.id DESC`,
    ...params,
  );
}

export async function getClaim(
  id: number,
  projectId?: number | null,
): Promise<ClaimRow | undefined> {
  const rows = await listClaims(projectId, { id });
  return rows[0];
}

export async function nextClaimCode(): Promise<string> {
  return nextSeqCode("claims", "code", "CLM-", 4);
}

// Claim đang mở (notice/quantified/negotiating) quá N ngày kể từ notice_date → nhắc
// Admin/PM (mirror pendingVariations/pendingProposalsOver).
export async function pendingClaims(
  days = CLAIM_PENDING_DAYS,
  projectId?: number | null,
): Promise<{ id: number; code: string; title: string; noticeDate: string }[]> {
  const limit = daysFromTodayISO(-days);
  const clauses = [
    `status IN ('notice','quantified','negotiating')`,
    `notice_date IS NOT NULL AND notice_date <= ?`,
  ];
  const params: unknown[] = [limit];
  if (projectId != null) {
    clauses.push("project_id = ?");
    params.push(projectId);
  }
  return query(
    `SELECT id, code, title, notice_date AS "noticeDate"
       FROM claims
      WHERE ${clauses.join(" AND ")}
      ORDER BY notice_date`,
    ...params,
  );
}

export type EotEvidenceSuggestion = { suggestedDays: number; waitingFloors: number };

// Gợi ý số ngày EOT khi tạo claim kind='eot' — tái dùng số ngày chờ mặt bằng luỹ kế
// (lib/workfronts.ts:frontMissingList, cùng công thức dùng cho dashboard/notification
// front_missing). Chỉ là GỢI Ý — người dùng tự nhập số cuối, không ép buộc.
// Lưu ý: work_fronts hiện CHƯA có cột project_id (M22 PR1 không đưa vào) nên tham số
// projectId ở đây chưa lọc được — giữ chữ ký để dùng ngay khi work_fronts được gán
// project_id ở migration sau.
export async function eotEvidenceSuggestion(
  _projectId?: number | null,
): Promise<EotEvidenceSuggestion> {
  const { frontMissingList } = await import("@/lib/workfronts");
  const items = await frontMissingList();
  return {
    suggestedDays: items.reduce((sum, it) => sum + it.waitingDays, 0),
    waitingFloors: items.length,
  };
}

// Sửa được (metadata) khi claim còn đang mở (chưa settled/rejected) — người tạo hoặc
// Admin/PM. Xoá dùng chung điều kiện này (pattern canEditVo).
export function canEditClaim(
  claim: { status: string; createdBy: number | null },
  user: { id: number; role: string },
): string | null {
  if (!CLAIM_OPEN_STATUSES.includes(claim.status as ClaimStatus))
    return "Claim đã có quyết định (chốt/từ chối) — không thể sửa";
  if (claim.createdBy === user.id || user.role === "admin" || user.role === "pm") return null;
  return "Chỉ người tạo hoặc Admin/PM được sửa claim";
}

// Chốt claim (settle): ghi amount_settled/days_settled/settlement_note, chuyển
// status='settled'. CAN.approve (Admin/PM), trong 1 transaction.
export async function settleClaim(opts: {
  claimId: number;
  amountSettled: number | null;
  daysSettled: number | null;
  settlementNote: string | null;
  settledBy: number;
}): Promise<{ error: string } | { ok: true }> {
  return withTransaction(async () => {
    const c = await queryOne<{ status: string; kind: ClaimKind }>(
      `SELECT status, kind FROM claims WHERE id = ? FOR UPDATE`,
      opts.claimId,
    );
    if (!c) return { error: "Không tìm thấy claim" };
    if (!CLAIM_OPEN_STATUSES.includes(c.status as ClaimStatus))
      return { error: "Claim đã có quyết định — không thể chốt lại" };

    await run(
      `UPDATE claims
          SET status = 'settled', amount_settled = ?, days_settled = ?,
              settlement_note = ?, settled_by = ?, settled_at = NOW()
        WHERE id = ?`,
      opts.amountSettled,
      opts.daysSettled,
      opts.settlementNote,
      opts.settledBy,
      opts.claimId,
    );
    return { ok: true };
  });
}

// Từ chối claim: bắt buộc settlement_note làm lý do. CAN.approve (Admin/PM).
export async function rejectClaim(opts: {
  claimId: number;
  settlementNote: string;
  settledBy: number;
}): Promise<{ error: string } | { ok: true }> {
  if (!opts.settlementNote.trim()) return { error: "Từ chối claim cần ghi rõ lý do" };
  return withTransaction(async () => {
    const c = await queryOne<{ status: string }>(
      `SELECT status FROM claims WHERE id = ? FOR UPDATE`,
      opts.claimId,
    );
    if (!c) return { error: "Không tìm thấy claim" };
    if (!CLAIM_OPEN_STATUSES.includes(c.status as ClaimStatus))
      return { error: "Claim đã có quyết định — không thể từ chối" };

    await run(
      `UPDATE claims
          SET status = 'rejected', settlement_note = ?, settled_by = ?, settled_at = NOW()
        WHERE id = ?`,
      opts.settlementNote.trim(),
      opts.settledBy,
      opts.claimId,
    );
    return { ok: true };
  });
}
