import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export type MyTask = {
  id: number; code: string; name: string; status: string;
  startDate: string | null; endDate: string | null; progressPercent: number;
  photoCount: number; packageCode: string; packageName: string;
  floorLabel: string | null; sheetType: string;
};

// GET /api/my-tasks → task được giao cho user hiện tại, sắp theo deadline gần nhất.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const tasks = await query<MyTask>(
    `SELECT t.id, t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent",
            (SELECT COUNT(*) FROM task_photos p WHERE p.task_id = t.id) AS "photoCount",
            wp.code AS "packageCode", wp.name AS "packageName",
            wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.assigned_to = ?
      ORDER BY (t.end_date IS NULL), t.end_date, t.id`, user.id);

  const today = todayISO();
  const delayed = tasks.filter(
    (t) => t.endDate && t.endDate < today && t.progressPercent < 1
      && t.status !== "hoan_thanh" && t.status !== "nghiem_thu").length;
  const done = tasks.filter((t) => t.progressPercent >= 1).length;

  return NextResponse.json({ tasks, summary: { total: tasks.length, delayed, done } });
}
