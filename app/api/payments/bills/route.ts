import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, queryOne, insertId } from "@/lib/db";

export const dynamic = "force-dynamic";

export type BillType = "bill" | "advance" | "item";

type Bill = {
  id: number; responsible: string; type: BillType; period: string | null;
  amount: number; description: string | null; paidDate: string;
  progressSnapshot: number; note: string | null;
  unit: string | null; quantity: number | null; labor: number | null;
  sheetTypeId: number | null; floorLabel: string | null; pctThisPeriod: number;
  createdBy: number | null; createdByName: string | null; createdAt: string;
};

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const bills = await query<Bill>(`
    SELECT pb.id, pb.responsible, pb.type, pb.period,
           pb.amount, pb.description,
           pb.paid_date        AS "paidDate",
           pb.progress_snapshot AS "progressSnapshot",
           pb.note, pb.unit, pb.quantity, pb.labor,
           pb.sheet_type_id   AS "sheetTypeId",
           pb.floor_label     AS "floorLabel",
           st.code            AS "sheetCode",
           COALESCE(pb.pct_this_period, 0) AS "pctThisPeriod",
           pb.created_by      AS "createdBy",
           u.name             AS "createdByName",
           pb.created_at      AS "createdAt"
      FROM payment_bills pb
      LEFT JOIN users u ON u.id = pb.created_by
      LEFT JOIN sheet_types st ON st.id = pb.sheet_type_id
     ORDER BY pb.paid_date ASC, pb.id ASC`);

  return NextResponse.json({ bills });
}

// POST /api/payments/bills
// Body: { responsible, type, amount, paidDate, period?, description?, note?,
//         sheetTypeId?, floorLabel?, pctThisPeriod?, progressSnapshot? }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo mục thanh toán" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const responsible = (b?.responsible ?? "").trim();
  const type: BillType = ["bill", "advance", "item"].includes(b?.type) ? b.type : "bill";
  const paidDate = (b?.paidDate ?? "").trim();

  if (!responsible) return NextResponse.json({ error: "Thiếu người phụ trách" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 400 });

  const period       = (b?.period ?? "").trim() || null;
  const description  = (b?.description ?? "").trim() || null;
  const note         = (b?.note ?? "").trim() || null;
  const sheetTypeId  = b?.sheetTypeId ? Number(b.sheetTypeId) : null;
  const floorLabel   = b?.floorLabel ? String(b.floorLabel).trim() : null;
  let pctThisPeriod  = Number(b?.pctThisPeriod ?? 0);
  if (!Number.isFinite(pctThisPeriod) || pctThisPeriod < 0) pctThisPeriod = 0;
  if (pctThisPeriod > 1) pctThisPeriod = 1;
  let progress = Number(b?.progressSnapshot ?? 0);
  if (!Number.isFinite(progress) || progress < 0) progress = 0;
  if (progress > 1) progress = 1;

  const unit = (b?.unit ?? "").trim() || (type === "bill" ? "LS" : type === "item" ? "Lô" : null);
  let quantity = b?.quantity != null && b.quantity !== "" ? Number(b.quantity) : null;
  if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) quantity = null;
  let labor = b?.labor != null && b.labor !== "" ? Number(b.labor) : null;
  if (labor != null && (!Number.isFinite(labor) || labor < 0)) labor = null;

  // Tính amount: nếu type=bill + có floor → amount = contractValue × pct
  let amount = Number(b?.amount);
  if (type === "bill" && sheetTypeId && floorLabel && pctThisPeriod > 0) {
    // Kiểm tra tổng % đã thanh toán (không vượt 100%)
    const sumRow = await queryOne<{ total: number }>(`
      SELECT COALESCE(SUM(pct_this_period), 0) AS total
        FROM payment_bills
       WHERE type = 'bill' AND sheet_type_id = ? AND floor_label = ?`,
      sheetTypeId, floorLabel);
    const pctPaid = sumRow?.total ?? 0;
    if (pctPaid + pctThisPeriod > 1.0001)
      return NextResponse.json({ error: `Tầng ${floorLabel} đã thanh toán ${Math.round(pctPaid * 100)}%, không thể thêm ${Math.round(pctThisPeriod * 100)}% (vượt 100%)` }, { status: 400 });

    // Lấy contract_value
    const fc = await queryOne<{ contractValue: number }>(`
      SELECT COALESCE(contract_value, 0) AS "contractValue"
        FROM floor_contracts WHERE sheet_type_id = ? AND floor_label = ?`,
      sheetTypeId, floorLabel);
    amount = (fc?.contractValue ?? 0) * pctThisPeriod;
  }

  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });

  const id = await insertId(`
    INSERT INTO payment_bills
           (responsible, type, period, amount, description, paid_date,
            progress_snapshot, note, unit, quantity, labor,
            sheet_type_id, floor_label, pct_this_period, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    responsible, type, period, amount, description, paidDate,
    progress, note, unit, quantity, labor,
    sheetTypeId, floorLabel, pctThisPeriod, user.id);

  return NextResponse.json({ ok: true, id, amount });
}
