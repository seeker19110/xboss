// M128 — đọc + DTO wire chứng từ điều chỉnh/huỷ hiệu lực IPC (tách khỏi ipc-dieu-chinh.ts cho
// gọn: file đó giữ phần ghi). Mọi tiền đọc `::text`; gọi trong withProjectScope (bảng FORCE RLS).
import { query, queryOne } from "@/lib/db";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";
import { parseMoneyExact, type MoneyWireFormat } from "@/lib/nen/money";
import { thapPhanTextToWire, tienTextToWire, type MoneyWire } from "@/lib/nen/money-dto";
import type { Role } from "@/lib/nen/roles";
import type { AdjKind, AdjStatus } from "@/lib/tai-chinh/ipc-dieu-chinh";

// ── Đọc + DTO wire ─────────────────────────────────────────────────────────────────────

export type DongDieuChinhRow = {
  id: number;
  adjustmentId: number;
  boqItemId: number;
  boqCode: string;
  boqName: string;
  unit: string;
  qtyDelta: string;
  unitPrice: string | null;
  note: string | null;
};

export type DieuChinhRow = {
  id: number;
  code: string;
  certId: number;
  contractId: number;
  projectId: number;
  kind: AdjKind;
  status: AdjStatus;
  reason: string;
  amount: string | null;
  billId: number | null;
  createdBy: number;
  createdByName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: number | null;
  decidedByName: string | null;
  rejectReason: string | null;
  createdAt: string;
  items: Omit<DongDieuChinhRow, "adjustmentId">[];
};

async function docDieuChinh(where: string, ...params: unknown[]): Promise<DieuChinhRow[]> {
  const heads = await query<Omit<DieuChinhRow, "items">>(
    `SELECT a.id, a.code, a.cert_id AS "certId", a.contract_id AS "contractId",
            a.project_id AS "projectId", a.kind, a.status, a.reason, a.amount::text AS amount,
            a.bill_id AS "billId", a.created_by AS "createdBy", uc.name AS "createdByName",
            a.submitted_at AS "submittedAt", a.decided_at AS "decidedAt",
            a.decided_by AS "decidedBy", ud.name AS "decidedByName",
            a.reject_reason AS "rejectReason", a.created_at AS "createdAt"
       FROM payment_cert_adjustments a
       LEFT JOIN users uc ON uc.id = a.created_by
       LEFT JOIN users ud ON ud.id = a.decided_by
      ${where}
      ORDER BY a.id`,
    ...params,
  );
  if (heads.length === 0) return [];
  const lines = await query<DongDieuChinhRow>(
    `SELECT ai.id, ai.adjustment_id AS "adjustmentId", ai.boq_item_id AS "boqItemId",
            b.code AS "boqCode", b.name AS "boqName", b.unit, ai.qty_delta::text AS "qtyDelta",
            ai.unit_price::text AS "unitPrice", ai.note
       FROM payment_cert_adjustment_items ai
       JOIN boq_items b ON b.id = ai.boq_item_id
      WHERE ai.adjustment_id = ANY(?)
      ORDER BY b.code, ai.id`,
    heads.map((h) => h.id),
  );
  return heads.map((h) => ({
    ...h,
    items: lines
      .filter((l) => l.adjustmentId === h.id)
      .map((l) => ({
        id: l.id,
        boqItemId: l.boqItemId,
        boqCode: l.boqCode,
        boqName: l.boqName,
        unit: l.unit,
        qtyDelta: l.qtyDelta,
        unitPrice: l.unitPrice,
        note: l.note,
      })),
  }));
}

/** Chứng từ của một đợt trong đúng dự án (fail-closed khi thiếu dự án). Gọi trong withProjectScope. */
export async function listDieuChinhCuaDot(
  certId: number,
  projectId: number,
): Promise<DieuChinhRow[]> {
  return docDieuChinh("WHERE a.cert_id = ? AND a.project_id = ?", certId, projectId);
}

export async function getDieuChinh(
  id: number,
  projectId: number,
): Promise<DieuChinhRow | undefined> {
  return (await docDieuChinh("WHERE a.id = ? AND a.project_id = ?", id, projectId))[0];
}

/** Đợt có thuộc dự án đang chọn không (cùng điều kiện với GET /api/payment-certs/:id). */
export async function dotThuocDuAn(certId: number, projectId: number): Promise<boolean> {
  const r = await queryOne<{ id: number }>(
    `SELECT c.id FROM payment_certs c JOIN contracts ct ON ct.id = c.contract_id
      WHERE c.id = ? AND ct.project_id = ?`,
    certId,
    projectId,
  );
  return !!r;
}

export type DieuChinhWire = Omit<DieuChinhRow, "amount" | "items"> & {
  amount: MoneyWire | null;
  items: (Omit<DieuChinhRow["items"][number], "unitPrice"> & { unitPrice: MoneyWire | null })[];
};

/**
 * DTO wire (A3-FR06): che `amount`/`items.unitPrice` cho người thiếu viewPayments TRƯỚC khi đổi
 * wire; v1 → chuỗi canonical, legacy → JSON number (ngoài biên throw RangeError → route 422).
 * `qtyDelta` luôn là chuỗi thập phân 3 số lẻ (khối lượng, không phải tiền).
 */
export function dieuChinhToWire(
  rows: DieuChinhRow[],
  user: { role?: Role },
  format: MoneyWireFormat,
): DieuChinhWire[] {
  return stripSensitive("paymentCertAdjustment", rows, user).map((r) => ({
    ...r,
    amount: tienTextToWire(r.amount, format),
    items: r.items.map((it) => ({
      ...it,
      unitPrice: it.unitPrice == null ? null : thapPhanTextToWire(it.unitPrice, 2, format),
    })),
  }));
}

export type TomTatDieuChinh = {
  open: number;
  approvedCount: number;
  reversed: boolean;
  /**
   * Chênh lệch giá trị GỘP: Σ amount chứng từ đã duyệt (KL × giá — adj-sum-v2), MoneyMinor cộng
   * trong SQL. Giá trị hiệu lực của đợt = giá trị kỳ (periodValue) + grossAmount.
   */
  grossAmount: bigint;
  /**
   * Tiền phiếu điều chỉnh RÒNG: Σ amount phiếu `type='adjustment'` chưa huỷ (void) gắn đợt — gồm
   * phiếu âm bù phần đã chi của reversal. MoneyMinor cộng trong SQL.
   */
  netBillAmount: bigint;
};

/** Tóm tắt chứng từ điều chỉnh của một đợt cho GET /api/payment-certs/:id. */
export async function tomTatDieuChinh(certId: number): Promise<TomTatDieuChinh> {
  const r = await queryOne<{
    open: number;
    approvedCount: number;
    reversed: boolean;
    gross: string;
    netBill: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('draft', 'submitted'))::int AS open,
            COUNT(*) FILTER (WHERE status = 'approved')::int AS "approvedCount",
            COALESCE(bool_or(kind = 'reversal' AND status = 'approved'), false) AS reversed,
            COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::text AS gross,
            (SELECT COALESCE(SUM(b.amount), 0) FROM payment_bills b
              WHERE b.payment_cert_id = ? AND b.type = 'adjustment'
                AND b.pay_status <> 'void')::text AS "netBill"
       FROM payment_cert_adjustments WHERE cert_id = ?`,
    certId,
    certId,
  );
  return {
    open: r?.open ?? 0,
    approvedCount: r?.approvedCount ?? 0,
    reversed: r?.reversed ?? false,
    grossAmount: parseMoneyExact(r?.gross ?? "0"),
    netBillAmount: parseMoneyExact(r?.netBill ?? "0"),
  };
}
