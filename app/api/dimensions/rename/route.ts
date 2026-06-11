import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/dimensions/rename  body: { packageId, oldLabel, newLabel }
// Đổi tên cột (trục/căn hộ) cho TOÀN sheet chứa work package đó.
export async function POST(req: NextRequest) {
  if (!CAN.editStructure((await getCurrentUser())?.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const { packageId, oldLabel, newLabel } = await req.json().catch(() => ({}));
  if (!packageId || !oldLabel || !newLabel)
    return NextResponse.json({ error: "Thiếu tham số" }, { status: 400 });

  const sheet = await queryOne<{ sheet_type_id: number }>(
    `SELECT sheet_type_id FROM work_packages WHERE id = ?`, packageId);
  if (!sheet) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });

  const r = await run(
    `UPDATE progress_dimensions SET dimension_label = ?
       WHERE dimension_label = ?
         AND task_id IN (
           SELECT t.id FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
          WHERE wp.sheet_type_id = ?)`,
    String(newLabel).trim(), oldLabel, sheet.sheet_type_id);

  return NextResponse.json({ updated: Number(r.changes), oldLabel, newLabel });
}
