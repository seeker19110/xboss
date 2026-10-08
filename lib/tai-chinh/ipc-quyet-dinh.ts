// QUALITY-FINAL-1 S13c — quyết định đợt IPC (A5-FR06..FR09, DATA-CONTRACTS §6, DATA-MIGRATIONS
// §7): khoá hợp đồng → đợt, cảnh báo vượt HĐ có phiên bản (warningVersion) + xác nhận, kiểm thứ
// tự kỳ, snapshot quyết định bất biến + Idempotency-Key. Vượt KL hợp đồng vẫn là CẢNH BÁO (quyết
// định 2026-09-04) — chỉ đòi người có quyền XÁC NHẬN đúng bản cảnh báo hiện tại, không hard-cap.
import { createHash, randomUUID } from "node:crypto";
import { queryOne, run } from "@/lib/db";
import {
  certTotals,
  dongLuyKeHieuLuc,
  dongVuotTu,
  CERT_TOTALS_FIELDS,
  type DongLuyKe,
  type DongVuotHopDong,
} from "@/lib/tai-chinh/paymentcerts";
import { moneyToDecimal } from "@/lib/nen/money";

/** Quy tắc dựng danh sách cảnh báo canonical + warningVersion — đổi cách tính thì tăng số. */
export const IPC_WARNING_RULE = "ipc-warn-v1";
/** Quy tắc tiền của đợt (A3-FR05) — ghi vào snapshot để hồ sơ chốt mang theo rule. */
export const IPC_MONEY_RULE = "ipc-sum-v1";

/** SHA-256 hex của một giá trị đã chuẩn hoá (mảng/đối tượng dựng với thứ tự khoá cố định). */
function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export type CanhBaoDot = {
  dong: DongLuyKe[];
  vuotHopDong: DongVuotHopDong[];
  warningVersion: string;
};

/**
 * Cảnh báo vượt HĐ của một đợt + warningVersion do server dựng từ NGUỒN (KL kỳ, luỹ kế hiệu lực,
 * KL hợp đồng, đơn giá từng dòng, tỷ lệ tạm ứng/giữ lại của HĐ) và danh sách cảnh báo canonical.
 * Nguồn hoặc cảnh báo đổi → version đổi → xác nhận cũ hết hiệu lực (409 warning_changed).
 * Trạng thái đợt KHÔNG nằm trong version: xem lúc nháp, trình rồi duyệt vẫn cùng bản.
 */
export async function canhBaoDot(certId: number): Promise<CanhBaoDot> {
  const dong = await dongLuyKeHieuLuc(certId);
  const hd = await queryOne<{ advancePct: string; retentionPct: string }>(
    `SELECT ct.advance_pct::text AS "advancePct", ct.retention_pct::text AS "retentionPct"
       FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
      WHERE c.id = ?`,
    certId,
  );
  const sorted = [...dong].sort((a, b) => a.boqItemId - b.boqItemId);
  const warningVersion = sha256Json([
    IPC_WARNING_RULE,
    certId,
    hd?.advancePct ?? null,
    hd?.retentionPct ?? null,
    sorted.map((d) => [d.boqItemId, d.qtyPeriod, d.qtyCumulative, d.qtyContract, d.unitPrice]),
    sorted.filter((d) => d.vuot).map((d) => d.boqItemId),
  ]);
  return { dong, vuotHopDong: dongVuotTu(dong), warningVersion };
}

/** Phần xác nhận cảnh báo trong body quyết định (đã validate kiểu). */
export type XacNhanCanhBao = {
  acknowledged: boolean;
  reason: string | null;
  warningVersion: string | null;
};

const WARNING_VERSION_RE = /^[0-9a-f]{64}$/;
export const MAX_LY_DO_XAC_NHAN = 2000;

/** Đọc + validate acknowledged/reason/warningVersion. Trả thông điệp lỗi (→ 422) hoặc dữ liệu. */
export function docXacNhanCanhBao(body: Record<string, unknown>): XacNhanCanhBao | string {
  const { acknowledged, reason, warningVersion } = body;
  if (acknowledged !== undefined && acknowledged !== null && typeof acknowledged !== "boolean")
    return "acknowledged phải là true/false";
  if (reason !== undefined && reason !== null && typeof reason !== "string")
    return "reason phải là chuỗi";
  if (typeof reason === "string" && reason.trim().length > MAX_LY_DO_XAC_NHAN)
    return `Lý do xác nhận tối đa ${MAX_LY_DO_XAC_NHAN} ký tự`;
  if (
    warningVersion !== undefined &&
    warningVersion !== null &&
    (typeof warningVersion !== "string" || !WARNING_VERSION_RE.test(warningVersion))
  )
    return "warningVersion không hợp lệ";
  return {
    acknowledged: acknowledged === true,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    warningVersion: typeof warningVersion === "string" ? warningVersion : null,
  };
}

export type LoiXacNhan = { code: "warning_changed" | "acknowledgement_required"; message: string };

/**
 * Quy tắc xác nhận (A5-FR07), áp cho MỌI bước duyệt (UI, API ngoài, retry, batch):
 * - client gửi warningVersion khác bản hiện tại → `warning_changed` (kể cả khi giờ hết cảnh báo:
 *   nội dung đã khác cái người duyệt nhìn thấy);
 * - có cảnh báo mà thiếu acknowledged=true + lý do + đúng version → `acknowledgement_required`;
 * - không có cảnh báo → không đòi xác nhận rỗng.
 */
export function kiemXacNhanCanhBao(
  canh: Pick<CanhBaoDot, "vuotHopDong" | "warningVersion">,
  xn: XacNhanCanhBao,
): LoiXacNhan | null {
  if (xn.warningVersion != null && xn.warningVersion !== canh.warningVersion)
    return {
      code: "warning_changed",
      message:
        "Cảnh báo vượt khối lượng hợp đồng đã thay đổi kể từ lúc bạn xem — tải lại đợt, xem lại cảnh báo rồi xác nhận lại",
    };
  if (canh.vuotHopDong.length === 0) return null;
  if (!xn.acknowledged || !xn.reason || xn.warningVersion == null)
    return {
      code: "acknowledgement_required",
      message:
        "Đợt có dòng luỹ kế vượt khối lượng hợp đồng — cần xác nhận đã xem cảnh báo và nêu lý do trước khi duyệt",
    };
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Header Idempotency-Key: thiếu → null (server tự sinh operationId); sai dạng UUID → "invalid". */
export function docIdempotencyKey(raw: string | null): string | null | "invalid" {
  if (raw == null || raw.trim() === "") return null;
  const v = raw.trim();
  return UUID_RE.test(v) ? v.toLowerCase() : "invalid";
}

export function taoOperationId(): string {
  return randomUUID();
}

/** Băm canonical của yêu cầu quyết định — cùng key khác payload → 409 idempotency_conflict. */
export function bamYeuCauQuyetDinh(input: {
  certId: number;
  decision: string;
  rejectReason: string;
  xacNhan: XacNhanCanhBao;
}): string {
  return sha256Json([
    "ipc-decide-v1",
    input.certId,
    input.decision,
    input.rejectReason,
    input.xacNhan.acknowledged,
    input.xacNhan.reason,
    input.xacNhan.warningVersion,
  ]);
}

/** Gốc của một đợt sau khi khoá: hợp đồng (FOR UPDATE) rồi chính đợt (FOR UPDATE). */
export type GocDot = {
  status: string;
  contractId: number;
  periodNo: number;
  projectId: number;
  orgId: number;
};

/**
 * Khoá theo THỨ TỰ ỔN ĐỊNH hợp đồng → đợt (giống POST lập đợt chỉ khoá hợp đồng) trước mọi
 * lookup/tính lại: hai quyết định/trình trên cùng HĐ chạy tuần tự, không lấy luỹ kế cũ. Kiểm
 * luôn chuỗi cha đợt → HĐ → dự án → tổ chức dưới khoá (FK đơn không chứng minh cùng phạm vi).
 */
export async function khoaHopDongVaDot(
  certId: number,
  projectId: number,
  orgId: number,
): Promise<GocDot | undefined> {
  const hd = await queryOne<{ contractId: number }>(
    `SELECT ct.id AS "contractId"
       FROM payment_certs c
       JOIN contracts ct ON ct.id = c.contract_id
       JOIN projects p ON p.id = ct.project_id
      WHERE c.id = ? AND ct.project_id = ? AND p.org_id = ?
        FOR UPDATE OF ct`,
    certId,
    projectId,
    orgId,
  );
  if (!hd) return undefined;
  const dot = await queryOne<{ status: string; contractId: number; periodNo: number }>(
    `SELECT status, contract_id AS "contractId", period_no AS "periodNo"
       FROM payment_certs WHERE id = ? FOR UPDATE`,
    certId,
  );
  // Đợt bị chuyển sang HĐ khác giữa hai câu (không route nào làm, nhưng không tin) → coi như mất.
  if (!dot || dot.contractId !== hd.contractId) return undefined;
  return { ...dot, projectId, orgId };
}

/** Kỳ SAU đã duyệt của cùng HĐ (nếu có) — duyệt kỳ trước lúc này phải đối soát, không chốt. */
export async function kySauDaDuyet(
  contractId: number,
  periodNo: number,
): Promise<{ code: string; periodNo: number } | undefined> {
  return queryOne<{ code: string; periodNo: number }>(
    `SELECT code, period_no AS "periodNo" FROM payment_certs
      WHERE contract_id = ? AND status = 'approved' AND period_no > ?
      ORDER BY period_no LIMIT 1`,
    contractId,
    periodNo,
  );
}

/** Kết quả bước quyết định — phần được phát lại nguyên văn khi retry cùng Idempotency-Key. */
export type KetQuaQuyetDinh =
  { result: "approved" | "rejected" } | { result: "pending"; currentSeq: number; nextRole: string };

export type QuyetDinhDaGhi = {
  actorId: number;
  requestHash: string;
  actorRole: string;
  buoc: "legacy" | "engine";
  ketQua: KetQuaQuyetDinh;
};

/** Snapshot đã ghi cho (đợt, operationId) — nguồn phát lại idempotent. */
export async function timQuyetDinhDaGhi(
  certId: number,
  operationId: string,
): Promise<QuyetDinhDaGhi | undefined> {
  const row = await queryOne<{
    actorId: number;
    requestHash: string;
    snapshot: { actorRole: string; buoc: "legacy" | "engine"; ketQua: KetQuaQuyetDinh };
  }>(
    `SELECT actor_id AS "actorId", request_hash AS "requestHash", snapshot
       FROM payment_cert_decision_snapshots WHERE cert_id = ? AND operation_id = ?::uuid`,
    certId,
    operationId,
  );
  if (!row) return undefined;
  return {
    actorId: row.actorId,
    requestHash: row.requestHash,
    actorRole: row.snapshot.actorRole,
    buoc: row.snapshot.buoc,
    ketQua: row.snapshot.ketQua,
  };
}

/**
 * Ghi snapshot quyết định bất biến (DATA-MIGRATIONS §7) — gọi TRONG transaction của quyết định,
 * SAU khi chuyển trạng thái/sinh phiếu, để snapshot chốt đúng luỹ kế đã tính lại dưới khoá. Mọi
 * số là chuỗi exact (`::text` / bigint → moneyToDecimal), không qua float.
 */
export async function ghiSnapshotQuyetDinh(opts: {
  certId: number;
  goc: GocDot;
  actor: { id: number; role: string };
  operationId: string;
  requestHash: string;
  buoc: "legacy" | "engine";
  ketQua: KetQuaQuyetDinh;
  canh: CanhBaoDot;
  xacNhan: XacNhanCanhBao;
  rejectReason: string | null;
  paymentBillId: number | null;
}): Promise<void> {
  const { certId, goc, canh, xacNhan } = opts;
  const hd = await queryOne<{ value: string; advancePct: string; retentionPct: string }>(
    `SELECT value::text AS value, advance_pct::text AS "advancePct",
            retention_pct::text AS "retentionPct"
       FROM contracts WHERE id = ?`,
    goc.contractId,
  );
  const totals = await certTotals(certId);
  const tongChuoi = Object.fromEntries(
    CERT_TOTALS_FIELDS.map((f) => [f, moneyToDecimal(totals[f])]),
  );
  const snapshot = {
    schema: "ipc-decision-snapshot-v1",
    moneyRule: IPC_MONEY_RULE,
    warningRule: IPC_WARNING_RULE,
    buoc: opts.buoc,
    ketQua: opts.ketQua,
    actorRole: opts.actor.role,
    periodNo: goc.periodNo,
    statusTruoc: goc.status,
    contract: hd ?? null,
    lines: canh.dong.map((d) => ({
      boqItemId: d.boqItemId,
      code: d.code,
      unit: d.unit,
      qtyContract: d.qtyContract,
      qtyPeriod: d.qtyPeriod,
      qtyCumulative: d.qtyCumulative,
      unitPrice: d.unitPrice,
    })),
    totals: tongChuoi,
    warnings: canh.dong
      .filter((d) => d.vuot)
      .map((d) => ({
        boqItemId: d.boqItemId,
        qtyContract: d.qtyContract,
        qtyCumulative: d.qtyCumulative,
      })),
    warningVersion: canh.warningVersion,
    acknowledged: xacNhan.acknowledged,
    ackReason: xacNhan.reason,
    ackWarningVersion: xacNhan.warningVersion,
    rejectReason: opts.rejectReason,
    paymentBillId: opts.paymentBillId,
  };
  await run(
    `INSERT INTO payment_cert_decision_snapshots
       (id, cert_id, contract_id, project_id, org_id, actor_id, operation_id, request_hash,
        result_status, snapshot)
     VALUES (?::uuid, ?, ?, ?, ?, ?, ?::uuid, ?, ?, ?::jsonb)`,
    randomUUID(),
    certId,
    goc.contractId,
    goc.projectId,
    goc.orgId,
    opts.actor.id,
    opts.operationId,
    opts.requestHash,
    opts.ketQua.result,
    JSON.stringify(snapshot),
  );
}
