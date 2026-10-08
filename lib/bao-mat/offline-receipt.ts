// Receipt cho 4 thao tác hàng đợi offline: tick / tick_batch / photo / diary_note
// (QUALITY-FINAL-1 S06 — DATA-CONTRACTS §5, A2-FR09..FR11, APPROVAL D04).
//
// Giao thức (mỗi endpoint thật gọi theo đúng thứ tự):
//   1. phiên (401) → quyền vai trò (403) → dự án → `docThaoTacHangDoi` (400 header sai) →
//      `chotNguCanhHangDoi` (409 context) → phạm vi/quyền tài nguyên (404/403) — TRƯỚC khi tra receipt,
//      nên replay vẫn bị chặn khi quyền vừa bị thu hồi (receipt không phải giấy thông hành).
//   2. trong withTransaction: `khoaVaTraBienNhan` khoá advisory (org, dự án, user, operationId) rồi
//      tra receipt — cùng hash → ACK cũ (replayed), khác hash/khác loại → 409 idempotency_conflict.
//   3. chưa có receipt → kiểm precondition/gate → mutation → `ghiBienNhan` CÙNG transaction → COMMIT.
// Không có placeholder "pending": request đồng thời cùng key xếp hàng ở khoá advisory, request sau
// thấy receipt đã COMMIT của request trước. Không TTL, không UPDATE/DELETE receipt.
//
// Request KHÔNG có cả hai header (UI online hiện tại) đi đường cũ, không receipt — không phải đường
// vòng: vẫn đủ phiên/quyền/phạm vi như trước. Mỗi loại tự định nghĩa `target`/`payload`/`baseVersion`
// của nó ở route (không có một header chung "coi như đã chống trùng" cho mọi route).
import { createHash } from "node:crypto";
import { dangTrongGiaoDich, queryOne, run } from "@/lib/db";
import type { User } from "@/lib/bao-mat/auth";
import { CONTEXT_HEADER } from "@/lib/bao-mat/offline-context";
import { damBaoNguCanhActor, LoiOffline } from "@/lib/bao-mat/offline-devices";

export const IDEMPOTENCY_HEADER = "idempotency-key";
/** Phiên bản thuật toán băm request — đổi cách chuẩn hoá thì tăng, không sửa ngầm. */
export const RECEIPT_HASH_VERSION = "receipt-v1";

export type LoaiThaoTac = "tick" | "tick_batch" | "photo" | "diary_note";

export type ThaoTacHangDoi = { operationId: string; context: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Đọc header hàng đợi. Không có cả `Idempotency-Key` lẫn `X-XBoss-Context` → null (caller online).
 * Có context mà thiếu key, hoặc key không phải UUID → 400 (operationId là uuid theo DDL receipt).
 * Có key mà thiếu context → để `chotNguCanhHangDoi` trả 409 context_invalid.
 */
export function docThaoTacHangDoi(headers: Headers): ThaoTacHangDoi | null {
  const key = headers.get(IDEMPOTENCY_HEADER);
  const context = headers.get(CONTEXT_HEADER);
  if (key == null && context == null) return null;
  if (key == null)
    throw new LoiOffline(
      400,
      "idempotency_key_required",
      "Thao tác ngoại tuyến thiếu Idempotency-Key",
    );
  const k = key.trim();
  if (!UUID_RE.test(k))
    throw new LoiOffline(400, "idempotency_key_invalid", "Idempotency-Key phải là UUID");
  return { operationId: k.toLowerCase(), context };
}

/** Chuẩn hoá JSON: khoá object sắp xếp cố định, `undefined` → null, số không hữu hạn bị từ chối. */
function chuanTac(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(chuanTac);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("Giá trị số không hữu hạn trong request hash");
    return v;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, chuanTac(o[k])]),
    );
  }
  return v;
}

export type DauVaoHash = {
  kind: LoaiThaoTac;
  orgId: number;
  projectId: number;
  userId: number;
  /** Tài nguyên đích (id dimension, tập id, task, ngày nhật ký). */
  target: unknown;
  /** Nội dung nghiệp vụ ĐÃ chuẩn hoá như server sẽ ghi (ảnh: digest byte + metadata). */
  payload: unknown;
  /** Phiên bản gốc client dựa vào (If-Match / "*" của If-None-Match) — null nếu loại không có. */
  baseVersion: string | null;
};

/** SHA-256 hex của JSON chuẩn gồm version/kind/scope/target/payload/baseVersion (DATA-CONTRACTS §5). */
export function bamYeuCau(d: DauVaoHash): string {
  const chuoi = JSON.stringify(
    chuanTac({
      v: RECEIPT_HASH_VERSION,
      kind: d.kind,
      scope: { org: d.orgId, project: d.projectId, user: d.userId },
      target: d.target,
      payload: d.payload,
      baseVersion: d.baseVersion,
    }),
  );
  return createHash("sha256").update(chuoi).digest("hex");
}

export type PhamViBienNhan = {
  user: User;
  projectId: number;
  operationId: string;
  kind: LoaiThaoTac;
  hash: string;
};

/** ACK trả client — không chứa payload nghiệp vụ. */
export type BienNhan = {
  operationId: string;
  kind: LoaiThaoTac;
  replayed: boolean;
  resourceType: string;
  resourceId: string;
  version: string | null;
};

type DongReceipt = {
  kind: LoaiThaoTac;
  hash: string;
  resourceType: string;
  resourceId: string;
  version: string | null;
};

function batBuocGiaoDich(pv: PhamViBienNhan): void {
  if (!dangTrongGiaoDich())
    throw new Error("Receipt offline phải chạy trong withTransaction của mutation");
  // GUC app.user_id/org_id/project_id của transaction lấy từ ngữ cảnh request — lệch actor/dự án
  // thì RLS sẽ chặn hoặc ghi sai phạm vi: fail-closed thay vì chạy tiếp.
  damBaoNguCanhActor(pv.user, pv.projectId);
}

/**
 * Khoá bộ (org, dự án, user, operationId) tới hết transaction rồi tra receipt.
 * null = chưa có (caller tiếp tục precondition/gate/mutation); BienNhan = replay hợp lệ;
 * cùng key nhưng khác hash hoặc khác loại → LoiOffline 409 idempotency_conflict.
 */
export async function khoaVaTraBienNhan(pv: PhamViBienNhan): Promise<BienNhan | null> {
  batBuocGiaoDich(pv);
  await queryOne(
    `SELECT pg_advisory_xact_lock(hashtextextended(?, 0))`,
    `op-receipt|${pv.user.orgId}|${pv.projectId}|${pv.user.id}|${pv.operationId}`,
  );
  const r = await queryOne<DongReceipt>(
    `SELECT operation_kind AS kind, request_hash AS hash, resource_type AS "resourceType",
            resource_id AS "resourceId", result_version AS version
       FROM audit_operation_receipts
      WHERE org_id = ? AND project_id = ? AND user_id = ? AND operation_id = ?::uuid`,
    pv.user.orgId,
    pv.projectId,
    pv.user.id,
    pv.operationId,
  );
  if (!r) return null;
  if (r.kind !== pv.kind || r.hash !== pv.hash)
    throw new LoiOffline(
      409,
      "idempotency_conflict",
      "Idempotency-Key đã dùng cho một thao tác khác — tạo thao tác mới thay vì sửa thao tác đã gửi",
    );
  return {
    operationId: pv.operationId,
    kind: r.kind,
    replayed: true,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    version: r.version,
  };
}

/** Ghi receipt CÙNG transaction với mutation (gọi ngay trước khi transaction COMMIT). */
export async function ghiBienNhan(
  pv: PhamViBienNhan,
  taiNguyen: { resourceType: string; resourceId: string; version: string | null },
): Promise<BienNhan> {
  batBuocGiaoDich(pv);
  await run(
    `INSERT INTO audit_operation_receipts
       (operation_id, user_id, org_id, project_id, operation_kind, request_hash,
        resource_type, resource_id, result_version)
     VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pv.operationId,
    pv.user.id,
    pv.user.orgId,
    pv.projectId,
    pv.kind,
    pv.hash,
    taiNguyen.resourceType,
    taiNguyen.resourceId,
    taiNguyen.version,
  );
  return { operationId: pv.operationId, kind: pv.kind, replayed: false, ...taiNguyen };
}
