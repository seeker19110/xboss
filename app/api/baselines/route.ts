import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId, todayISO, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// GET /api/baselines → danh sách baseline của dự án đang chọn (mọi người đăng nhập đều xem được).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Dự án luôn suy từ phiên (cookie xboss_project), KHÔNG bao giờ nhận từ client.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const baselines = await query(
    `SELECT b.id, b.name, b.note, b.created_at AS "createdAt", u.name AS "createdBy",
            (SELECT COUNT(*) FROM baseline_tasks bt WHERE bt.baseline_id = b.id) AS "taskCount"
       FROM baselines b
       LEFT JOIN users u ON b.created_by = u.id
      WHERE b.project_id = ?
      ORDER BY b.id DESC`,
    projectId,
  );
  return NextResponse.json({ baselines });
}

// POST /api/baselines { name?, note? } → chốt baseline: snapshot ngày BĐ/KT + %
// của toàn bộ task của dự án đang chọn tại thời điểm hiện tại (Admin/PM).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được chốt baseline" }, { status: 403 });

  // Dự án luôn suy từ phiên (cookie xboss_project), KHÔNG bao giờ nhận từ client.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim() || `Baseline ${todayISO()}`;
  const note = String(body?.note ?? "").trim() || null;

  const taskCount = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = ?`,
    projectId,
  );
  if (!taskCount || Number(taskCount.n) === 0)
    return NextResponse.json(
      { error: "Chưa có task nào — import dữ liệu trước khi chốt baseline" },
      { status: 422 },
    );

  const id = await withTransaction(async () => {
    const baselineId = await insertId(
      `INSERT INTO baselines (name, note, created_by, project_id) VALUES (?, ?, ?, ?)`,
      name,
      note,
      user.id,
      projectId,
    );
    await run(
      `INSERT INTO baseline_tasks (baseline_id, task_id, start_date, end_date, progress_percent)
       SELECT ?, t.id, t.start_date, t.end_date, t.progress_percent
         FROM tasks t
         JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?`,
      baselineId,
      projectId,
    );
    return baselineId;
  });

  return NextResponse.json({ id, name, taskCount: Number(taskCount.n) }, { status: 201 });
}
