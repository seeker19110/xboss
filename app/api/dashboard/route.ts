import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = todayISO();

  // Task trễ: end_date < hôm nay AND progress < 1 AND chưa hoàn thành/nghiệm thu
  const delayedTasks = await query(
    `SELECT t.id, t.code, t.name, t.status,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.progress_percent AS "progressPercent",
            wp.floor_label AS "floorLabel", wp.code AS "packageCode",
            st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ?
        AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      ORDER BY t.end_date`,
    today,
  );

  // KPI theo từng sheet
  const kpi = await query(
    `SELECT st.code AS "sheetType",
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code
      ORDER BY st.id`,
    today,
  );

  return NextResponse.json({ delayedTasks, kpi, totalDelayed: delayedTasks.length });
}
