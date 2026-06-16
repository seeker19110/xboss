import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, run } from "@/lib/db";

export const dynamic = "force-dynamic";

type PaymentRow = {
  id: number; boqCode: string | null; code: string; name: string;
  sheetType: string; sheetSlug: string | null; floorLabel: string | null;
  progressPercent: number; unitPrice: number;
  assigneeId: number | null; assigneeName: string | null;
};

// GET /api/payments — danh sách task kèm đơn giá và giá trị hoàn thành, nhóm theo sheet.
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const rows = await query<PaymentRow>(`
    SELECT t.id, t.boq_code AS "boqCode", t.code, t.name,
           st.code AS "sheetType", st.slug AS "sheetSlug",
           wp.floor_label AS "floorLabel",
           t.progress_percent AS "progressPercent",
           COALESCE(t.unit_price, 0) AS "unitPrice",
           t.assigned_to AS "assigneeId", u.name AS "assigneeName"
      FROM tasks t
      JOIN work_packages wp ON t.package_id = wp.id
      JOIN sheet_types st ON wp.sheet_type_id = st.id
      LEFT JOIN users u ON t.assigned_to = u.id
     ORDER BY st.id, wp.sort_order, t.sort_order`);

  const totalContract = rows.reduce((s, r) => s + r.unitPrice, 0);
  const totalEarned   = rows.reduce((s, r) => s + r.unitPrice * r.progressPercent, 0);

  return NextResponse.json({ rows, totalContract, totalEarned });
}

// PATCH /api/payments — cập nhật đơn giá 1 hoặc nhiều task.
// Body: { updates: [{ id, unitPrice }] }
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa đơn giá" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const updates: { id: number; unitPrice: number }[] = body?.updates ?? [];
  if (!updates.length) return NextResponse.json({ ok: true });

  for (const u of updates) {
    if (!Number.isFinite(u.unitPrice) || u.unitPrice < 0) continue;
    await run(`UPDATE tasks SET unit_price = ? WHERE id = ?`, u.unitPrice, u.id);
  }
  return NextResponse.json({ ok: true, updated: updates.length });
}
