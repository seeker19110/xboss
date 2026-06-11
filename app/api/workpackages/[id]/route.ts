import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/workpackages/:id  → sửa nhóm công việc (tên, code, tầng, ngày). Admin/PM.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!CAN.editStructure((await getCurrentUser())?.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const fields: Record<string, string> = {
    name: "name", code: "code", floorLabel: "floor_label",
    startDate: "start_date", endDate: "end_date",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(body[key]); }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  await run(`UPDATE work_packages SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  const wp = await queryOne(`SELECT id, code, name, floor_label AS "floorLabel" FROM work_packages WHERE id = ?`, id);
  return NextResponse.json({ workPackage: wp });
}
