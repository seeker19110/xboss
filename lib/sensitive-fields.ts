// lib/sensitive-fields.ts — M50 PR2: quyền theo trường (field-level).
//
// Che (thay bằng null) các trường mang GIÁ TRỊ TIỀN / ĐƠN GIÁ / TỶ LỆ nhạy cảm trong
// JSON response của các route GET tài chính, cho user thiếu quyền xem tương ứng. Áp tại
// API (ranh giới bảo mật duy nhất) TRƯỚC MỌI res.json — UI chỉ hiển thị "•••" khi thấy
// null (component MaskedValue).
//
// Trường ở đây là TÊN TRƯỜNG TRONG JSON RESPONSE (camelCase), KHÔNG phải tên cột DB.
// variation_orders/payment_certs không có cột tiền trực tiếp — giá trị do SQL tính
// (Σ qty×đơn giá) trả trong response. Dạng "a.b" = đi vào mảng/đối tượng con `a` rồi che
// trường `b` của từng phần tử.
//
// ===== DANH SÁCH TRƯỜNG NHẠY CẢM + PERM + ROUTE ÁP DỤNG (reviewer đối chiếu) =====
//
// [variation] — perm: viewPayments — route: GET /api/variations, GET /api/variations/[id]
//   proposedValue      Σ qty_contract×unit_price (tổng đề xuất, SQL tính)
//   approvedValue      Σ qty_approved×unit_price (tổng được duyệt, SQL tính)
//   lines.unitPrice    đơn giá từng dòng KL con (boq_items.unit_price)
//   → Gate route là viewVariations (gồm engineer); perm che là viewPayments (loại
//     engineer) → engineer XEM được VO nhưng KHÔNG thấy giá trị/đơn giá. (Ca có hiệu lực.)
//
// [contract] — perm: viewPayments — route: GET /api/contracts, GET /api/contracts/[id]
//   value              giá trị hợp đồng (contracts.value)
//   advancePct         % tạm ứng (tỷ lệ nhạy cảm)
//   retentionPct       % giữ lại bảo hành (tỷ lệ nhạy cảm)
//   addendaTotal       Σ phụ lục (SQL tính)
//   paid               đã thanh toán (SQL tính)
//   poCommitted        giá trị PO gắn HĐ (SQL tính)
//   → Gate route ĐÃ là viewPayments == perm che → phòng thủ/nhất quán (không đổi ai
//     hiện tại; giữ đúng khi gate được nới về sau).
//
// [contractAddendum] — perm: viewPayments — route: GET /api/contracts/[id] (mảng addenda)
//   valueDelta         chênh lệch giá trị phụ lục
//
// [paymentBill] — perm: viewPayments — route: GET /api/contracts/[id] (mảng bills)
//   amount             số tiền dòng thanh toán đã gắn HĐ
//
// [floorContract] — perm: viewPayments — route: GET /api/contracts/[id] (mảng floorContracts)
//   contractValue      giá trị giao thầu theo tầng
//
// [paymentCert] — perm: viewPayments — route: GET /api/payment-certs, GET /api/payment-certs/[id]
//   items.unitPrice    đơn giá từng dòng KL (payment_cert_items.unit_price)
//   (Tổng tiền đợt nằm ở object `totals` riêng — che qua entity certTotals.)
//
// [certTotals] — perm: viewPayments — route: GET /api/payment-certs/[id] (object totals)
//   periodValue        giá trị đợt này
//   cumulativeValue    giá trị luỹ kế
//   advanceDeduct      trừ tạm ứng
//   retentionDeduct    trừ giữ lại bảo hành
//   approvedValue      giá trị đề nghị thanh toán
//   → Route xuất Excel /api/payment-certs/[id]/excel không che từng ô mà TRẢ 403 khi
//     thiếu viewPayments (gate sẵn có = viewPayments) — che ô trong file là vô nghĩa.
//
// [payroll] — perm: viewPayroll — route: GET /api/payroll (mảng payroll)
//   rate               đơn giá công
//   gross              lương gộp
//   deductions         khấu trừ
//   net                lương thực nhận
//   → Gate route là viewPayments (gồm bch); perm che là viewPayroll (loại bch) → bch XEM
//     được trang lương nhưng KHÔNG thấy số tiền lương. (Ca có hiệu lực.)
//   → suggestions (payrollFromAttendance) chỉ có personnelId/name + workdays, KHÔNG tiền
//     → không cần che.
import { CAN, type PermKey, type Role } from "@/lib/auth";

export type SensitiveRule = { fields: string[]; perm: PermKey };

export const SENSITIVE: Record<string, SensitiveRule[]> = {
  variation: [
    { fields: ["proposedValue", "approvedValue", "lines.unitPrice"], perm: "viewPayments" },
  ],
  contract: [
    {
      fields: ["value", "advancePct", "retentionPct", "addendaTotal", "paid", "poCommitted"],
      perm: "viewPayments",
    },
  ],
  contractAddendum: [{ fields: ["valueDelta"], perm: "viewPayments" }],
  paymentBill: [{ fields: ["amount"], perm: "viewPayments" }],
  floorContract: [{ fields: ["contractValue"], perm: "viewPayments" }],
  paymentCert: [{ fields: ["items.unitPrice"], perm: "viewPayments" }],
  certTotals: [
    {
      fields: [
        "periodValue",
        "cumulativeValue",
        "advanceDeduct",
        "retentionDeduct",
        "approvedValue",
      ],
      perm: "viewPayments",
    },
  ],
  payroll: [{ fields: ["rate", "gross", "deductions", "net"], perm: "viewPayroll" }],
};

// Che 1 bản ghi: trả BẢN SAO với các trường liệt kê được đặt null (không đụng bản gốc,
// không đụng trường khác). Hỗ trợ 1 cấp lồng qua "a.b": nếu `a` là mảng → che `b` từng
// phần tử; nếu `a` là object → che `b` của object đó.
function maskOne<T>(row: T, fields: string[]): T {
  if (row == null || typeof row !== "object") return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of fields) {
    const dot = field.indexOf(".");
    if (dot === -1) {
      if (field in out) out[field] = null;
      continue;
    }
    const head = field.slice(0, dot);
    const tail = field.slice(dot + 1);
    const child = out[head];
    if (Array.isArray(child)) {
      out[head] = child.map((el) => maskOne(el, [tail]));
    } else if (child && typeof child === "object") {
      out[head] = maskOne(child, [tail]);
    }
  }
  return out as T;
}

// Che các trường nhạy cảm của `entity` cho `user` thiếu quyền. Hàm THUẦN (không chạm DB;
// kiểm quyền qua CAN của PR1 — đọc cache đồng bộ). User đủ quyền/entity không khai báo →
// trả nguyên mảng gốc (không sao chép). Mảng rỗng → trả nguyên.
export function stripSensitive<T>(
  entity: string,
  rows: T[],
  user: { role?: Role } | null | undefined,
): T[] {
  const rules = SENSITIVE[entity];
  if (!rules || rows.length === 0) return rows;
  const role = user?.role;
  const toMask = rules.filter((rule) => !CAN[rule.perm](role)).flatMap((rule) => rule.fields);
  if (toMask.length === 0) return rows;
  return rows.map((row) => maskOne(row, toMask));
}
