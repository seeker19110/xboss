// M27 — Tài chính & Kế toán công trường. Quỹ tiền mặt/dòng tiền (cash_transactions),
// tạm ứng & hoàn ứng (advances), hoá đơn VAT (invoices — bảng có từ PR1, API PR2),
// kỳ lương (payroll — bảng có từ PR1, API PR3). Công nợ (phải thu/phải trả) là VIEW,
// không lưu — suy từ contracts/payment_bills/purchase_orders (M16/M17/M04, tái dùng
// lib/contracts.ts, KHÔNG lặp công thức). Xem docs/nang-cap/M27-tai-chinh-ke-toan.md.
import { query, queryOne } from "@/lib/db";
import { listContracts } from "@/lib/contracts";
import { attendanceSummary } from "@/lib/hr";
import { daysFromTodayISO } from "@/lib/date";
import { parseMoney, moneyToNumber } from "@/lib/money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

// --- Dòng tiền thực tế (quỹ tiền mặt + petty cash) ---------------------------------

export type CashflowMonth = { month: string; in: number; out: number };

// Dòng tiền thực tế `months` tháng gần nhất từ cash_transactions — thay cashflowSeries
// (M9, tái dựng gần đúng từ payment_bills) khi đã có dữ liệu ghi quỹ thật.
export async function cashflowActual(projectId: number, months = 12): Promise<CashflowMonth[]> {
  const rows = await query<{ month: string; direction: "in" | "out"; total: number }>(
    `SELECT to_char(tx_date, 'YYYY-MM') AS month, direction, SUM(amount) AS total
       FROM cash_transactions
      WHERE project_id = ? AND tx_date >= (CURRENT_DATE - (INTERVAL '1 month' * ?))
      GROUP BY month, direction
      ORDER BY month`,
    projectId,
    months,
  );
  const map = new Map<string, CashflowMonth>();
  for (const r of rows) {
    const entry = map.get(r.month) ?? { month: r.month, in: 0, out: 0 };
    entry[r.direction] = Number(r.total);
    map.set(r.month, entry);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// --- Công nợ (view, suy từ HĐ/IPC/PO/bill — M16/M17/M04, không lưu) ----------------

// Phải thu CĐT = Σ (giá trị gốc + phụ lục) − Σ đã thanh toán của các HĐ nhận thầu.
// Tái dùng listContracts (lib/contracts.ts) đã tổng hợp addendaTotal/paid theo HĐ.
export async function receivables(projectId: number): Promise<number> {
  const contracts = await listContracts("nhan_thau", projectId);
  // Mỗi c.value/addendaTotal/paid đã là tổng SQL (per-contract) từ listContracts —
  // cộng dồn NHIỀU hợp đồng ở đây làm trên bigint đơn vị nhỏ (lib/money.ts) thay vì
  // float JS, đúng quy ước tiền tệ CLAUDE.md (cấm cộng/nhân tiền trên float JS).
  const total = contracts.reduce(
    (sum, c) => sum + parseMoney(c.value) + parseMoney(c.addendaTotal) - parseMoney(c.paid),
    0n,
  );
  return moneyToNumber(total);
}

// Phải trả NCC/NTP = Σ (giá trị gốc + phụ lục − đã thanh toán) của các HĐ giao
// thầu/NCC, cộng PO chưa gắn hợp đồng (cam kết mua hàng chưa có HĐ nhưng vẫn là công
// nợ phải trả) — không tính PO đã huỷ.
export async function payables(projectId: number): Promise<number> {
  const contracts = await listContracts(undefined, projectId);
  let total = 0n;
  for (const c of contracts) {
    if (c.kind === "giao_thau" || c.kind === "ncc")
      total += parseMoney(c.value) + parseMoney(c.addendaTotal) - parseMoney(c.paid);
  }
  const poRow = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(poi.qty_ordered * COALESCE(poi.unit_price, 0)), 0) AS total
       FROM purchase_orders po
       JOIN po_items poi ON poi.po_id = po.id
      WHERE po.project_id = ? AND po.contract_id IS NULL AND po.status <> 'cancelled'`,
    projectId,
  );
  total += parseMoney(poRow?.total ?? 0);
  return moneyToNumber(total);
}

// --- Tạm ứng & hoàn ứng -------------------------------------------------------------

// Tổng tạm ứng chưa hoàn (amount − settled_amount) của các advance chưa 'settled'.
export async function advanceOutstanding(projectId: number): Promise<number> {
  const row = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount - settled_amount), 0) AS total
       FROM advances WHERE project_id = ? AND status <> 'settled'`,
    projectId,
  );
  return Number(row?.total ?? 0);
}

export const ADVANCE_STATUSES = ["open", "partially_settled", "settled"] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export type AdvanceInput = {
  code: string | null;
  advanceDate: string | null;
  amount: number;
  recipient: string | null;
  reason: string | null;
  proposalId: number | null;
};

// Validate thuần — không chạm DB.
export function validateAdvanceInput(input: AdvanceInput): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Số tiền tạm ứng phải > 0";
  if (input.advanceDate != null && !DATE_RE.test(input.advanceDate))
    return "Ngày tạm ứng không đúng định dạng YYYY-MM-DD";
  if (!input.recipient?.trim()) return "Thiếu người nhận tạm ứng";
  return null;
}

export function parseAdvanceBody(body: Record<string, unknown>): AdvanceInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: strOrNull(body.code),
    advanceDate: strOrNull(body.advanceDate),
    amount: body.amount != null ? Number(body.amount) : 0,
    recipient: strOrNull(body.recipient),
    reason: strOrNull(body.reason),
    proposalId: body.proposalId != null ? Number(body.proposalId) : null,
  };
}

// Trạng thái tạm ứng suy từ settled_amount so với amount — dùng khi settle từng phần.
export function deriveAdvanceStatus(amount: number, settledAmount: number): AdvanceStatus {
  if (settledAmount >= amount) return "settled";
  if (settledAmount > 0) return "partially_settled";
  return "open";
}

// --- Quỹ tiền mặt / thu-chi ----------------------------------------------------------

export type CashTransactionInput = {
  txDate: string;
  direction: "in" | "out";
  category: string | null;
  amount: number;
  isPettyCash: boolean;
  contractId: number | null;
  supplierId: number | null;
  voucherCode: string | null;
  description: string | null;
};

export function validateCashTransactionInput(input: CashTransactionInput): string | null {
  if (!DATE_RE.test(input.txDate)) return "Ngày giao dịch không đúng định dạng YYYY-MM-DD";
  if (input.direction !== "in" && input.direction !== "out")
    return "Chiều giao dịch phải là 'in' hoặc 'out'";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Số tiền phải > 0";
  return null;
}

export function parseCashTransactionBody(body: Record<string, unknown>): CashTransactionInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    txDate: typeof body.txDate === "string" ? body.txDate.trim() : "",
    direction: (typeof body.direction === "string" ? body.direction : "") as "in" | "out",
    category: strOrNull(body.category),
    amount: body.amount != null ? Number(body.amount) : 0,
    isPettyCash: !!body.isPettyCash,
    contractId: body.contractId != null ? Number(body.contractId) : null,
    supplierId: body.supplierId != null ? Number(body.supplierId) : null,
    voucherCode: strOrNull(body.voucherCode),
    description: strOrNull(body.description),
  };
}

// --- Hoá đơn VAT (bảng có từ PR1, API/UI ở PR2) -------------------------------------

export type InvoiceInput = {
  invoiceNo: string | null;
  invoiceDate: string | null;
  direction: "in" | "out";
  netAmount: number;
  vatAmount: number;
  vatRate: number | null;
  counterparty: string | null;
  contractId: number | null;
  paymentBillId: number | null;
};

// Validate thuần (test được không cần DB) — API tạo/sửa hoá đơn triển khai ở PR2.
export function validateInvoiceInput(input: InvoiceInput): string | null {
  if (input.direction !== "in" && input.direction !== "out")
    return "Chiều hoá đơn phải là 'in' (đầu vào) hoặc 'out' (đầu ra)";
  if (!Number.isFinite(input.netAmount) || input.netAmount < 0)
    return "Giá trị trước thuế phải ≥ 0";
  if (!Number.isFinite(input.vatAmount) || input.vatAmount < 0) return "Tiền thuế VAT phải ≥ 0";
  if (input.vatRate != null && (input.vatRate < 0 || input.vatRate > 100))
    return "Thuế suất VAT phải trong khoảng 0–100";
  if (input.invoiceDate != null && !DATE_RE.test(input.invoiceDate))
    return "Ngày hoá đơn không đúng định dạng YYYY-MM-DD";
  return null;
}

export function parseInvoiceBody(body: Record<string, unknown>): InvoiceInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    invoiceNo: strOrNull(body.invoiceNo),
    invoiceDate: strOrNull(body.invoiceDate),
    direction: (typeof body.direction === "string" ? body.direction : "") as "in" | "out",
    netAmount: body.netAmount != null ? Number(body.netAmount) : 0,
    vatAmount: body.vatAmount != null ? Number(body.vatAmount) : 0,
    vatRate: body.vatRate != null && body.vatRate !== "" ? Number(body.vatRate) : null,
    counterparty: strOrNull(body.counterparty),
    contractId: body.contractId != null ? Number(body.contractId) : null,
    paymentBillId: body.paymentBillId != null ? Number(body.paymentBillId) : null,
  };
}

export type VatSummary = { vatIn: number; vatOut: number; netVat: number };

// VAT vào (đầu vào, được khấu trừ) / ra (đầu ra, phải nộp) / ròng = vatOut − vatIn,
// gộp theo kỳ 'YYYY-MM'. projectId tuỳ chọn (undefined = toàn hệ thống, dùng nội bộ).
export async function vatSummary(period: string, projectId?: number): Promise<VatSummary> {
  const conds = ["deleted_at IS NULL", "to_char(invoice_date, 'YYYY-MM') = ?"];
  const args: unknown[] = [period];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const rows = await query<{ direction: "in" | "out"; total: number }>(
    `SELECT direction, COALESCE(SUM(vat_amount), 0) AS total
       FROM invoices WHERE ${conds.join(" AND ")}
      GROUP BY direction`,
    ...args,
  );
  let vatIn = 0;
  let vatOut = 0;
  for (const r of rows) {
    if (r.direction === "in") vatIn = Number(r.total);
    else vatOut = Number(r.total);
  }
  return { vatIn, vatOut, netVat: vatOut - vatIn };
}

// --- Lương (bảng có từ PR1, gắn attendance M24 + API ở PR3) -------------------------

export type PayrollInput = {
  period: string;
  crewId: number | null;
  personnelId: number | null;
  workdays: number;
  rate: number;
  gross: number;
  deductions: number;
  net: number;
  status: "draft" | "approved" | "paid";
};

export const PAYROLL_STATUSES = ["draft", "approved", "paid"] as const;

// Validate thuần — API tính/nhập lương từ attendance (M24) triển khai ở PR3.
export function validatePayrollInput(input: PayrollInput): string | null {
  if (!PERIOD_RE.test(input.period)) return "Kỳ lương phải đúng định dạng YYYY-MM";
  if (!Number.isFinite(input.workdays) || input.workdays < 0) return "Công phải ≥ 0";
  if (!Number.isFinite(input.rate) || input.rate < 0) return "Đơn giá công phải ≥ 0";
  if (!Number.isFinite(input.gross) || input.gross < 0) return "Lương gộp phải ≥ 0";
  if (!Number.isFinite(input.deductions) || input.deductions < 0) return "Khoản trừ phải ≥ 0";
  if (!Number.isFinite(input.net) || input.net < 0) return "Lương thực nhận phải ≥ 0";
  if (!PAYROLL_STATUSES.includes(input.status)) return "Trạng thái kỳ lương không hợp lệ";
  if (input.crewId == null && input.personnelId == null)
    return "Kỳ lương phải gắn tổ đội hoặc nhân sự cụ thể";
  return null;
}

export function parsePayrollBody(body: Record<string, unknown>): PayrollInput {
  const numOrZero = (v: unknown) => (v != null && v !== "" ? Number(v) : 0);
  const numOrNull = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
  return {
    period: typeof body.period === "string" ? body.period.trim() : "",
    crewId: numOrNull(body.crewId),
    personnelId: numOrNull(body.personnelId),
    workdays: numOrZero(body.workdays),
    rate: numOrZero(body.rate),
    gross: numOrZero(body.gross),
    deductions: numOrZero(body.deductions),
    net: numOrZero(body.net),
    status: (typeof body.status === "string" ? body.status : "draft") as PayrollInput["status"],
  };
}

export type PayrollTotals = { workdays: number; gross: number; deductions: number; net: number };

// Tổng hợp các kỳ lương đã ghi (bảng payroll) theo kỳ — dùng cho báo cáo tổng lương;
// nhập/tính từ attendance (M24) là việc của API PR3, hàm này chỉ gộp số đã có.
export async function payrollTotals(period: string, projectId?: number): Promise<PayrollTotals> {
  const conds = ["period = ?"];
  const args: unknown[] = [period];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  const row = await queryOne<PayrollTotals>(
    `SELECT COALESCE(SUM(workdays), 0) AS workdays, COALESCE(SUM(gross), 0) AS gross,
            COALESCE(SUM(deductions), 0) AS deductions, COALESCE(SUM(net), 0) AS net
       FROM payroll WHERE ${conds.join(" AND ")}`,
    ...args,
  );
  return row ?? { workdays: 0, gross: 0, deductions: 0, net: 0 };
}

export type PayrollSuggestion = { personnelId: number; personnelName: string; workdays: number };

// Gợi ý công/lương từ chấm công (M24 attendance) theo kỳ 'YYYY-MM' — chỉ gộp chấm công
// theo NGƯỜI (personnel_id NOT NULL, tái dùng attendanceSummary lib/hr.ts); chấm công
// theo tổ (headcount gộp) không tách được người cụ thể nên không đưa vào gợi ý — người
// dùng nhập tay các trường hợp này (đúng tinh thần "nhập tay nếu cần" của đặc tả).
// KHÔNG ghi vào bảng payroll — chỉ trả gợi ý để người dùng xác nhận/chỉnh trước khi lưu.
export async function payrollFromAttendance(
  period: string,
  projectId?: number,
): Promise<PayrollSuggestion[]> {
  if (!PERIOD_RE.test(period)) throw new Error("Kỳ lương phải đúng định dạng YYYY-MM");
  const [y, m] = period.split("-").map(Number);
  const from = `${period}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${period}-${String(lastDay).padStart(2, "0")}`;
  const rows = await attendanceSummary(projectId, from, to);
  return rows.map((r) => ({
    personnelId: r.personnelId,
    personnelName: r.personnelName,
    workdays: r.daysPresent,
  }));
}

// --- Thông báo tạm ứng quá hạn hoàn ứng ---------------------------------------------

// Ngưỡng "quá hạn hoàn ứng" (ngày) — đặc tả gốc không có cột due_date riêng cho advances
// (schema PR1 chỉ có advance_date), nên quyết định tự chọn: coi tạm ứng quá hạn khi
// advance_date đã qua ADVANCE_OVERDUE_DAYS ngày mà vẫn chưa 'settled'. Không thêm cột
// mới vào schema đã chốt PR1 — xem quyết định ghi trong PROGRESS.md.
export const ADVANCE_OVERDUE_DAYS = 30;

export type OverdueAdvance = {
  id: number;
  code: string | null;
  recipient: string | null;
  advanceDate: string | null;
  amount: number;
  settledAmount: number;
  projectId: number | null;
};

export async function advanceOverdueList(
  days = ADVANCE_OVERDUE_DAYS,
  projectId?: number,
): Promise<OverdueAdvance[]> {
  const limit = daysFromTodayISO(-days);
  const conds = ["status <> 'settled'", "advance_date IS NOT NULL", "advance_date <= ?"];
  const args: unknown[] = [limit];
  if (projectId != null) {
    conds.push("project_id = ?");
    args.push(projectId);
  }
  return query<OverdueAdvance>(
    `SELECT id, code, recipient, advance_date AS "advanceDate", amount,
            settled_amount AS "settledAmount", project_id AS "projectId"
       FROM advances WHERE ${conds.join(" AND ")}
      ORDER BY advance_date`,
    ...args,
  );
}
