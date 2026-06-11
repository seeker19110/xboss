import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId, todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/baselines → danh sách baseline (mọi người đăng nhập đều xem được).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const baselines = await query(
    `SELECT b.id, b.name, b.note, b.created_at AS "createdAt", u.name AS "createdBy",
            (SELECT COUNT(*) FROM baseline_tasks bt WHERE bt.baseline_id = b.id) AS "taskCount"
       FROM baselines b
       LEFT JOIN users u ON b.created_by = u.id
      ORDER BY b.id DESC`);
  return NextResponse.json({ baselines });
}

// POST /api/baselines { name?, note? } → chốt baseline: snapshot ngày BĐ/KT + %
// của toàn bộ task tại thời điểm hiện tại (Admin/PM).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được chốt baseline" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim() || `Baseline ${todayISO()}`;
  const note = String(body?.note ?? "").trim() || null;

  const taskCount = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM tasks`);
  if (!taskCount || Number(taskCount.n) === 0)
    return NextResponse.json({ error: "Chưa có task nào — import dữ liệu trước khi chốt baseline" }, { status: 422 });

  const id = await insertId(
    `INSERT INTO baselines (name, note, created_by) VALUES (?, ?, ?)`, name, note, user.id);
  await run(
    `INSERT INTO baseline_tasks (baseline_id, task_id, start_date, end_date, progress_percent)
     SELECT ?, id, start_date, end_date, progress_percent FROM tasks`, id);

  return NextResponse.json({ id, name, taskCount: Number(taskCount.n) }, { status: 201 });
}
