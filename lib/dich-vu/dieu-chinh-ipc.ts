// M128 — phối hợp chứng từ điều chỉnh IPC (miền tài chính) với engine phê duyệt (miền tiến độ,
// lib/tien-do/approvals.ts) — ADR-0008: logic ≥ 2 miền nằm ở dich-vu, không biết gì về HTTP.
//
// Quy tắc duyệt (docs/nang-cap/M128-chung-tu-dieu-chinh-ipc.md §2.2):
//   * Đợt IPC gốc đã đi qua engine (có approval_request 'payment_cert') VÀ dự án còn flow
//     'payment_cert' active → chứng từ mở request 'payment_cert_adjustment' theo đúng flow đó lúc
//     TRÌNH; quyết định đi `advanceApproval` (quyền theo bước + SoD người tạo request). Ngưỡng
//     min_amount so theo |amount| GỘP (khuôn IPC so periodValue gộp; reversal âm vẫn phải qua bước
//     cấp cao như giá trị dương) — tiền phiếu ròng không dùng cho ngưỡng.
//   * Ngược lại → quyết định trực tiếp: CAN.approve (Admin/PM), tái kiểm lúc ghi.
//   * Mọi trường hợp: người quyết định ≠ người lập (= người trình) → 403 sod_same_actor.
import { query, queryOne } from "@/lib/db";
import { CAN } from "@/lib/bao-mat/auth";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { log } from "@/lib/nen/log";
import { isMoneyPrecisionError, moneyToNumberSafe, parseMoneyExact } from "@/lib/nen/money";
import type { Role } from "@/lib/nen/roles";
import { advanceApproval, NON_APPROVER_ROLES, openApproval } from "@/lib/tien-do/approvals";
import {
  apDungDuyet,
  bamYeuCauDieuChinh,
  ghiSnapshotDieuChinh,
  khoaDieuChinh,
  kiemCoPhieuGoc,
  loiDieuChinh,
  timQuyetDinhDieuChinh,
  trinhDieuChinhCore,
  tuChoi,
  type AdjKind,
  type KetQuaDieuChinh,
} from "@/lib/tai-chinh/ipc-dieu-chinh";

/** entity_type của approval_requests cho chứng từ điều chỉnh IPC. */
export const ENTITY_DIEU_CHINH = "payment_cert_adjustment";

type Actor = { id: number; role: Role };

/** |amount| GỘP dạng number cho engine so ngưỡng (approval_requests.amount NUMERIC(15,2)). */
function amountChoEngine(amountText: string): number {
  const minor = parseMoneyExact(amountText);
  try {
    return moneyToNumberSafe(minor < 0n ? -minor : minor);
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    throw loiDieuChinh(
      422,
      "Giá trị vượt độ chính xác hỗ trợ của luồng phê duyệt",
      "money_precision_unsupported",
    );
  }
}

/**
 * Trình chứng từ nháp (người lập). Mở request engine khi đợt gốc đã đi engine và còn flow
 * 'payment_cert' active. GỌI TRONG transaction ghi có GUC dự án (withProjectScope).
 */
export async function trinhDieuChinh(opts: {
  id: number;
  projectId: number;
  orgId: number;
  user: Actor;
}): Promise<void> {
  const k = await khoaDieuChinh(opts.id, opts.projectId, opts.orgId);
  if (!k) throw loiDieuChinh(404, "Không tìm thấy chứng từ điều chỉnh");
  const amount = await trinhDieuChinhCore(k, opts.user);
  const quaEngine = await queryOne<{ id: number }>(
    `SELECT id FROM approval_requests
      WHERE entity_type = 'payment_cert' AND entity_id = ? AND project_id = ?
      ORDER BY id DESC LIMIT 1`,
    k.adj.certId,
    opts.projectId,
  );
  if (!quaEngine) return;
  await openApproval({
    entityType: ENTITY_DIEU_CHINH,
    entityId: k.adj.id,
    projectId: opts.projectId,
    amount: amountChoEngine(amount),
    user: opts.user,
    flowEntityType: "payment_cert",
  });
}

export type KetQuaQuyetDinhDieuChinh = KetQuaDieuChinh & { replayed?: boolean };

/**
 * Quyết định chứng từ đã trình. `coQuyenTrucTiep` = kiểm quyền duyệt trực tiếp của route
 * (CAN.approve) — tái kiểm lúc ghi dưới khoá. Idempotency-Key như IPC: cùng key + cùng payload
 * + cùng actor còn quyền → phát lại kết quả cũ (`replayed`), không chạy bước kế, không sinh
 * phiếu thứ hai; cùng key khác payload/actor → 409 idempotency_conflict.
 * GỌI TRONG transaction ghi có GUC dự án.
 */
export async function quyetDinhDieuChinh(opts: {
  id: number;
  projectId: number;
  orgId: number;
  user: Actor;
  decision: "approved" | "rejected";
  rejectReason: string;
  key: string | null;
  operationId: string;
  coQuyenTrucTiep: () => boolean;
}): Promise<KetQuaQuyetDinhDieuChinh> {
  const { id, user, decision, rejectReason } = opts;
  const k = await khoaDieuChinh(id, opts.projectId, opts.orgId);
  if (!k) throw loiDieuChinh(404, "Không tìm thấy chứng từ điều chỉnh");
  const requestHash = bamYeuCauDieuChinh({ adjustmentId: id, decision, rejectReason });

  if (opts.key) {
    const cu = await timQuyetDinhDieuChinh(id, opts.key);
    if (cu) {
      if (cu.actorId !== user.id || cu.requestHash !== requestHash)
        throw loiDieuChinh(
          409,
          "Idempotency-Key đã dùng cho một quyết định khác — tạo key mới cho quyết định mới",
          "idempotency_conflict",
        );
      const conQuyen =
        cu.actorRole === user.role &&
        !NON_APPROVER_ROLES.includes(user.role) &&
        (cu.buoc === "engine" || opts.coQuyenTrucTiep());
      if (!conQuyen) throw loiDieuChinh(403, "Bạn không còn quyền duyệt chứng từ này");
      return { ...cu.ketQua, replayed: true };
    }
  }

  if (k.adj.status !== "submitted")
    throw loiDieuChinh(409, "Chỉ quyết định được chứng từ đã trình", "adjustment_not_submitted");
  if (k.adj.createdBy === user.id)
    throw loiDieuChinh(
      403,
      "Người lập/trình chứng từ điều chỉnh không được tự quyết định (phân tách nhiệm vụ)",
      "sod_same_actor",
    );
  if (k.goc.status !== "approved")
    throw loiDieuChinh(409, "Đợt gốc không còn ở trạng thái đã duyệt", "cert_not_approved");
  // Quyết định 2026-10-09 (mục 12): kiểm lại phiếu gốc dưới khoá — mọi bước DUYỆT (kể cả bước
  // trung gian của engine) chặn khi đợt mất phiếu gốc; từ chối vẫn cho (không sinh tiền).
  if (decision === "approved") await kiemCoPhieuGoc(k.adj.certId);

  const live = await queryOne<{ id: number }>(
    `SELECT id FROM approval_requests WHERE entity_type = ? AND entity_id = ? AND status = 'pending'`,
    ENTITY_DIEU_CHINH,
    id,
  );
  let ketQua: KetQuaDieuChinh;
  if (live) {
    const r = await advanceApproval({
      entityType: ENTITY_DIEU_CHINH,
      entityId: id,
      user,
      decision: decision === "rejected" ? "reject" : "approve",
      note: decision === "rejected" ? rejectReason : null,
    });
    ketQua =
      r.status === "pending"
        ? { result: "pending", currentSeq: r.currentSeq, nextRole: r.nextRole }
        : { result: decision };
  } else {
    if (!(await kiemQuyenTaiLucGhi(opts.coQuyenTrucTiep)))
      throw loiDieuChinh(403, "Chỉ Admin/PM được duyệt chứng từ điều chỉnh");
    ketQua = { result: decision };
  }

  let billId: number | null = null;
  let voidedBillIds: number[] = [];
  if (ketQua.result === "approved") ({ billId, voidedBillIds } = await apDungDuyet(k.adj, user));
  else if (ketQua.result === "rejected") await tuChoi(id, user, rejectReason);

  await ghiSnapshotDieuChinh({
    adj: k.adj,
    goc: k.goc,
    actor: user,
    operationId: opts.operationId,
    requestHash,
    buoc: live ? "engine" : "legacy",
    ketQua,
    rejectReason: decision === "rejected" ? rejectReason : null,
    billId,
    voidedBillIds,
  });
  return ketQua;
}

/** Phần tử hộp thư "chờ tôi duyệt" cho chứng từ điều chỉnh — cùng khuôn PendingItemDisplay. */
export type HopThuDieuChinhItem = {
  /** Âm (−id chứng từ) để không trùng id approval_request của các phần tử khác trong hộp thư. */
  id: number;
  entityType: typeof ENTITY_DIEU_CHINH;
  entityId: number;
  kind: "adjustment";
  /** Loại chứng từ — UI chỉ cảnh báo nguy hiểm (huỷ hiệu lực cả đợt) cho 'reversal'. */
  adjustmentKind: AdjKind;
  /** null = người xem không có quyền xem tiền (viewPayments), KHÔNG bao giờ là lỗi bị nuốt. */
  amount: number | null;
  currentSeq: number;
  stepRole: string;
  slaDays: number | null;
  createdAt: string;
  createdBy: number;
  flowName: string;
  label: string;
  linkUrl: string;
};

/**
 * amount (chuỗi exact) → number cho hộp thư (wire legacy JSON number). Không giữ được chính xác
 * → log + ném 422 `money_precision_unsupported` (route trả lỗi rõ) — KHÔNG trả null im lặng: null
 * trên wire nghĩa là "không có quyền xem tiền", người duyệt sẽ duyệt mà không thấy giá trị.
 */
export function tienHopThuDieuChinh(amountText: string, adjustmentId: number): number {
  try {
    return moneyToNumberSafe(parseMoneyExact(amountText));
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    log.error("hop_thu_dieu_chinh_vuot_do_chinh_xac", { adjustmentId });
    throw loiDieuChinh(
      422,
      "Giá trị chứng từ điều chỉnh vượt độ chính xác hỗ trợ của hộp thư — mở trang đợt thanh toán để xem",
      "money_precision_unsupported",
    );
  }
}

/**
 * Chứng từ điều chỉnh 'submitted' của dự án mà user quyết định được: qua engine → đúng vai trò
 * bước hiện tại (hoặc admin); trực tiếp → CAN.approve. Loại chứng từ do chính user lập (SoD).
 * Tiền (amount) chỉ trả cho người có viewPayments. GỌI TRONG withProjectScope (bảng FORCE RLS).
 */
export async function hopThuDieuChinh(
  user: Actor,
  projectId: number,
): Promise<HopThuDieuChinhItem[]> {
  if (NON_APPROVER_ROLES.includes(user.role)) return [];
  const rows = await query<{
    id: number;
    code: string;
    kind: AdjKind;
    amount: string;
    createdBy: number;
    submittedAt: string | null;
    createdAt: string;
    certId: number;
    contractId: number;
    certCode: string;
    requestId: number | null;
    requestCreatedBy: number | null;
    currentSeq: number | null;
    stepRole: string | null;
    slaDays: number | null;
    requestCreatedAt: string | null;
    flowName: string | null;
  }>(
    `SELECT a.id, a.code, a.kind, a.amount::text AS amount, a.created_by AS "createdBy",
            a.submitted_at AS "submittedAt", a.created_at AS "createdAt", a.cert_id AS "certId",
            a.contract_id AS "contractId", pc.code AS "certCode",
            r.id AS "requestId", r.created_by AS "requestCreatedBy", r.current_seq AS "currentSeq",
            s.role AS "stepRole", s.sla_days AS "slaDays", r.created_at AS "requestCreatedAt",
            f.name AS "flowName"
       FROM payment_cert_adjustments a
       JOIN payment_certs pc ON pc.id = a.cert_id
       LEFT JOIN approval_requests r
         ON r.entity_type = ? AND r.entity_id = a.id AND r.status = 'pending'
       LEFT JOIN approval_steps s ON s.flow_id = r.flow_id AND s.seq = r.current_seq
       LEFT JOIN approval_flows f ON f.id = r.flow_id
      WHERE a.project_id = ? AND a.status = 'submitted' AND a.created_by <> ?
      ORDER BY a.submitted_at, a.id`,
    ENTITY_DIEU_CHINH,
    projectId,
    user.id,
  );
  const xemTien = CAN.viewPayments(user.role);
  const out: HopThuDieuChinhItem[] = [];
  for (const r of rows) {
    const quaEngine = r.requestId != null;
    const duocDuyet = quaEngine
      ? (user.role === "admin" || r.stepRole === user.role) && r.requestCreatedBy !== user.id
      : CAN.approve(user.role);
    if (!duocDuyet) continue;
    out.push({
      id: -r.id,
      entityType: ENTITY_DIEU_CHINH,
      entityId: r.id,
      kind: "adjustment",
      adjustmentKind: r.kind,
      amount: xemTien ? tienHopThuDieuChinh(r.amount, r.id) : null,
      currentSeq: r.currentSeq ?? 1,
      stepRole: r.stepRole ?? "pm",
      slaDays: r.slaDays,
      createdAt: r.requestCreatedAt ?? r.submittedAt ?? r.createdAt,
      createdBy: r.createdBy,
      flowName: r.flowName ?? "Duyệt trực tiếp (Admin/PM)",
      label: `Điều chỉnh IPC ${r.code} — đợt ${r.certCode}`,
      linkUrl: `/payment-certs?contractId=${r.contractId}&id=${r.certId}`,
    });
  }
  return out;
}
