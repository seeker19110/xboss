import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// GET /api/approvals → danh sách task chờ nghiệm thu (đạt 100%, chưa duyệt)
// + task đã nghiệm thu gần đây, kèm số biên bản đính kèm.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const select = `SELECT t.id, t.boq_code AS "boqCode", t.code, t.name, t.status,
            t.end_date AS "endDate", t.progress_percent AS "progressPercent",
            wp.floor_label AS "floorLabel", wp.name AS "wpName", st.code AS "sheetType",
            u.name AS assignee,
            (SELECT COUNT(*) FROM task_documents d WHERE d.task_id = t.id) AS "docCount"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN users u ON t.assigned_to = u.id`;

  const pending = await query(
    `${select} WHERE t.progress_percent >= 1 AND t.status != 'nghiem_thu'
      ORDER BY st.id, wp.id, t.id`);

  const approved = await query(
    `${select} WHERE t.status = 'nghiem_thu'
      ORDER BY t.updated_at DESC LIMIT 100`);

  return NextResponse.json({ pending, approved, canApprove: CAN.approve(user.role) });
}

// POST /api/approvals { taskIds: number[] } → duyệt nghiệm thu hàng loạt (Admin/PM).
// Mỗi task áp dụng đúng quy tắc của /api/tasks/:id/approve: phải đạt 100%, ghi audit.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt nghiệm thu" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const taskIds: number[] = Array.isArray(body?.taskIds)
    ? body.taskIds.map((v: unknown) => parseInt(String(v))).filter((n: number) => !isNaN(n))
    : [];
  if (taskIds.length === 0)
    return NextResponse.json({ error: "Thiếu taskIds" }, { status: 400 });
  if (taskIds.length > 200)
    return NextResponse.json({ error: "Tối đa 200 task mỗi lần" }, { status: 422 });

  const approved: number[] = [];
  const skipped: { id: number; reason: string }[] = [];
  const packageIds = new Set<number>();

  for (const id of taskIds) {
    const task = await queryOne<{ id: number; package_id: number; status: string; progress_percent: number }>(
      `SELECT id, package_id, status, progress_percent FROM tasks WHERE id = ?`, id);
    if (!task) { skipped.push({ id, reason: "Không tìm thấy" }); continue; }
    if (task.status === "nghiem_thu") { skipped.push({ id, reason: "Đã nghiệm thu rồi" }); continue; }
    if ((task.progress_percent ?? 0) < 1) { skipped.push({ id, reason: "Chưa đạt 100%" }); continue; }

    await run(`UPDATE tasks SET status = 'nghiem_thu', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id);
    await run(`INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
         VALUES (?, ?, ?, 'nghiem_thu', ?, ?)`,
      id, task.progress_percent, task.progress_percent, `Nghiệm thu (duyệt lô) bởi ${user.name}`, user.name);
    approved.push(id);
    packageIds.add(task.package_id);
  }

  for (const pid of packageIds) await recomputePackage(pid);

  return NextResponse.json({ approved, skipped });
}
