import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, insertId } from "@/lib/db";

export const dynamic = "force-dynamic";

export type BillType = "bill" | "advance" | "item";

type Bill = {
  id: number; responsible: string; type: BillType; period: string | null;
  amount: number; description: string | null; paidDate: string;
  progressSnapshot: number; note: string | null;
  createdBy: number | null; createdByName: string | null; createdAt: string;
};

// GET /api/payments/bills — toàn bộ dòng (bill / tạm ứng / phát sinh).
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const bills = await query<Bill>(`
    SELECT pb.id, pb.responsible, pb.type, pb.period,
           pb.amount, pb.description,
           pb.paid_date AS "paidDate",
           pb.progress_snapshot AS "progressSnapshot",
           pb.note, pb.created_by AS "createdBy",
           u.name AS "createdByName", pb.created_at AS "createdAt"
      FROM payment_bills pb
      LEFT JOIN users u ON u.id = pb.created_by
     ORDER BY pb.paid_date ASC, pb.id ASC`);

  return NextResponse.json({ bills });
}

// POST /api/payments/bills
// Body: { responsible, type, amount, paidDate, period?, description?, progressSnapshot?, note? }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo mục thanh toán" }, { status: 403 });

  const b = await req.json().catch(() => null);
  const responsible = (b?.responsible ?? "").trim();
  const type: BillType = ["bill", "advance", "item"].includes(b?.type) ? b.type : "bill";
  const amount = Number(b?.amount);
  const paidDate = (b?.paidDate ?? "").trim();

  if (!responsible) return NextResponse.json({ error: "Thiếu người phụ trách" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate))
    return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 400 });

  const period = (b?.period ?? "").trim() || null;
  const description = (b?.description ?? "").trim() || null;
  const note = (b?.note ?? "").trim() || null;
  let progress = Number(b?.progressSnapshot);
  if (!Number.isFinite(progress) || progress < 0) progress = 0;
  if (progress > 1) progress = 1;

  const id = await insertId(`
    INSERT INTO payment_bills
           (responsible, type, period, amount, description, paid_date, progress_snapshot, note, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    responsible, type, period, amount, description, paidDate, progress, note, user.id);

  return NextResponse.json({ ok: true, id });
}
