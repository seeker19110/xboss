import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

// PATCH /api/workpackages/:id  → sửa nhóm công việc (tên, code, BOQ, tầng, ngày). Admin/PM.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!CAN.editStructure((await getCurrentUser())?.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // BOQCODE: duy nhất toàn cục (cả nhóm lẫn task); chuỗi rỗng = xoá mã.
  if (body.boqCode !== undefined) {
    const boq = String(body.boqCode ?? "").trim();
    body.boqCode = boq || null;
    if (boq) {
      const usedBy = await boqTakenBy(boq, { table: "work_packages", id });
      if (usedBy) return NextResponse.json({ error: `Mã BOQ "${boq}" đã được dùng bởi ${usedBy}` }, { status: 409 });
    }
  }

  const fields: Record<string, string> = {
    name: "name", code: "code", floorLabel: "floor_label",
    startDate: "start_date", endDate: "end_date",
    boqCode: "boq_code", drawingUrl: "drawing_url",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); vals.push(body[key]); }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  await run(`UPDATE work_packages SET ${sets.join(", ")} WHERE id = ?`, ...vals);
  const wp = await queryOne(`SELECT id, code, name, floor_label AS "floorLabel", boq_code AS "boqCode", drawing_url AS "drawingUrl" FROM work_packages WHERE id = ?`, id);
  return NextResponse.json({ workPackage: wp });
}
