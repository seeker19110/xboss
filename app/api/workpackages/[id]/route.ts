import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";
import { unlink } from "fs/promises";
import { join } from "path";

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

// DELETE /api/workpackages/:id — xoá nhóm cùng toàn bộ tasks và dữ liệu liên quan. Admin/PM.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chỉ Admin/PM mới xoá được nhóm" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const pkg = await queryOne<{ id: number }>(`SELECT id FROM work_packages WHERE id = ?`, id);
  if (!pkg) return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404 });

  const tasks = await query<{ id: number }>(`SELECT id FROM tasks WHERE package_id = ?`, id);
  if (tasks.length > 0) {
    const taskIds = tasks.map(t => t.id);
    const uploadDir = join(process.cwd(), "data", "uploads");
    const photos = await query<{ file_name: string }>(
      `SELECT file_name FROM task_photos WHERE task_id = ANY(ARRAY[${taskIds.join(",")}]::int[])`);
    const docs = await query<{ file_name: string }>(
      `SELECT file_name FROM task_documents WHERE task_id = ANY(ARRAY[${taskIds.join(",")}]::int[])`);
    for (const f of [...photos, ...docs]) {
      await unlink(join(uploadDir, f.file_name)).catch(() => {});
    }
    const inList = taskIds.join(",");
    await run(`DELETE FROM notifications WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM baseline_tasks WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM task_photos WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM task_documents WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM task_comments WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM task_history WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM materials WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM progress_dimensions WHERE task_id = ANY(ARRAY[${inList}]::int[])`);
    await run(`DELETE FROM tasks WHERE package_id = ?`, id);
  }

  await run(`DELETE FROM work_packages WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
