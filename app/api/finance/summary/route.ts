import { NextRequest, NextResponse } from "next/server";
import { todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  cashflowActual,
  receivables,
  payables,
  advanceOutstanding,
  vatSummary,
  type CashflowMonth,
  type VatSummary,
} from "@/lib/tai-chinh/finance";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyToWire,
  moneyWireFormat,
  type MoneyWireFormat,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  moneyFieldsToWire,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS_API_TIEN });

type TongHopTien = {
  cashflow: CashflowMonth[];
  receivables: bigint;
  payables: bigint;
  advanceOutstanding: bigint;
  vat: VatSummary;
};

// Đổi mọi số tiền (bigint) sang wire theo định dạng client chọn — legacy ngoài biên throw.
function tongHopToWire(t: TongHopTien, format: MoneyWireFormat) {
  return {
    cashflow: t.cashflow.map((m) => moneyFieldsToWire(m, ["in", "out"], format)),
    receivables: moneyToWire(t.receivables, format),
    payables: moneyToWire(t.payables, format),
    advanceOutstanding: moneyToWire(t.advanceOutstanding, format),
    vat: moneyFieldsToWire(t.vat, ["vatIn", "vatOut", "netVat"], format),
  };
}

// GET /api/finance/summary?period=YYYY-MM — gộp dòng tiền/công nợ/tạm ứng/VAT cho trang
// dashboard tài chính (tránh N request rời rạc ở client). Xem: CAN.viewPayments.
// S10c (A3-FR06): header `X-XBoss-Money-Format: decimal-string-v1` → mọi số tiền là chuỗi
// canonical 2 số lẻ + `moneyFormat`; không header → number legacy, ngoài biên round-trip → 422
// `money_precision_unsupported`. Response `private, no-store` + `Vary`.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  if (!CAN.viewPayments(user.role)) return json({ error: "Bạn không có quyền xem tài chính" }, 403);

  const period = req.nextUrl.searchParams.get("period") ?? todayISO().slice(0, 7);
  if (!PERIOD_RE.test(period)) return json({ error: "Kỳ không hợp lệ (YYYY-MM)" }, 422);
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));

  const projectId = await getCurrentProjectId(user);
  let tong: TongHopTien;
  if (projectId == null) {
    tong = {
      cashflow: [],
      receivables: 0n,
      payables: 0n,
      advanceOutstanding: 0n,
      vat: { vatIn: 0n, vatOut: 0n, netVat: 0n },
    };
  } else {
    const [cashflow, rcv, pay, adv, vat] = await Promise.all([
      cashflowActual(projectId),
      receivables(projectId),
      payables(projectId),
      advanceOutstanding(projectId),
      vatSummary(period, projectId),
    ]);
    tong = { cashflow, receivables: rcv, payables: pay, advanceOutstanding: adv, vat };
  }

  try {
    return json({ period, ...tongHopToWire(tong, format), ...nhanDinhDangTien(format) });
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return json(LOI_TIEN_VUOT_DINH_DANG_CU, 422);
  }
}
