// Đọc chi tiết 1 đợt IPC (GET /api/payment-certs/:id) cho chứng từ — tách khỏi CertDocument để
// test được không cần render. QUALITY-FINAL-1 S10a: client CHỌN decimal-string-v1 nên tổng tiền
// về dạng chuỗi canonical exact (không bao giờ dính 422 money_precision_unsupported của định
// dạng number cũ) và hiển thị bằng bigint, không qua float.
import {
  decimalTuSoJs,
  isCanonicalDecimal,
  moneyToDecimal,
  mulRatio,
  parseMoneyExact,
} from "@/lib/nen/money";
import type { EntityApprovalStatus } from "@/lib/tien-do/approvals";

/** Header + giá trị opt-in (A3-FR06) — trùng hằng trong lib/nen/money, ghi rõ ở nơi gọi fetch. */
export const HEADER_DINH_DANG_TIEN = { "X-XBoss-Money-Format": "decimal-string-v1" } as const;

/** Tổng tiền đợt dạng chuỗi canonical 2 số lẻ; null = API che (thiếu viewPayments). */
export type CertTotalsView = {
  periodValue: string | null;
  cumulativeValue: string | null;
  advanceDeduct: string | null;
  retentionDeduct: string | null;
  approvedValue: string | null;
};

export type DongVuot = {
  boqItemId: number;
  code: string;
  name: string;
  unit: string;
  qtyContract: number;
  qtyCumulative: number;
};

/**
 * M128: tóm tắt chứng từ điều chỉnh của đợt (GET /api/payment-certs/:id). Tiền null = bị che.
 * grossAmount = chênh lệch giá trị GỘP (Σ chứng từ đã duyệt, KL × giá); netBillAmount = tiền
 * phiếu điều chỉnh RÒNG (sau tạm ứng/giữ lại) chưa huỷ.
 */
export type TomTatDieuChinhDot = {
  open: number;
  approvedCount: number;
  reversed: boolean;
  grossAmount?: string | number | null;
  netBillAmount?: string | number | null;
};

/**
 * Giá trị HIỆU LỰC (gộp) hiện tại của đợt = giá trị kỳ (periodValue) + Σ điều chỉnh gộp đã duyệt
 * — đúng số chứng từ huỷ hiệu lực sẽ chốt (âm). Cộng bigint exact; thiếu/che/số legacy → null (UI
 * không đoán, không cộng float).
 */
export function giaTriHieuLucDot(
  periodValue: string | number | null | undefined,
  grossAmount: string | number | null | undefined,
): string | null {
  if (!isCanonicalDecimal(periodValue, 2)) return null;
  if (grossAmount == null) return periodValue;
  if (!isCanonicalDecimal(grossAmount, 2)) return null;
  return moneyToDecimal(parseMoneyExact(periodValue) + parseMoneyExact(grossAmount));
}

export type ChiTietDot = {
  adjustmentsSummary?: TomTatDieuChinhDot | null;
  approvalStatus: EntityApprovalStatus | null;
  vuotHopDong: DongVuot[];
  /** Phiên bản cảnh báo server dựng (S13c) — gửi kèm khi xác nhận duyệt; null nếu không có. */
  warningVersion: string | null;
  totals: CertTotalsView | null;
  /** Thông báo lỗi tiếng Việt khi không tải được — KHÁC null-bị-che ("•••"). */
  loi: string | null;
};

/**
 * Chuỗi tiền canonical → "1.234.567 đ" (làm tròn tới đồng bằng bigint, ties xa 0). Đúng 0 → "—"
 * như `fmtVND`; `am` thêm dấu "−" cho khoản khấu trừ khác 0.
 */
export function fmtVNDExact(s: string, am = false): string {
  const minor = parseMoneyExact(s);
  if (minor === 0n) return "—";
  return `${am ? "−" : ""}${mulRatio(minor, 1n, 100n).toLocaleString("vi-VN")} đ`;
}

/** bigint đồng×100 → "1.234.567 đ" (tròn tới đồng, ties xa 0); đúng 0 → "—" như `fmtVND`. */
export function fmtVNDMinor(minor: bigint): string {
  return minor === 0n ? "—" : `${mulRatio(minor, 1n, 100n).toLocaleString("vi-VN")} đ`;
}

/** bigint đồng NGUYÊN (vd thành tiền dòng `mThanhTienDong`) → "1.234.567 đ"; 0 → "—". */
export function fmtVNDDong(dong: bigint): string {
  return dong === 0n ? "—" : `${dong.toLocaleString("vi-VN")} đ`;
}

/**
 * Khối lượng người dùng đang gõ → chuỗi scale 3 ĐÚNG số server sẽ ghi: client gửi
 * `Number(raw) || 0` (xem saveItems), PG làm tròn vào qty_period NUMERIC(15,3). Không hữu hạn
 * (vd "1e400") → "0.000": JSON.stringify(Infinity) = null, server đọc Number(null) = 0 và lưu 0 —
 * tạm tính khớp đúng số đó, không hiện "•••" như bị che.
 */
export function khoiLuongNhapScale3(raw: string): string {
  const n = Number(raw) || 0;
  return decimalTuSoJs(Number.isFinite(n) ? n : 0, 3);
}

/** Response → dữ liệu chứng từ. Lỗi HTTP thành thông báo, không nuốt thành "không có quyền". */
export async function docChiTietDot(res: Response): Promise<ChiTietDot> {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const vuotHopDong = Array.isArray(body?.vuotHopDong) ? (body.vuotHopDong as DongVuot[]) : [];
  const warningVersion = typeof body?.warningVersion === "string" ? body.warningVersion : null;
  if (!res.ok) {
    const thongBao = typeof body?.error === "string" ? body.error : null;
    return {
      approvalStatus: null,
      adjustmentsSummary: null,
      vuotHopDong,
      warningVersion,
      totals: null,
      loi: `Không tải được tổng hợp giá trị đợt (mã ${res.status})${thongBao ? `: ${thongBao}` : ""}`,
    };
  }
  return {
    approvalStatus: (body?.approvalStatus as EntityApprovalStatus | null) ?? null,
    adjustmentsSummary: (body?.adjustmentsSummary as TomTatDieuChinhDot | null) ?? null,
    vuotHopDong,
    warningVersion,
    totals: (body?.totals as CertTotalsView | null) ?? null,
    loi: null,
  };
}

/** Dữ liệu mở hộp xác nhận cảnh báo vượt HĐ khi duyệt (S13c, A5-FR07). */
export type YeuCauXacNhan = {
  vuotHopDong: DongVuot[];
  warningVersion: string;
  /** true = server báo cảnh báo đã đổi so với bản người duyệt đã xem (409 warning_changed). */
  doiNguon: boolean;
};

/**
 * Phản hồi 409 của POST /api/payment-certs/:id/decide khi cần (lại) xác nhận cảnh báo →
 * dữ liệu mở hộp xác nhận; lỗi khác → null (hiển thị thông điệp như thường). Phản hồi 409 không
 * bao giờ được hiểu là "đã duyệt".
 */
export function docYeuCauXacNhan(status: number, body: unknown): YeuCauXacNhan | null {
  if (status !== 409 || !body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.code !== "acknowledgement_required" && b.code !== "warning_changed") return null;
  if (typeof b.warningVersion !== "string" || !Array.isArray(b.vuotHopDong)) return null;
  return {
    vuotHopDong: b.vuotHopDong as DongVuot[],
    warningVersion: b.warningVersion,
    doiNguon: b.code === "warning_changed",
  };
}

/** Idempotency-Key cho một lượt quyết định (thử lại sau mất mạng dùng lại đúng key). */
export function taoIdempotencyKey(): string | null {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : null;
}
