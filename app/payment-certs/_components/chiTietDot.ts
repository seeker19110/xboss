// Đọc chi tiết 1 đợt IPC (GET /api/payment-certs/:id) cho chứng từ — tách khỏi CertDocument để
// test được không cần render. QUALITY-FINAL-1 S10a: client CHỌN decimal-string-v1 nên tổng tiền
// về dạng chuỗi canonical exact (không bao giờ dính 422 money_precision_unsupported của định
// dạng number cũ) và hiển thị bằng bigint, không qua float.
import { mulRatio, parseMoneyExact } from "@/lib/nen/money";
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

export type ChiTietDot = {
  approvalStatus: EntityApprovalStatus | null;
  vuotHopDong: DongVuot[];
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

/** Response → dữ liệu chứng từ. Lỗi HTTP thành thông báo, không nuốt thành "không có quyền". */
export async function docChiTietDot(res: Response): Promise<ChiTietDot> {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const vuotHopDong = Array.isArray(body?.vuotHopDong) ? (body.vuotHopDong as DongVuot[]) : [];
  if (!res.ok) {
    const thongBao = typeof body?.error === "string" ? body.error : null;
    return {
      approvalStatus: null,
      vuotHopDong,
      totals: null,
      loi: `Không tải được tổng hợp giá trị đợt (mã ${res.status})${thongBao ? `: ${thongBao}` : ""}`,
    };
  }
  return {
    approvalStatus: (body?.approvalStatus as EntityApprovalStatus | null) ?? null,
    vuotHopDong,
    totals: (body?.totals as CertTotalsView | null) ?? null,
    loi: null,
  };
}
