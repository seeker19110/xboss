// M128 — Chứng từ điều chỉnh (adjustment) / huỷ hiệu lực (reversal) cho đợt IPC ĐÃ DUYỆT
// (docs/nang-cap/M128-chung-tu-dieu-chinh-ipc.md, D07, A5-FR06/FR10).
//
// IPC đã duyệt là hồ sơ chốt: không sửa dòng KL, không sửa snapshot kỳ sau. Sửa sai đi qua chứng
// từ RIÊNG (sổ điều chỉnh) — luỹ kế hợp đồng cộng `qty_delta` của chứng từ đã duyệt
// (`lib/tai-chinh/paymentcerts.ts`). Module này giữ phần thuần tài chính: đọc/validate đầu vào,
// lập/sửa/xoá nháp, chốt giá trị trong SQL, áp hệ quả khi duyệt (phiếu thanh toán / huỷ phiếu
// gốc), snapshot quyết định + Idempotency-Key, DTO wire. Phần phối hợp với engine phê duyệt
// (miền tiến độ) nằm ở `lib/dich-vu/dieu-chinh-ipc.ts` (ADR-0008).
//
// Mọi hàm ghi CHẠY TRONG transaction của route (withProjectScope ghi) — khoá theo thứ tự ổn định
// hợp đồng → đợt → chứng từ (`khoaDieuChinh`), giống mọi đường ghi IPC. Tiền: tổng/tích trong
// SQL, đọc `::text`, không cộng/nhân float JS (M45).
import { createHash, randomUUID } from "node:crypto";
import { insertId, query, queryOne, run } from "@/lib/db";
import { CAN } from "@/lib/bao-mat/auth";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";
import { isUniqueViolation } from "@/lib/ha-tang/seqcode";
import { todayISO } from "@/lib/nen/date";
import { log } from "@/lib/nen/log";
import {
  fitsNumeric,
  ipcSumV1,
  moneyToDecimal,
  parseMoneyExact,
  type MoneyWireFormat,
} from "@/lib/nen/money";
import { thapPhanTextToWire, tienTextToWire, type MoneyWire } from "@/lib/nen/money-dto";
import type { Role } from "@/lib/nen/roles";
import { khoaHopDongVaDot, type GocDot } from "@/lib/tai-chinh/ipc-quyet-dinh";

export const ADJ_KINDS = ["adjustment", "reversal"] as const;
export type AdjKind = (typeof ADJ_KINDS)[number];
export type AdjStatus = "draft" | "submitted" | "approved" | "rejected";

/** Lý do chứng từ tối thiểu (khớp CHECK của migration 0168). */
export const MIN_LY_DO = 10;
const MAX_LY_DO = 2000;
const MAX_GHI_CHU = 1000;

/** Lỗi có chủ đích: status HTTP + mã máy đọc — route trả qua `phanHoiLoiCoStatus`. */
export function loiDieuChinh(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

// ── Đầu vào (thuần) ─────────────────────────────────────────────────────────────────────

export type DongDieuChinhInput = { boqItemId: number; qtyDelta: string; note: string | null };

type LoiDauVao = { error: string; code: string; status: 400 | 422 };

const SO_CO_DAU = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * KL điều chỉnh ± → chuỗi canonical 3 số lẻ (NUMERIC(15,3)), không qua float. Nhận số JSON hoặc
 * chuỗi thập phân thuần ("-2.5"); dạng mũ/dấu phẩy/nhóm nghìn → lỗi. 0 → lỗi (dòng vô nghĩa).
 */
export function docQtyDelta(v: unknown, dong: number): string | LoiDauVao {
  const loi = (error: string): LoiDauVao => ({ error, code: "qty_delta_invalid", status: 422 });
  let raw: string;
  if (typeof v === "number" && Number.isFinite(v)) raw = String(v);
  else if (typeof v === "string") raw = v.trim();
  else return loi(`Dòng ${dong}: KL điều chỉnh không hợp lệ`);
  const m = SO_CO_DAU.exec(raw);
  if (!m) return loi(`Dòng ${dong}: KL điều chỉnh phải là số thập phân thuần, vd -2.5`);
  const [, dau, nguyen, le = ""] = m;
  if (/[1-9]/.test(le.slice(3)))
    return loi(`Dòng ${dong}: KL điều chỉnh tối đa 3 chữ số thập phân`);
  const unscaled = BigInt(nguyen + le.slice(0, 3).padEnd(3, "0"));
  if (unscaled === 0n) return loi(`Dòng ${dong}: KL điều chỉnh phải khác 0`);
  // NUMERIC(15,3) nhưng chừa chỗ cộng luỹ kế (giống MAX_QTY_PERIOD của dòng IPC): < 10^11.
  if (!fitsNumeric(unscaled, 14)) return loi(`Dòng ${dong}: KL điều chỉnh quá lớn`);
  const s = unscaled.toString().padStart(4, "0");
  return `${dau}${s.slice(0, -3)}.${s.slice(-3)}`;
}

function docLyDo(v: unknown): string | LoiDauVao {
  const ly = typeof v === "string" ? v.trim() : "";
  if (ly.length < MIN_LY_DO)
    return {
      error: `Lý do điều chỉnh bắt buộc, tối thiểu ${MIN_LY_DO} ký tự`,
      code: "reason_too_short",
      status: 422,
    };
  if (ly.length > MAX_LY_DO)
    return { error: `Lý do tối đa ${MAX_LY_DO} ký tự`, code: "reason_too_long", status: 422 };
  return ly;
}

function docDong(v: unknown): DongDieuChinhInput[] | LoiDauVao {
  if (!Array.isArray(v)) return { error: "items phải là mảng", code: "items_invalid", status: 400 };
  const out: DongDieuChinhInput[] = [];
  const seen = new Set<number>();
  for (const [i, raw] of v.entries()) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const boqItemId = Number(it.boqItemId);
    if (!Number.isSafeInteger(boqItemId) || boqItemId <= 0)
      return { error: `Dòng ${n}: thiếu dòng BOQ`, code: "items_invalid", status: 422 };
    if (seen.has(boqItemId))
      return { error: `Dòng ${n}: dòng BOQ trùng lặp`, code: "items_invalid", status: 422 };
    seen.add(boqItemId);
    const qtyDelta = docQtyDelta(it.qtyDelta, n);
    if (typeof qtyDelta !== "string") return qtyDelta;
    if (it.note != null && typeof it.note !== "string")
      return { error: `Dòng ${n}: ghi chú phải là chuỗi`, code: "items_invalid", status: 400 };
    const note = typeof it.note === "string" && it.note.trim() ? it.note.trim() : null;
    if (note && note.length > MAX_GHI_CHU)
      return {
        error: `Dòng ${n}: ghi chú tối đa ${MAX_GHI_CHU} ký tự`,
        code: "items_invalid",
        status: 422,
      };
    out.push({ boqItemId, qtyDelta, note });
  }
  return out;
}

export type DauVaoTao = { kind: AdjKind; reason: string; items: DongDieuChinhInput[] };

/** Body POST tạo chứng từ: `{ kind, reason, items? }`. Reversal bỏ qua items (server sinh). */
export function docDauVaoTao(body: unknown): DauVaoTao | LoiDauVao {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.kind !== "adjustment" && b.kind !== "reversal")
    return { error: "kind phải là adjustment/reversal", code: "kind_invalid", status: 422 };
  const reason = docLyDo(b.reason);
  if (typeof reason !== "string") return reason;
  if (b.kind === "reversal") return { kind: "reversal", reason, items: [] };
  const items = docDong(b.items ?? []);
  if (!Array.isArray(items)) return items;
  if (items.length === 0)
    return { error: "Chứng từ điều chỉnh cần ít nhất 1 dòng", code: "items_required", status: 422 };
  return { kind: "adjustment", reason, items };
}

export type DauVaoSua = { reason?: string; items?: DongDieuChinhInput[] };

/** Body PATCH nháp: `{ reason?, items? }` — rỗng cả hai → 400. */
export function docDauVaoSua(body: unknown): DauVaoSua | LoiDauVao {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: DauVaoSua = {};
  if (b.reason !== undefined) {
    const reason = docLyDo(b.reason);
    if (typeof reason !== "string") return reason;
    out.reason = reason;
  }
  if (b.items !== undefined) {
    const items = docDong(b.items);
    if (!Array.isArray(items)) return items;
    if (items.length === 0)
      return {
        error: "Chứng từ điều chỉnh cần ít nhất 1 dòng",
        code: "items_required",
        status: 422,
      };
    out.items = items;
  }
  if (out.reason === undefined && out.items === undefined)
    return { error: "Không có gì để sửa", code: "body_invalid", status: 400 };
  return out;
}

// ── Khoá + kiểm điều kiện ──────────────────────────────────────────────────────────────

export type DongKhoa = {
  id: number;
  code: string;
  certId: number;
  contractId: number;
  projectId: number;
  kind: AdjKind;
  status: AdjStatus;
  createdBy: number;
};

/**
 * Khoá theo thứ tự ổn định hợp đồng → đợt (`khoaHopDongVaDot`) → chứng từ (FOR UPDATE), cùng
 * phạm vi dự án + tổ chức. undefined = không thấy (khác dự án/không tồn tại → route 404).
 */
export async function khoaDieuChinh(
  id: number,
  projectId: number,
  orgId: number,
): Promise<{ goc: GocDot; adj: DongKhoa } | undefined> {
  const so = await queryOne<{ certId: number }>(
    `SELECT cert_id AS "certId" FROM payment_cert_adjustments WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
  if (!so) return undefined;
  const goc = await khoaHopDongVaDot(so.certId, projectId, orgId);
  if (!goc) return undefined;
  const adj = await queryOne<DongKhoa>(
    `SELECT id, code, cert_id AS "certId", contract_id AS "contractId", project_id AS "projectId",
            kind, status, created_by AS "createdBy"
       FROM payment_cert_adjustments WHERE id = ? AND project_id = ? FOR UPDATE`,
    id,
    projectId,
  );
  if (!adj || adj.certId !== so.certId || adj.contractId !== goc.contractId) return undefined;
  return { goc, adj };
}

/** Đợt đã có reversal duyệt → 409 cert_reversed; đã có chứng từ mở → 409 adjustment_open_exists. */
async function kiemDotConDieuChinhDuoc(certId: number): Promise<void> {
  const r = await queryOne<{ reversed: boolean; open: boolean }>(
    `SELECT bool_or(kind = 'reversal' AND status = 'approved') AS reversed,
            bool_or(status IN ('draft', 'submitted')) AS open
       FROM payment_cert_adjustments WHERE cert_id = ?`,
    certId,
  );
  if (r?.reversed)
    throw loiDieuChinh(
      409,
      "Đợt đã bị huỷ hiệu lực (reversal đã duyệt) — không lập thêm chứng từ điều chỉnh",
      "cert_reversed",
    );
  if (r?.open)
    throw loiDieuChinh(
      409,
      "Đợt đang có chứng từ điều chỉnh nháp/đã trình — xử lý xong chứng từ đó trước",
      "adjustment_open_exists",
    );
}

/**
 * Quyền trên nháp — SỬA: chỉ NGƯỜI LẬP (SoD: Admin sửa nháp của PM rồi tự duyệt sẽ lách
 * "người duyệt ≠ người lập", vì người duyệt chỉ bị so với `created_by`). XOÁ: người lập hoặc
 * Admin (dọn nháp bỏ dở — xoá không đổi nội dung chứng từ nào được duyệt). Phải còn nháp.
 */
function kiemNhapCuaToi(
  adj: DongKhoa,
  user: { id: number; role: Role },
  thaoTac: "sua" | "xoa",
): void {
  if (thaoTac === "sua" && adj.createdBy !== user.id)
    throw loiDieuChinh(
      403,
      "Chỉ người lập được sửa chứng từ nháp (người khác lập chứng từ mới hoặc xoá nháp này)",
    );
  if (thaoTac === "xoa" && adj.createdBy !== user.id && user.role !== "admin")
    throw loiDieuChinh(403, "Chỉ người lập hoặc Admin được xoá chứng từ nháp");
  if (adj.status !== "draft")
    throw loiDieuChinh(
      409,
      "Chỉ sửa/xoá được chứng từ đang ở trạng thái nháp",
      "adjustment_not_draft",
    );
}

const LOI_QUYEN_LAP = "Chỉ Admin/PM được lập/sửa chứng từ điều chỉnh";

// ── Ghi dòng + chốt giá trị (trong SQL) ─────────────────────────────────────────────────

/**
 * Ghi lại toàn bộ dòng của chứng từ `adjustment`: dòng BOQ phải thuộc đợt gốc; đơn giá lấy từ
 * dòng KL của đợt gốc (không nhập tay, không lấy giá BOQ hôm nay). KL hiệu lực của dòng trong đợt
 * (KL kỳ + điều chỉnh đã duyệt + điều chỉnh này) không được âm → 422 qty_below_zero.
 */
async function ghiDong(
  adj: { id: number; certId: number; projectId: number },
  items: DongDieuChinhInput[],
): Promise<void> {
  const dongDot = await query<{ boqItemId: number }>(
    `SELECT boq_item_id AS "boqItemId" FROM payment_cert_items WHERE cert_id = ?`,
    adj.certId,
  );
  const thuocDot = new Set(dongDot.map((d) => d.boqItemId));
  const sai = items.find((it) => !thuocDot.has(it.boqItemId));
  if (sai)
    throw loiDieuChinh(422, `Dòng BOQ #${sai.boqItemId} không thuộc đợt này`, "item_not_in_cert");

  await run(`DELETE FROM payment_cert_adjustment_items WHERE adjustment_id = ?`, adj.id);
  for (const it of items) {
    await run(
      `INSERT INTO payment_cert_adjustment_items
         (adjustment_id, project_id, boq_item_id, qty_delta, unit_price, note)
       SELECT ?, ?, ?, ?::numeric, pi.unit_price, ?
         FROM payment_cert_items pi WHERE pi.cert_id = ? AND pi.boq_item_id = ?`,
      adj.id,
      adj.projectId,
      it.boqItemId,
      it.qtyDelta,
      it.note,
      adj.certId,
      it.boqItemId,
    );
  }
  const am = await queryOne<{ code: string }>(
    `SELECT b.code
       FROM payment_cert_adjustment_items ai
       JOIN payment_cert_items pi ON pi.cert_id = ? AND pi.boq_item_id = ai.boq_item_id
       JOIN boq_items b ON b.id = ai.boq_item_id
      WHERE ai.adjustment_id = ?
        AND pi.qty_period + ai.qty_delta + COALESCE((
              SELECT SUM(x.qty_delta)
                FROM payment_cert_adjustment_items x
                JOIN payment_cert_adjustments y ON y.id = x.adjustment_id
               WHERE y.cert_id = ? AND y.status = 'approved' AND x.boq_item_id = ai.boq_item_id
            ), 0) < 0
      ORDER BY b.code LIMIT 1`,
    adj.certId,
    adj.id,
    adj.certId,
  );
  if (am)
    throw loiDieuChinh(
      422,
      `Dòng ${am.code}: KL sau điều chỉnh của đợt bị âm — giảm tối đa bằng KL hiện có`,
      "qty_below_zero",
    );
}

/**
 * Chốt `amount` của chứng từ `adjustment` = ROUND(Σ qty_delta × unit_price gốc, 2) — cộng NUMERIC
 * trong SQL rồi làm tròn SAU khi cộng (như ipc-sum-v1); vượt NUMERIC(15,2) → 422, không tràn 500.
 */
async function chotGiaTri(adjId: number): Promise<void> {
  const r = await queryOne<{ v: string }>(
    `SELECT ROUND(COALESCE(SUM(qty_delta * unit_price), 0), 2)::text AS v
       FROM payment_cert_adjustment_items WHERE adjustment_id = ?`,
    adjId,
  );
  const v = r?.v ?? "0.00";
  if (!fitsNumeric(parseMoneyExact(v), 15))
    throw loiDieuChinh(422, "Giá trị chứng từ điều chỉnh vượt giới hạn lưu trữ", "amount_overflow");
  await run(`UPDATE payment_cert_adjustments SET amount = ?::numeric WHERE id = ?`, v, adjId);
}

/**
 * Reversal = huỷ TOÀN BỘ hiệu lực của đợt, kể cả các điều chỉnh đã duyệt trước đó của chính đợt
 * (không thì luỹ kế/tiền còn sót phần điều chỉnh cũ): dòng = −(KL kỳ + Σ KL điều chỉnh đã duyệt)
 * từng dòng khác 0 (đơn giá gốc); amount = −(Σ phiếu còn hiệu lực của đợt — phiếu gốc + phiếu điều
 * chỉnh, trừ phiếu void; mọi phiếu đều RÒNG ipc-sum-v1) = −giá trị đề nghị của đợt khi đợt chưa có
 * điều chỉnh. Đợt luôn có phiếu gốc (`kiemCoPhieuGoc` chặn đợt legacy trước khi lập).
 */
async function ghiReversal(adj: { id: number; certId: number; projectId: number }): Promise<void> {
  await run(
    `INSERT INTO payment_cert_adjustment_items
       (adjustment_id, project_id, boq_item_id, qty_delta, unit_price, note)
     SELECT ?, ?, pi.boq_item_id, -(pi.qty_period + dc.d), pi.unit_price, NULL
       FROM payment_cert_items pi
       CROSS JOIN LATERAL (
         SELECT COALESCE(SUM(x.qty_delta), 0) AS d
           FROM payment_cert_adjustment_items x
           JOIN payment_cert_adjustments y ON y.id = x.adjustment_id
          WHERE y.cert_id = pi.cert_id AND y.status = 'approved' AND x.boq_item_id = pi.boq_item_id
       ) dc
      WHERE pi.cert_id = ? AND pi.qty_period + dc.d <> 0`,
    adj.id,
    adj.projectId,
    adj.certId,
  );
  await run(
    `UPDATE payment_cert_adjustments
        SET amount = -(SELECT COALESCE(SUM(amount), 0) FROM payment_bills
                        WHERE payment_cert_id = ? AND type IN ('bill', 'adjustment')
                          AND pay_status <> 'void')
      WHERE id = ?`,
    adj.certId,
    adj.id,
  );
}

/**
 * Quyết định 2026-10-09 (spec M128 §6, mục 12): đợt đã duyệt KHÔNG có phiếu gốc (`type='bill'`,
 * dữ liệu legacy trước khi duyệt IPC sinh phiếu) → không có hồ sơ tiền để điều chỉnh/huỷ → 409
 * `ipc_no_bill`. Gọi lúc lập VÀ lúc duyệt (dưới khoá HĐ → đợt).
 */
export async function kiemCoPhieuGoc(certId: number): Promise<void> {
  const r = await queryOne<{ co: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM payment_bills WHERE payment_cert_id = ? AND type = 'bill') AS co`,
    certId,
  );
  if (!r?.co)
    throw loiDieuChinh(
      409,
      "Đợt thanh toán chưa có phiếu gốc (dữ liệu cũ) — cần nhập phiếu gốc của đợt trước khi lập/duyệt chứng từ điều chỉnh",
      "ipc_no_bill",
    );
}

/**
 * Số tiền RÒNG của phiếu sinh từ chứng từ `adjustment` (quyết định 2026-10-09, mục 11): cùng
 * công thức ipc-sum-v1 với phiếu gốc — round(Σ qty_delta × giá gốc) − round(tạm ứng) − round(giữ
 * lại) theo tỷ lệ HĐ — để −toàn bộ KL của đợt = −đúng giá trị phiếu gốc. Bigint exact (đọc `::text`).
 */
async function giaTriRongDieuChinh(adj: DongKhoa): Promise<string> {
  const hd = await queryOne<{ advancePct: string | null; retentionPct: string | null }>(
    `SELECT advance_pct::text AS "advancePct", retention_pct::text AS "retentionPct"
       FROM contracts WHERE id = ?`,
    adj.contractId,
  );
  // Tỷ lệ NOT NULL — null chỉ khi không đọc được HĐ (RLS/dữ liệu hỏng): tiền thật → fail-fast.
  if (hd?.advancePct == null || hd.retentionPct == null) {
    log.error("giaTriRongDieuChinh: không đọc được tỷ lệ hợp đồng", { adjustmentId: adj.id });
    throw new Error("giaTriRongDieuChinh: thiếu dòng hợp đồng của chứng từ điều chỉnh");
  }
  const lines = await query<{ qtyPeriod: string; unitPrice: string }>(
    `SELECT qty_delta::text AS "qtyPeriod", unit_price::text AS "unitPrice"
       FROM payment_cert_adjustment_items WHERE adjustment_id = ? ORDER BY id`,
    adj.id,
  );
  return moneyToDecimal(
    ipcSumV1(lines, { advancePct: hd.advancePct, retentionPct: hd.retentionPct }).approvedValue,
  );
}

// ── Lập / sửa / xoá nháp ────────────────────────────────────────────────────────────────

type Actor = { id: number; role: Role };

/** Lập chứng từ nháp cho đợt `approved`. Trả id. GỌI TRONG transaction ghi có GUC dự án. */
export async function taoDieuChinh(opts: {
  certId: number;
  projectId: number;
  orgId: number;
  user: Actor;
  input: DauVaoTao;
}): Promise<number> {
  const { certId, projectId, orgId, user, input } = opts;
  const goc = await khoaHopDongVaDot(certId, projectId, orgId);
  if (!goc) throw loiDieuChinh(404, "Không tìm thấy đợt thanh toán");
  if (!(await kiemQuyenTaiLucGhi(() => CAN.manageContracts(user.role))))
    throw loiDieuChinh(403, LOI_QUYEN_LAP);
  if (goc.status !== "approved")
    throw loiDieuChinh(
      409,
      "Chỉ lập chứng từ điều chỉnh cho đợt đã duyệt — đợt chưa duyệt thì sửa trực tiếp",
      "cert_not_approved",
    );
  await kiemCoPhieuGoc(certId);
  await kiemDotConDieuChinhDuoc(certId);

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO payment_cert_adjustments
         (code, cert_id, contract_id, project_id, kind, reason, amount, created_by)
       VALUES ('ADJ-' || ? || '-' || lpad(nextval('payment_cert_adjustment_code_seq')::text, 4, '0'),
               ?, ?, ?, ?, ?, 0, ?)`,
      todayISO().slice(0, 4),
      certId,
      goc.contractId,
      projectId,
      input.kind,
      input.reason,
      user.id,
    );
  } catch (err) {
    // Lưới an toàn uq_pca_open/uq_pca_reversal (khoá HĐ đã tuần tự hoá — chỉ còn đường lạ).
    if (isUniqueViolation(err))
      throw loiDieuChinh(409, "Đợt đang có chứng từ điều chỉnh mở", "adjustment_open_exists");
    throw err;
  }
  const adj = { id, certId, projectId };
  if (input.kind === "reversal") await ghiReversal(adj);
  else {
    await ghiDong(adj, input.items);
    await chotGiaTri(id);
  }
  return id;
}

/** Sửa nháp: lý do và (chỉ `adjustment`) dòng. Reversal chỉ sửa được lý do. */
export async function suaDieuChinh(opts: {
  id: number;
  projectId: number;
  orgId: number;
  user: Actor;
  input: DauVaoSua;
}): Promise<void> {
  const { id, projectId, orgId, user, input } = opts;
  const k = await khoaDieuChinh(id, projectId, orgId);
  if (!k) throw loiDieuChinh(404, "Không tìm thấy chứng từ điều chỉnh");
  if (!(await kiemQuyenTaiLucGhi(() => CAN.manageContracts(user.role))))
    throw loiDieuChinh(403, LOI_QUYEN_LAP);
  kiemNhapCuaToi(k.adj, user, "sua");
  if (input.items && k.adj.kind === "reversal")
    throw loiDieuChinh(
      422,
      "Chứng từ huỷ hiệu lực lấy dòng từ đợt gốc — chỉ sửa được lý do",
      "reversal_items_fixed",
    );
  if (input.reason !== undefined)
    await run(`UPDATE payment_cert_adjustments SET reason = ? WHERE id = ?`, input.reason, id);
  if (input.items) {
    await ghiDong(k.adj, input.items);
    await chotGiaTri(id);
  }
}

/** Xoá nháp (dòng cascade). Vết xoá nằm ở audit_log (trigger 0168). */
export async function xoaDieuChinh(opts: {
  id: number;
  projectId: number;
  orgId: number;
  user: Actor;
}): Promise<void> {
  const { id, projectId, orgId, user } = opts;
  const k = await khoaDieuChinh(id, projectId, orgId);
  if (!k) throw loiDieuChinh(404, "Không tìm thấy chứng từ điều chỉnh");
  if (!(await kiemQuyenTaiLucGhi(() => CAN.manageContracts(user.role))))
    throw loiDieuChinh(403, LOI_QUYEN_LAP);
  kiemNhapCuaToi(k.adj, user, "xoa");
  await run(`DELETE FROM payment_cert_adjustments WHERE id = ? AND status = 'draft'`, id);
}

// ── Trình / áp quyết định ────────────────────────────────────────────────────────────────

/**
 * Nháp → đã trình (chỉ NGƯỜI LẬP — SoD: người duyệt ≠ người lập = người trình). Chốt lại giá trị
 * dưới khoá. Trả amount (chuỗi exact) cho engine so ngưỡng. GỌI TRONG transaction ghi.
 */
export async function trinhDieuChinhCore(
  k: { goc: GocDot; adj: DongKhoa },
  user: Actor,
): Promise<string> {
  if (!(await kiemQuyenTaiLucGhi(() => CAN.manageContracts(user.role))))
    throw loiDieuChinh(403, "Chỉ Admin/PM được trình chứng từ điều chỉnh");
  if (k.adj.createdBy !== user.id)
    throw loiDieuChinh(403, "Chỉ người lập được trình chứng từ điều chỉnh");
  if (k.adj.status !== "draft")
    throw loiDieuChinh(
      409,
      "Chỉ trình được chứng từ đang ở trạng thái nháp",
      "adjustment_not_draft",
    );
  if (k.goc.status !== "approved")
    throw loiDieuChinh(409, "Đợt gốc không còn ở trạng thái đã duyệt", "cert_not_approved");
  const dem = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM payment_cert_adjustment_items WHERE adjustment_id = ?`,
    k.adj.id,
  );
  if (k.adj.kind === "adjustment") {
    if (!dem?.n)
      throw loiDieuChinh(422, "Chứng từ điều chỉnh cần ít nhất 1 dòng", "items_required");
    await chotGiaTri(k.adj.id);
  }
  const r = await queryOne<{ amount: string }>(
    `UPDATE payment_cert_adjustments SET status = 'submitted', submitted_at = ?
      WHERE id = ? AND status = 'draft' RETURNING amount::text AS amount`,
    todayISO(),
    k.adj.id,
  );
  return r!.amount;
}

/**
 * Bước cuối DUYỆT: (1) chốt giá trị trong SQL; (2) phiếu thanh toán:
 *   - adjustment → phiếu type 'adjustment' (pay_status 'committed', payment_cert_id = đợt gốc),
 *     số tiền RÒNG ipc-sum-v1 (`giaTriRongDieuChinh`, quyết định 2026-10-09) — giá trị chứng từ
 *     vẫn là KL × giá (gộp, luỹ kế KL gộp);
 *   - reversal → chuyển MỌI phiếu 'committed' còn hiệu lực của đợt (phiếu gốc + phiếu điều chỉnh)
 *     sang 'void'; phần ĐÃ CHI ('paid') bù bằng ĐÚNG MỘT phiếu 'adjustment' = −Σ amount phiếu paid
 *     (tính trong SQL; phiếu đều ròng); không phiếu paid → không phiếu âm (MEDIUM-3);
 * (3) chứng từ → approved. Kỳ sau không bị đụng. Đợt phải có phiếu gốc (`kiemCoPhieuGoc`, caller
 * kiểm dưới khoá). Trả { billId, voidedBillIds }.
 */
export async function apDungDuyet(
  adj: DongKhoa,
  user: Actor,
): Promise<{ billId: number | null; voidedBillIds: number[] }> {
  let billId: number | null = null;
  let voidedBillIds: number[] = [];
  if (adj.kind === "adjustment") {
    await chotGiaTri(adj.id);
    billId = await sinhPhieuDieuChinh(adj, user, await giaTriRongDieuChinh(adj));
  } else {
    const phieuDot = await query<{ id: number }>(
      `SELECT id FROM payment_bills
        WHERE payment_cert_id = ? AND type IN ('bill', 'adjustment') AND pay_status <> 'void'
        ORDER BY id FOR UPDATE`,
      adj.certId,
    );
    const ids = phieuDot.map((p) => p.id);
    voidedBillIds = (
      await query<{ id: number }>(
        `UPDATE payment_bills SET pay_status = 'void'
          WHERE id = ANY(?::int[]) AND pay_status = 'committed' RETURNING id`,
        ids,
      )
    ).map((p) => p.id);
    const daChi = await queryOne<{ am: string | null }>(
      `SELECT CASE WHEN COALESCE(SUM(amount), 0) <> 0 THEN (-SUM(amount))::text END AS am
         FROM payment_bills WHERE id = ANY(?::int[]) AND pay_status = 'paid'`,
      ids,
    );
    if (daChi?.am != null) billId = await sinhPhieuDieuChinh(adj, user, daChi.am);
  }
  await run(
    `UPDATE payment_cert_adjustments
        SET status = 'approved', decided_at = ?, decided_by = ?, bill_id = ?
      WHERE id = ? AND status = 'submitted'`,
    todayISO(),
    user.id,
    billId,
    adj.id,
  );
  return { billId, voidedBillIds };
}

/** Phiếu type 'adjustment' committed gắn đợt gốc, số tiền `amountText` (chuỗi exact). */
async function sinhPhieuDieuChinh(adj: DongKhoa, user: Actor, amountText: string): Promise<number> {
  return insertId(
    `INSERT INTO payment_bills (responsible, type, amount, description, paid_date, contract_id,
                                payment_cert_id, created_by, project_id, pay_status)
     SELECT COALESCE(s.name, ct.party_name, ct.title, '—'), 'adjustment',
            ?::numeric,
            ? || a.code || ' — đợt ' || pc.period_no || ' — ' || ct.title,
            ?, a.contract_id, a.cert_id, ?, ct.project_id, 'committed'
       FROM payment_cert_adjustments a
       JOIN payment_certs pc ON pc.id = a.cert_id
       JOIN contracts ct ON ct.id = a.contract_id
       LEFT JOIN suppliers s ON s.id = ct.party_supplier_id
      WHERE a.id = ?`,
    amountText,
    adj.kind === "reversal" ? "Huỷ hiệu lực " : "Điều chỉnh ",
    todayISO(),
    user.id,
    adj.id,
  );
}

export async function tuChoi(adjId: number, user: Actor, rejectReason: string): Promise<void> {
  await run(
    `UPDATE payment_cert_adjustments
        SET status = 'rejected', decided_at = ?, decided_by = ?, reject_reason = ?
      WHERE id = ? AND status = 'submitted'`,
    todayISO(),
    user.id,
    rejectReason,
    adjId,
  );
}

// ── Snapshot quyết định + Idempotency-Key (khuôn 0160) ─────────────────────────────────

export type KetQuaDieuChinh =
  { result: "approved" | "rejected" } | { result: "pending"; currentSeq: number; nextRole: string };

export function bamYeuCauDieuChinh(input: {
  adjustmentId: number;
  decision: string;
  rejectReason: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify(["ipc-adj-decide-v1", input.adjustmentId, input.decision, input.rejectReason]),
    )
    .digest("hex");
}

export type QuyetDinhDieuChinhDaGhi = {
  actorId: number;
  requestHash: string;
  actorRole: string;
  buoc: "legacy" | "engine";
  ketQua: KetQuaDieuChinh;
};

export async function timQuyetDinhDieuChinh(
  adjustmentId: number,
  operationId: string,
): Promise<QuyetDinhDieuChinhDaGhi | undefined> {
  const row = await queryOne<{
    actorId: number;
    requestHash: string;
    snapshot: { actorRole: string; buoc: "legacy" | "engine"; ketQua: KetQuaDieuChinh };
  }>(
    `SELECT actor_id AS "actorId", request_hash AS "requestHash", snapshot
       FROM payment_cert_adjustment_decisions WHERE adjustment_id = ? AND operation_id = ?::uuid`,
    adjustmentId,
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

/** Ghi snapshot bất biến của một quyết định — SAU khi chuyển trạng thái/sinh phiếu, cùng tx. */
export async function ghiSnapshotDieuChinh(opts: {
  adj: DongKhoa;
  goc: GocDot;
  actor: Actor;
  operationId: string;
  requestHash: string;
  buoc: "legacy" | "engine";
  ketQua: KetQuaDieuChinh;
  rejectReason: string | null;
  billId: number | null;
  voidedBillIds: number[];
}): Promise<void> {
  const { adj, goc } = opts;
  const head = await queryOne<{ amount: string; reason: string }>(
    `SELECT amount::text AS amount, reason FROM payment_cert_adjustments WHERE id = ?`,
    adj.id,
  );
  const lines = await query<{ boqItemId: number; qtyDelta: string; unitPrice: string }>(
    `SELECT boq_item_id AS "boqItemId", qty_delta::text AS "qtyDelta",
            unit_price::text AS "unitPrice"
       FROM payment_cert_adjustment_items WHERE adjustment_id = ? ORDER BY boq_item_id`,
    adj.id,
  );
  const snapshot = {
    schema: "ipc-adjustment-decision-snapshot-v1",
    moneyRule: "adj-sum-v1",
    buoc: opts.buoc,
    ketQua: opts.ketQua,
    actorRole: opts.actor.role,
    code: adj.code,
    kind: adj.kind,
    certId: adj.certId,
    periodNo: goc.periodNo,
    statusTruoc: adj.status,
    amount: head?.amount ?? null,
    reason: head?.reason ?? null,
    lines,
    rejectReason: opts.rejectReason,
    paymentBillId: opts.billId,
    voidedBillIds: opts.voidedBillIds,
  };
  await run(
    `INSERT INTO payment_cert_adjustment_decisions
       (id, adjustment_id, cert_id, contract_id, project_id, org_id, actor_id, operation_id,
        request_hash, result_status, snapshot)
     VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?::uuid, ?, ?, ?::jsonb)`,
    randomUUID(),
    adj.id,
    adj.certId,
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
