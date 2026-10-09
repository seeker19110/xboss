// Phiếu thanh toán (payment_bills) — phạm vi dòng + trạng thái chi (M129).
//
// M129 (docs/nang-cap/M129-ipc-da-chi-tach-cam-ket-thuc-chi.md): "đã duyệt" ≠ "đã chi".
//   committed = đã duyệt, chưa chi (phiếu sinh khi duyệt IPC) — KHÔNG vào thực chi;
//   paid      = đã chi (paid_at/paid_by) — nguồn sự thật của thực chi;
//   void      = huỷ (chỉ qua chứng từ huỷ hiệu lực M128 khi phiếu gốc chưa chi).
// Đánh dấu chi chỉ đi một chiều committed → paid; quay lại phải qua chứng từ điều chỉnh (M128).
import { query, queryOne } from "@/lib/db";
import { daysFromTodayISO, isValidDateISO, todayISO } from "@/lib/nen/date";

export const PAY_STATUSES = ["committed", "paid", "void"] as const;
export type PayStatus = (typeof PAY_STATUSES)[number];

// Phạm vi bill (S02a cụm 3, P1-1): đúng project_id của dự án đã xác minh — dòng legacy
// project_id NULL KHÔNG sửa/xoá được qua dự án nào — và mọi liên kết cha (hợp đồng/IPC/sheet)
// cùng dự án + org, giống điều kiện GET /api/payments/bills. Ghép thẳng vào câu UPDATE/DELETE/
// SELECT … FOR UPDATE (một câu, không kiểm-rồi-ghi). Tham số: billScopeParams().
export const BILL_SCOPE = `id = ? AND project_id = ?
   AND (contract_id IS NULL OR EXISTS (
     SELECT 1 FROM contracts c JOIN projects cp ON cp.id = c.project_id
      WHERE c.id = payment_bills.contract_id AND c.project_id = ? AND cp.org_id = ?
   ))
   AND (payment_cert_id IS NULL OR EXISTS (
     SELECT 1 FROM payment_certs pc
       JOIN contracts cc ON cc.id = pc.contract_id
       JOIN projects cp ON cp.id = cc.project_id
      WHERE pc.id = payment_bills.payment_cert_id AND cc.project_id = ? AND cp.org_id = ?
        AND (payment_bills.contract_id IS NULL OR pc.contract_id = payment_bills.contract_id)
   ))
   AND (sheet_type_id IS NULL OR EXISTS (
     SELECT 1 FROM sheet_types pst
       JOIN towers pt ON pt.id = pst.tower_id
       JOIN projects pp ON pp.id = pt.project_id
      WHERE pst.id = payment_bills.sheet_type_id AND pt.project_id = ? AND pp.org_id = ?
   ))`;

// Phạm vi phiếu khi TỔNG HỢP tiền (thực chi / cam kết chưa chi): dùng chung cho cost.ts
// loadPayments và finance.ts approvedUnpaidByMonth để hai nơi không lệch nhau. Quy ước bí danh:
// `p.id` = dự án đang xét, `pb` = payment_bills; PB_TONG_HOP_JOINS cung cấp st/tw/c/pc/pcc.
// Dòng có cha (hợp đồng/IPC/sheet) thuộc dự án khác → không 'ok' (invalid_scope).
export const PB_TONG_HOP_JOINS = `LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
       LEFT JOIN contracts c ON c.id = pb.contract_id
       LEFT JOIN payment_certs pc ON pc.id = pb.payment_cert_id
       LEFT JOIN contracts pcc ON pcc.id = pc.contract_id`;

export const PB_TONG_HOP_OK = `COALESCE(pb.project_id = p.id
                               AND (pb.contract_id IS NULL OR c.project_id = p.id)
                               AND (pb.payment_cert_id IS NULL OR pcc.project_id = p.id)
                               AND (pb.sheet_type_id IS NULL OR tw.project_id = p.id), false)`;

export function billScopeParams(id: number, projectId: number, orgId: number): unknown[] {
  return [id, projectId, projectId, orgId, projectId, orgId, projectId, orgId];
}

type BillLock = { payStatus: PayStatus; paymentCertId: number | null };

/** Khoá dòng phiếu trong phạm vi dự án (FOR UPDATE) — undefined khi không thấy. Gọi trong tx. */
export async function khoaPhieu(
  id: number,
  projectId: number,
  orgId: number,
): Promise<BillLock | undefined> {
  return queryOne<BillLock>(
    `SELECT pay_status AS "payStatus", payment_cert_id AS "paymentCertId"
       FROM payment_bills WHERE ${BILL_SCOPE} FOR UPDATE`,
    ...billScopeParams(id, projectId, orgId),
  );
}

/**
 * Phiếu đã chi gắn IPC là chứng từ đã chốt: không xoá, không sửa số tiền — điều chỉnh phải qua
 * chứng từ điều chỉnh/đảo phiếu (M128).
 */
export function phieuDaChot(b: BillLock): boolean {
  return b.payStatus === "paid" && b.paymentCertId != null;
}

/**
 * Phiếu gắn đợt IPC (committed lẫn paid) không xoá được — huỷ/sửa phải qua chứng từ điều chỉnh
 * (M128), để chuỗi IPC → phiếu → thực chi không mất dấu.
 */
export function phieuGanIpc(b: BillLock): boolean {
  return b.paymentCertId != null;
}

export const LOI_PHIEU_GAN_IPC =
  "Phiếu gắn đợt IPC — không xoá được, huỷ/sửa phải qua chứng từ điều chỉnh (M128)";

export const LOI_PHIEU_DA_CHOT =
  "Phiếu đã chi của đợt IPC đã chốt — không xoá/sửa số tiền được, cần lập chứng từ điều chỉnh";

export type DanhDauChiInput = { paidAt: string; paidRef: string | null; paidNote: string | null };

const MAX_REF = 200;
const MAX_NOTE = 2000;

/** Đọc + validate body `/pay` (thuần). Chuỗi lỗi = 422 `paid_at_invalid` / 400 khác. */
export function docDanhDauChi(
  body: unknown,
): DanhDauChiInput | { error: string; code?: "paid_at_invalid" } {
  const b = (body ?? {}) as Record<string, unknown>;
  const paidAt = typeof b.paidAt === "string" ? b.paidAt.trim() : "";
  if (!isValidDateISO(paidAt))
    return { error: "Ngày chi không hợp lệ (YYYY-MM-DD)", code: "paid_at_invalid" };
  const chuoi = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (b.paidRef != null && typeof b.paidRef !== "string")
    return { error: "Số chứng từ phải là chuỗi" };
  if (b.paidNote != null && typeof b.paidNote !== "string")
    return { error: "Ghi chú phải là chuỗi" };
  const paidRef = chuoi(b.paidRef);
  const paidNote = chuoi(b.paidNote);
  if (paidRef && paidRef.length > MAX_REF) return { error: `Số chứng từ tối đa ${MAX_REF} ký tự` };
  if (paidNote && paidNote.length > MAX_NOTE) return { error: `Ghi chú tối đa ${MAX_NOTE} ký tự` };
  return { paidAt, paidRef, paidNote };
}

export type KetQuaDanhDauChi =
  | {
      ok: true;
      bill: {
        id: number;
        payStatus: "paid";
        paidAt: string;
        paidBy: number;
        paidRef: string | null;
        paidNote: string | null;
      };
    }
  | {
      ok: false;
      status: 403 | 404 | 409 | 422;
      error: string;
      code?: "sod_same_actor" | "already_paid" | "bill_void" | "paid_at_invalid";
    };

/**
 * Chuyển phiếu committed → paid. GỌI TRONG transaction của request (withProjectScope ghi) SAU khi
 * route đã tái kiểm quyền lúc ghi. Khoá dòng phiếu (FOR UPDATE) rồi mới kiểm trạng thái/SoD/ngày:
 * hai lượt đồng thời xếp hàng, lượt sau thấy 'paid' → 409 (idempotent, không cần Idempotency-Key).
 * SoD: người chi ≠ người quyết định bước cuối của IPC gốc (payment_certs.decided_by) — phiếu
 * sinh từ chứng từ điều chỉnh (M128): ≠ người duyệt chứng từ đó.
 * Ngày chi: không sau hôm nay (giờ VN) và không trước ngày duyệt IPC.
 */
export async function danhDauDaChi(
  input: DanhDauChiInput,
  scope: { billId: number; projectId: number; orgId: number; userId: number },
): Promise<KetQuaDanhDauChi> {
  const { billId, projectId, orgId, userId } = scope;
  const phieu = await khoaPhieu(billId, projectId, orgId);
  if (!phieu) return { ok: false, status: 404, error: "Không tìm thấy phiếu thanh toán" };
  if (phieu.payStatus === "paid")
    return { ok: false, status: 409, error: "Phiếu đã được đánh dấu chi", code: "already_paid" };
  if (phieu.payStatus === "void")
    return {
      ok: false,
      status: 409,
      error: "Phiếu đã huỷ — không đánh dấu chi được",
      code: "bill_void",
    };

  let decidedAt: string | null = null;
  if (phieu.paymentCertId != null) {
    // M128: phiếu sinh từ chứng từ điều chỉnh → SoD/ngày so với NGƯỜI DUYỆT CHỨNG TỪ ĐÓ (không
    // phải người duyệt IPC gốc); phiếu IPC thường → người quyết định bước cuối của đợt.
    const cert =
      (await queryOne<{ decidedBy: number | null; decidedAt: string | null }>(
        `SELECT decided_by AS "decidedBy", decided_at AS "decidedAt"
           FROM payment_cert_adjustments WHERE bill_id = ?`,
        billId,
      )) ??
      (await queryOne<{ decidedBy: number | null; decidedAt: string | null }>(
        `SELECT decided_by AS "decidedBy", decided_at AS "decidedAt" FROM payment_certs WHERE id = ?`,
        phieu.paymentCertId,
      ));
    if (cert?.decidedBy === userId)
      return {
        ok: false,
        status: 403,
        error: "Người duyệt đợt thanh toán không được tự đánh dấu đã chi (phân tách nhiệm vụ)",
        code: "sod_same_actor",
      };
    decidedAt = cert?.decidedAt ?? null;
  }
  if (input.paidAt > todayISO())
    return {
      ok: false,
      status: 422,
      error: "Ngày chi không được sau hôm nay",
      code: "paid_at_invalid",
    };
  if (decidedAt && input.paidAt < decidedAt)
    return {
      ok: false,
      status: 422,
      error: `Ngày chi không được trước ngày duyệt đợt (${decidedAt})`,
      code: "paid_at_invalid",
    };

  // Điều kiện pay_status='committed' giữ bất biến một chiều kể cả khi caller quên khoá.
  const rows = await query<{
    id: number;
    paidAt: string;
    paidBy: number;
    paidRef: string | null;
    paidNote: string | null;
  }>(
    `UPDATE payment_bills
        SET pay_status = 'paid', paid_at = ?, paid_by = ?, paid_ref = ?, paid_note = ?
      WHERE id = ? AND pay_status = 'committed'
      RETURNING id, paid_at AS "paidAt", paid_by AS "paidBy", paid_ref AS "paidRef",
                paid_note AS "paidNote"`,
    input.paidAt,
    userId,
    input.paidRef,
    input.paidNote,
    billId,
  );
  const r = rows[0];
  if (!r)
    return { ok: false, status: 409, error: "Phiếu đã được đánh dấu chi", code: "already_paid" };
  return { ok: true, bill: { ...r, payStatus: "paid" } };
}

// --- Cảnh báo phiếu đã duyệt chưa chi (thông báo bill_unpaid) -------------------------

export type UnpaidBill = {
  id: number;
  responsible: string;
  paidDate: string;
  certCode: string | null;
};

/**
 * Phiếu committed của dự án đã lập (= ngày duyệt IPC) từ ≥ `days` ngày mà chưa chi. Không trả số
 * tiền (thông điệp thông báo không lộ tiền). Thiếu dự án → [] (fail-closed, không quét toàn hệ).
 */
export async function unpaidBillsOverdue(
  days: number,
  projectId: number | null,
): Promise<UnpaidBill[]> {
  if (projectId == null) return [];
  return query<UnpaidBill>(
    `SELECT pb.id, pb.responsible, pb.paid_date AS "paidDate", pc.code AS "certCode"
       FROM payment_bills pb
       LEFT JOIN payment_certs pc ON pc.id = pb.payment_cert_id
      WHERE pb.project_id = ? AND pb.pay_status = 'committed' AND pb.paid_date < ?
      ORDER BY pb.paid_date, pb.id`,
    projectId,
    daysFromTodayISO(-days),
  );
}
