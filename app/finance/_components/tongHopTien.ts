// Đọc GET /api/finance/summary ở định dạng decimal-string-v1 (QUALITY-FINAL-1 S10c) thành
// bigint đồng×100 và tính KPI (tồn quỹ, công nợ ròng) bằng bigint — không cộng/trừ tiền trên
// float JS. Tách khỏi page.tsx để test được không cần render.
import { minorTuWire } from "@/lib/nen/money-dto";

export type CashflowMonthExact = { month: string; in: bigint; out: bigint };
export type VatSummaryExact = { vatIn: bigint; vatOut: bigint; netVat: bigint };

export type FinanceSummaryExact = {
  period: string;
  cashflow: CashflowMonthExact[];
  receivables: bigint;
  payables: bigint;
  advanceOutstanding: bigint;
  vat: VatSummaryExact;
};

export const VAT_RONG: VatSummaryExact = { vatIn: 0n, vatOut: 0n, netVat: 0n };

type ThanV1 = {
  period: string;
  moneyFormat?: string;
  cashflow: { month: string; in: string; out: string }[];
  receivables: string;
  payables: string;
  advanceOutstanding: string;
  vat: { vatIn: string; vatOut: string; netVat: string };
};

/**
 * Body v1 → bigint. Response không mang `moneyFormat: decimal-string-v1` (server chưa hỗ trợ
 * định dạng) hoặc sai dạng → null: trang hiện trạng thái không tải được, KHÔNG đoán số.
 */
export function docTongHopTaiChinh(body: unknown): FinanceSummaryExact | null {
  const b = body as ThanV1 | null;
  if (!b || b.moneyFormat !== "decimal-string-v1") return null;
  try {
    return {
      period: b.period,
      cashflow: b.cashflow.map((m) => ({
        month: m.month,
        in: minorTuWire(m.in),
        out: minorTuWire(m.out),
      })),
      receivables: minorTuWire(b.receivables),
      payables: minorTuWire(b.payables),
      advanceOutstanding: minorTuWire(b.advanceOutstanding),
      vat: {
        vatIn: minorTuWire(b.vat.vatIn),
        vatOut: minorTuWire(b.vat.vatOut),
        netVat: minorTuWire(b.vat.netVat),
      },
    };
  } catch {
    return null;
  }
}

/** KPI dải đầu trang: tồn quỹ = Σthu − Σchi; công nợ ròng = phải thu − phải trả (bigint). */
export function kpiTaiChinh(s: FinanceSummaryExact | null): {
  fundBalance: bigint;
  netDebt: bigint;
  advanceOutstanding: bigint;
} {
  if (!s) return { fundBalance: 0n, netDebt: 0n, advanceOutstanding: 0n };
  let fundBalance = 0n;
  for (const m of s.cashflow) fundBalance += m.in - m.out;
  return {
    fundBalance,
    netDebt: s.receivables - s.payables,
    advanceOutstanding: s.advanceOutstanding,
  };
}
