import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { boqTakenBy } from "@/lib/boq";
import { validateCustom } from "@/lib/custom-fields";
import { recomputePackage, recomputeTasksInheritingDates } from "@/lib/recompute";
import { unlink } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// PATCH /api/workpackages/:id  → sửa nhóm công việc (tên, code, BOQ, tầng, ngày). Admin/PM.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // drawingUrl / bbntUrl: chỉ chấp nhận http/https hoặc null (chặn javascript: XSS).
  for (const field of ["drawingUrl", "bbntUrl"] as const) {
    if (body[field] !== undefined && body[field] !== null) {
      const url = String(body[field]).trim();
      if (url && !/^https?:\/\//i.test(url))
        return NextResponse.json(
          {
            error: `Link ${field === "drawingUrl" ? "bản vẽ" : "biên bản"} phải bắt đầu bằng http:// hoặc https://`,
          },
          { status: 422 },
        );
      body[field] = url || null;
    }
  }

  // Ngày phải đúng dạng YYYY-MM-DD (hoặc null = xoá) — chuỗi sai để Postgres từ chối sẽ thành lỗi 500.
  for (const k of ["startDate", "endDate"] as const) {
    if (body[k] !== undefined && body[k] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body[k])))
      return NextResponse.json({ error: "Ngày phải có dạng YYYY-MM-DD" }, { status: 422 });
  }

  // BOQCODE: duy nhất toàn cục (cả nhóm lẫn task); chuỗi rỗng = xoá mã.
  if (body.boqCode !== undefined) {
    const boq = String(body.boqCode ?? "").trim();
    body.boqCode = boq || null;
    if (boq) {
      // TODO(M54 PR2): lấy orgId thật từ session
      const usedBy = await boqTakenBy(boq, 1, { table: "work_packages", id });
      if (usedBy)
        return NextResponse.json(
          { error: `Mã BOQ "${boq}" đã được dùng bởi ${usedBy}` },
          { status: 409 },
        );
    }
  }

  const fields: Record<string, string> = {
    name: "name",
    code: "code",
    floorLabel: "floor_label",
    startDate: "start_date",
    endDate: "end_date",
    boqCode: "boq_code",
    drawingUrl: "drawing_url",
    bbntUrl: "bbnt_url",
    requiresMethodStatement: "requires_method_statement",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(key === "requiresMethodStatement" ? !!body[key] : body[key]);
    }
  }
  // Trường tuỳ biến (M52 PR2): merge shallow vào cột custom — không đè field khác.
  if (body.custom !== undefined) {
    const projectId = await getCurrentProjectId(user);
    const v = await validateCustom("work_package", projectId, body.custom);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
    sets.push(`custom = custom || ?::jsonb`);
    vals.push(JSON.stringify(v.value));
  }
  if (!sets.length)
    return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  await withTransaction(async () => {
    await run(`UPDATE work_packages SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    // Đổi deadline có thể đổi trạng thái trễ (tre ⇄ dang_thi_cong) của nhóm → tính lại.
    if (body.endDate !== undefined || body.startDate !== undefined) {
      await recomputePackage(id);
      // Task con có end_date NULL (đang kế thừa ngày nhóm) phải tính lại trạng thái trễ
      // theo ngày MỚI của nhóm — không tự động qua recomputePackage (xem lib/recompute.ts).
      await recomputeTasksInheritingDates(id);
    }
  });
  // Bump updated_at của tất cả task trong nhóm → sheetVersion đổi → client refresh.
  await run(`UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE package_id = ?`, id);
  const wp = await queryOne(
    `SELECT id, code, name, floor_label AS "floorLabel", boq_code AS "boqCode",
            drawing_url AS "drawingUrl", requires_method_statement AS "requiresMethodStatement"
       FROM work_packages WHERE id = ?`,
    id,
  );
  return NextResponse.json({ workPackage: wp });
}

// DELETE /api/workpackages/:id — xoá nhóm cùng toàn bộ tasks và dữ liệu liên quan. Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới xoá được nhóm" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const pkg = await queryOne<{ id: number }>(`SELECT id FROM work_packages WHERE id = ?`, id);
  if (!pkg) return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404 });

  const tasks = await query<{ id: number }>(`SELECT id FROM tasks WHERE package_id = ?`, id);
  if (tasks.length > 0) {
    const taskIds = tasks.map((t) => t.id);
    const uploadDir = join(process.cwd(), "data", "uploads");
    const photos = await query<{ file_name: string }>(
      `SELECT file_name FROM task_photos WHERE task_id = ANY(?)`,
      taskIds,
    );
    const docs = await query<{ file_name: string }>(
      `SELECT file_name FROM task_documents WHERE task_id = ANY(?)`,
      taskIds,
    );
    for (const f of [...photos, ...docs]) {
      await unlink(join(uploadDir, f.file_name)).catch(() => {});
    }
    await run(`DELETE FROM notifications WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM baseline_tasks WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM task_photos WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM task_documents WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM task_comments WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM task_history WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM materials WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM progress_dimensions WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM tasks WHERE package_id = ?`, id);
  }

  await run(`DELETE FROM work_packages WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
