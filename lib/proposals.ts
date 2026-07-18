// M19 — Đề xuất & phê duyệt online tổng quát (tạm ứng/thanh toán/cấp phát/khác):
// danh mục, validate thuần, vòng đời draft→submitted→approved/rejected (mượn pattern
// nghiệm thu 2 bước), đề xuất trình lâu chưa quyết (nguồn notification proposal_pending),
// cảnh báo cấp phát vượt định mức (M18). KHÔNG thay thế purchase_requests — luồng mua
// vật tư hiện có giữ nguyên. Xem docs/nang-cap/M19-de-xuat-phe-duyet.md.
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { todayISO, daysFromTodayISO } from "@/lib/date";
import { nextSeqCode } from "@/lib/seqcode";
import { CAN, isAdminOrPm, type User } from "@/lib/auth";
import { overNormItems, type OverNormItem } from "@/lib/norms";

export const PROPOSAL_KINDS = ["advance", "payment", "allocation", "other"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  advance: "Tạm ứng",
  payment: "Thanh toán",
  allocation: "Cấp phát vật tư",
  other: "Khác",
};

export const PROPOSAL_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};

// Đề xuất 'submitted' quá N ngày chưa quyết → notification proposal_pending.
export const PROPOSAL_PENDING_DAYS = 5;

export type ProposalInput = {
  kind: ProposalKind;
  title: string;
  amount: number | null;
  contractId: number | null;
  materialId: number | null;
  reason: string | null;
};

export function parseProposalBody(body: Record<string, unknown>): ProposalInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    kind: (typeof body.kind === "string" ? body.kind : "") as ProposalKind,
    title: typeof body.title === "string" ? body.title.trim() : "",
    amount: body.amount != null && body.amount !== "" ? Number(body.amount) : null,
    contractId: body.contractId != null ? Number(body.contractId) : null,
    materialId: body.materialId != null ? Number(body.materialId) : null,
    reason: strOrNull(body.reason),
  };
}

// Validate thuần (không chạm DB). kind='allocation' khuyến khích có materialId nhưng
// không bắt buộc cứng — đề xuất có thể chưa rõ vật tư cụ thể lúc tạo (spec M19).
export function validateProposalInput(input: ProposalInput): string | null {
  if (!PROPOSAL_KINDS.includes(input.kind)) return "Loại đề xuất không hợp lệ";
  if (!input.title) return "Thiếu tiêu đề đề xuất";
  if (input.amount != null && (!Number.isFinite(input.amount) || input.amount < 0))
    return "Giá trị đề xuất phải ≥ 0";
  return null;
}

// projectId (M22): khi truyền, hợp đồng/vật tư gắn kèm phải thuộc đúng dự án đang chọn
// (contracts/materials đều có cột project_id — migrations/0027_multi_project.sql).
export async function checkProposalRefs(
  input: ProposalInput,
  projectId?: number,
): Promise<string | null> {
  if (input.contractId != null) {
    const c =
      projectId != null
        ? await queryOne(
            `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
            input.contractId,
            projectId,
          )
        : await queryOne(`SELECT id FROM contracts WHERE id = ?`, input.contractId);
    if (!c) return "Hợp đồng gắn kèm không tồn tại";
  }
  if (input.materialId != null) {
    const m =
      projectId != null
        ? await queryOne(
            `SELECT id FROM materials WHERE id = ? AND project_id = ?`,
            input.materialId,
            projectId,
          )
        : await queryOne(`SELECT id FROM materials WHERE id = ?`, input.materialId);
    if (!m) return "Vật tư gắn kèm không tồn tại";
  }
  return null;
}

// Quyền quyết đề xuất = CAN.approve (Admin/PM) — tách hàm riêng cho chỗ gọi rõ nghĩa.
export function canDecideProposal(user: User): boolean {
  return CAN.approve(user.role);
}

// Vai trò thấy mọi đề xuất (Admin/PM/BCH); vai trò còn lại chỉ thấy đề xuất mình tạo.
export function canSeeAllProposals(user: User): boolean {
  return isAdminOrPm(user.role) || user.role === "bch";
}

// Sửa/xoá khi còn nháp: người tạo hoặc Admin/PM (xoá: người tạo hoặc Admin).
export function canEditProposal(
  proposal: { status: string; requestedBy: number },
  user: User,
): string | null {
  if (proposal.status !== "draft") return "Đề xuất đã trình/đã quyết — không thể sửa";
  if (proposal.requestedBy === user.id || isAdminOrPm(user.role)) return null;
  return "Chỉ người tạo hoặc Admin/PM được sửa đề xuất nháp";
}

export async function nextProposalCode(): Promise<string> {
  return nextSeqCode("proposals", "code", "DX-", 4);
}

export type ProposalRow = ProposalInput & {
  id: number;
  code: string;
  contractCode: string | null;
  materialName: string | null;
  status: ProposalStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: number | null;
  decidedByName: string | null;
  rejectReason: string | null;
  requestedBy: number;
  requestedByName: string | null;
  createdAt: string;
  documentCount: number;
};

export async function listProposals(filter?: {
  kind?: ProposalKind;
  status?: ProposalStatus;
  requestedBy?: number;
  id?: number;
  // M22: undefined = không lọc dự án (dùng nội bộ/test cũ).
  projectId?: number;
}): Promise<ProposalRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.id != null) {
    clauses.push("p.id = ?");
    params.push(filter.id);
  }
  if (filter?.kind) {
    clauses.push("p.kind = ?");
    params.push(filter.kind);
  }
  if (filter?.status) {
    clauses.push("p.status = ?");
    params.push(filter.status);
  }
  if (filter?.requestedBy != null) {
    clauses.push("p.requested_by = ?");
    params.push(filter.requestedBy);
  }
  if (filter?.projectId != null) {
    clauses.push("p.project_id = ?");
    params.push(filter.projectId);
  }
  return query<ProposalRow>(
    `SELECT p.id, p.code, p.kind, p.title, p.amount,
            p.contract_id AS "contractId", c.code AS "contractCode",
            p.material_id AS "materialId", m.name AS "materialName",
            p.reason, p.status, p.submitted_at AS "submittedAt",
            p.decided_at AS "decidedAt", p.decided_by AS "decidedBy", ud.name AS "decidedByName",
            p.reject_reason AS "rejectReason",
            p.requested_by AS "requestedBy", ur.name AS "requestedByName",
            p.created_at AS "createdAt",
            (SELECT COUNT(*) FROM proposal_documents d WHERE d.proposal_id = p.id) AS "documentCount"
       FROM proposals p
       LEFT JOIN contracts c ON c.id = p.contract_id
       LEFT JOIN materials m ON m.id = p.material_id
       LEFT JOIN users ur ON ur.id = p.requested_by
       LEFT JOIN users ud ON ud.id = p.decided_by
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY p.created_at DESC, p.id DESC`,
    ...params,
  );
}

// projectId khi truyền → trả undefined nếu đề xuất không thuộc dự án đang chọn (chặn
// truy cập chéo dự án qua đoán ID), giống pattern 404 "không tìm thấy" hiện có.
export async function getProposal(
  id: number,
  projectId?: number,
): Promise<ProposalRow | undefined> {
  const rows = await listProposals({ id, projectId });
  return rows[0];
}

// Đề xuất 'submitted' quá N ngày chưa quyết → nhắc Admin/PM (pattern vo_pending/cert_pending).
// projectId: lọc theo dự án đang chọn (đa dự án, M22+) — không truyền = không lọc.
export async function pendingProposalsOver(
  days = PROPOSAL_PENDING_DAYS,
  projectId?: number,
): Promise<{ id: number; code: string; title: string; submittedAt: string }[]> {
  const limit = daysFromTodayISO(-days);
  const projectFilter = projectId != null ? " AND project_id = ?" : "";
  return query(
    `SELECT id, code, title, submitted_at AS "submittedAt"
       FROM proposals
      WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at <= ?${projectFilter}
      ORDER BY submitted_at`,
    ...(projectId != null ? [limit, projectId] : [limit]),
  );
}

// Quyết đề xuất đã trình: cập nhật trạng thái + (tuỳ chọn, khi duyệt tạm ứng/thanh toán
// có gắn HĐ và giá trị) tạo phiếu payment_bills tương ứng — không tự động ép, chỉ khi
// người duyệt tick chọn (spec M19). Trả lỗi dạng chuỗi khi trạng thái không hợp lệ.
export async function decideProposal(opts: {
  proposalId: number;
  decision: "approved" | "rejected";
  rejectReason?: string | null;
  createBill?: boolean;
  decidedBy: number;
  // M22: khi truyền, chỉ quyết được đề xuất thuộc đúng dự án đang chọn.
  projectId?: number;
}): Promise<{ billId: number | null } | string> {
  const conds = ["id = ?"];
  const args: unknown[] = [opts.proposalId];
  if (opts.projectId != null) {
    conds.push("project_id = ?");
    args.push(opts.projectId);
  }
  const p = await queryOne<{
    id: number;
    code: string;
    kind: ProposalKind;
    title: string;
    amount: number | null;
    contractId: number | null;
    status: string;
  }>(
    `SELECT id, code, kind, title, amount, contract_id AS "contractId", status
       FROM proposals WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  if (!p) return "Không tìm thấy đề xuất";
  if (p.status !== "submitted") return "Đề xuất không ở trạng thái đã trình";
  if (opts.decision === "rejected" && !opts.rejectReason?.trim()) return "Từ chối cần ghi rõ lý do";

  return withTransaction(async () => {
    await run(
      `UPDATE proposals SET status = ?, decided_at = ?, decided_by = ?, reject_reason = ? WHERE id = ?`,
      opts.decision,
      todayISO(),
      opts.decidedBy,
      opts.decision === "rejected" ? (opts.rejectReason?.trim() ?? null) : null,
      opts.proposalId,
    );

    let billId: number | null = null;
    const billable =
      opts.decision === "approved" &&
      opts.createBill === true &&
      (p.kind === "advance" || p.kind === "payment") &&
      p.contractId != null &&
      p.amount != null &&
      p.amount > 0;
    if (billable) {
      const contract = await queryOne<{
        code: string;
        partyName: string | null;
        projectId: number | null;
      }>(
        `SELECT c.code, COALESCE(s.name, c.party_name) AS "partyName", c.project_id AS "projectId"
           FROM contracts c LEFT JOIN suppliers s ON s.id = c.party_supplier_id
          WHERE c.id = ?`,
        p.contractId,
      );
      // M51 PR1: project_id của bill lấy từ hợp đồng (p.contractId → contracts.project_id)
      // để RLS lọc đúng dự án.
      billId = await insertId(
        `INSERT INTO payment_bills (responsible, type, amount, description, paid_date, contract_id, created_by, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        contract?.partyName ?? contract?.code ?? "—",
        p.kind === "advance" ? "advance" : "bill",
        p.amount,
        `Theo đề xuất ${p.code} — ${p.title}`,
        todayISO(),
        p.contractId,
        opts.decidedBy,
        contract?.projectId ?? null,
      );
    }
    return { billId };
  });
}

// Cảnh báo cấp phát vượt định mức (M18): đề xuất kind='allocation' có material_id nằm
// trong danh sách vật tư đang vượt định mức → trả dòng vượt để hiển thị cảnh báo mềm
// (không chặn cứng, giống Σweight ở M1). Trả null khi không áp dụng/không vượt.
export async function allocationOverNorm(proposalId: number): Promise<OverNormItem | null> {
  const p = await queryOne<{ kind: string; materialId: number | null }>(
    `SELECT kind, material_id AS "materialId" FROM proposals WHERE id = ?`,
    proposalId,
  );
  if (!p || p.kind !== "allocation" || p.materialId == null) return null;

  const over = await overNormItems();
  if (over.length === 0) return null;
  const norms = await query<{ id: number; materialId: number }>(
    `SELECT id, material_id AS "materialId" FROM boq_norms WHERE id = ANY(?)`,
    over.map((o) => o.normId),
  );
  const normIds = new Set(norms.filter((n) => n.materialId === p.materialId).map((n) => n.id));
  return over.find((o) => normIds.has(o.normId)) ?? null;
}
