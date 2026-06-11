import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14; // cửa sổ tính tốc độ

// GET /api/dashboard/forecast → dự báo ngày hoàn thành từng hệ,
// ngoại suy từ tốc độ cập nhật tiến độ thực tế (task_history) trong 14 ngày gần nhất.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const rows = await query<{
    sheetType: string; totalTasks: number; avgProgress: number;
    deadline: string | null; gained: number | null;
  }>(
    `SELECT st.code AS "sheetType",
            COUNT(DISTINCT t.id) AS "totalTasks",
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            MAX(wp.end_date)::text AS deadline,
            (SELECT SUM(h.new_progress - h.old_progress)
               FROM task_history h
               JOIN tasks t2 ON h.task_id = t2.id
               JOIN work_packages wp2 ON t2.package_id = wp2.id
              WHERE wp2.sheet_type_id = st.id
                AND h.changed_at > NOW() - INTERVAL '${WINDOW_DAYS} days') AS gained
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code ORDER BY st.id`);

  const today = todayISO();
  const forecast = rows.map((r) => {
    const remaining = Math.max(1 - r.avgProgress, 0);
    // Tốc độ: tổng điểm % task tăng / số task / số ngày → % của cả hệ mỗi ngày.
    const ratePerDay = r.gained && r.totalTasks > 0 ? r.gained / r.totalTasks / WINDOW_DAYS : 0;
    let eta: string | null = null;
    let daysLeft: number | null = null;
    if (remaining <= 0.0001) { eta = today; daysLeft = 0; }
    else if (ratePerDay > 0) {
      daysLeft = Math.ceil(remaining / ratePerDay);
      if (daysLeft < 3650) eta = new Date(Date.now() + daysLeft * 86400_000).toISOString().slice(0, 10);
      else { eta = null; daysLeft = null; } // tốc độ quá chậm → coi như chưa dự báo được
    }
    // Lệch so deadline: dương = dự kiến trễ.
    let lateDays: number | null = null;
    if (eta && r.deadline) lateDays = Math.round((Date.parse(eta) - Date.parse(r.deadline)) / 86400_000);
    return {
      sheetType: r.sheetType,
      progress: r.avgProgress,
      ratePerWeek: ratePerDay * 7, // % của hệ / tuần
      deadline: r.deadline,
      eta, daysLeft, lateDays,
    };
  });

  return NextResponse.json({ forecast, windowDays: WINDOW_DAYS });
}
