import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { recomputePackage } from "@/lib/recompute";

export const dynamic = "force-dynamic";

// GET /api/approvals → danh sách tầng theo hệ: chờ nghiệm thu + đã nghiệm thu.
// Mỗi nhóm (sheet_type × floor_label) là 1 dòng với số task, số đã hoàn thành, trạng thái duyệt.
export async function GET() {
  try {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const groups = await query<{
    sheetTypeId: number; sheetType: string; floorLabel: string; wpName: string | null;
    totalTasks: number; doneTasks: number;
    approvalId: number | null; isApproved: boolean;
    approvedByName: string | null; approvedAt: string | null;
    docCount: number;
  }>(`
    SELECT
      st.id AS "sheetTypeId",
      st.code AS "sheetType",
      wp.floor_label AS "floorLabel",
      MIN(wp.name) AS "wpName",
      COUNT(DISTINCT t.id)::int AS "totalTasks",
      COUNT(DISTINCT CASE WHEN t.progress_percent >= 1 THEN t.id END)::int AS "doneTasks",
      fa.id AS "approvalId",
      COALESCE(fa.is_approved, FALSE) AS "isApproved",
      fa.approved_by_name AS "approvedByName",
      fa.approved_at AS "approvedAt",
      (SELECT COUNT(*) FROM task_documents d WHERE d.floor_approval_id = fa.id)::int AS "docCount"
    FROM work_packages wp
    JOIN sheet_types st ON wp.sheet_type_id = st.id
    JOIN tasks t ON t.package_id = wp.id
    LEFT JOIN floor_approvals fa ON fa.sheet_type_id = st.id AND fa.floor_label = wp.floor_label
    WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
    GROUP BY st.id, st.code, wp.floor_label, fa.id, fa.is_approved, fa.approved_by_name, fa.approved_at
    ORDER BY st.id, wp.floor_label
  `);

  const pending = groups.filter(g => !g.isApproved);
  const approved = groups.filter(g => g.isApproved);

  return NextResponse.json({ pending, approved, canApprove: CAN.approve(user.role) });
  } catch (err) {
    console.error("[GET /api/approvals]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/approvals { sheetTypeId, floorLabel } → duyệt nghiệm thu toàn bộ tầng (Admin/PM).
// Điều kiện: tất cả task trong tầng đó phải đạt 100%.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt nghiệm thu" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const sheetTypeId = parseInt(String(body?.sheetTypeId ?? ""));
  const floorLabel = String(body?.floorLabel ?? "").trim();
  if (isNaN(sheetTypeId) || !floorLabel)
    return NextResponse.json({ error: "Thiếu sheetTypeId hoặc floorLabel" }, { status: 400 });

  let approvalId: number;
  let taskCount: number;

  try {
    const result = await withTransaction(async () => {
      // Khoá và kiểm tra lại trạng thái nghiệm thu bên trong transaction
      const existing = await queryOne<{ id: number; is_approved: boolean }>(
        `SELECT id, is_approved FROM floor_approvals WHERE sheet_type_id = ? AND floor_label = ? FOR UPDATE`,
        sheetTypeId, floorLabel);
      if (existing?.is_approved)
        throw Object.assign(new Error("Tầng này đã được nghiệm thu rồi"), { status: 409 });

      // Khoá và đọc lại tiến độ task trong transaction để tránh TOCTOU
      const tasks = await query<{ id: number; package_id: number; progress_percent: number }>(
        `SELECT t.id, t.package_id, t.progress_percent
           FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
          WHERE wp.sheet_type_id = ? AND wp.floor_label = ?
          FOR UPDATE OF t`, sheetTypeId, floorLabel);

      if (tasks.length === 0)
        throw Object.assign(new Error("Không tìm thấy task nào trong tầng này"), { status: 404 });

      const notDone = tasks.filter(t => (t.progress_percent ?? 0) < 1);
      if (notDone.length > 0)
        throw Object.assign(
          new Error(`Còn ${notDone.length} task chưa đạt 100% — không thể nghiệm thu tầng`),
          { status: 422 });

      // Tạo hoặc cập nhật floor_approval thành chính thức
      let aid: number;
      if (existing) {
        await run(
          `UPDATE floor_approvals SET is_approved = TRUE, approved_by = ?, approved_by_name = ?, approved_at = NOW()
           WHERE id = ?`, user.id, user.name, existing.id);
        aid = existing.id;
      } else {
        aid = await insertId(
          `INSERT INTO floor_approvals (sheet_type_id, floor_label, is_approved, approved_by, approved_by_name, approved_at)
           VALUES (?, ?, TRUE, ?, ?, NOW())`,
          sheetTypeId, floorLabel, user.id, user.name);
      }

      // Đặt toàn bộ task thành nghiem_thu — bulk UPDATE để tránh N+1 sequential queries.
      const taskIds = tasks.map((t) => t.id);
      await run(
        `UPDATE tasks SET status = 'nghiem_thu', updated_at = CURRENT_TIMESTAMP WHERE id = ANY(?)`,
        taskIds);

      // Bulk INSERT audit history trong 1 câu lệnh.
      const note = `Nghiệm thu tầng ${floorLabel} bởi ${user.name}`;
      const ph = tasks.map(() => "(?, ?, ?, 'nghiem_thu', ?, ?)").join(", ");
      const vals = tasks.flatMap((t) => [t.id, t.progress_percent, t.progress_percent, note, user.name]);
      await run(
        `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by) VALUES ${ph}`,
        ...vals);

      return { aid, tasks };
    });

    approvalId = result.aid;
    taskCount = result.tasks.length;

    // recomputePackage chạy ngoài transaction, song song để giảm latency.
    const packageIds = new Set(result.tasks.map(t => t.package_id));
    await Promise.all([...packageIds].map((pid) => recomputePackage(pid)));

  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    const status = e.status ?? 500;
    return NextResponse.json({ error: e.message ?? String(err) }, { status });
  }

  return NextResponse.json({ approvalId, taskCount });
}
