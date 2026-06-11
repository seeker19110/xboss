import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/dashboard/floors → ma trận tầng × sheet: % trung bình + số task trễ.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();
  const subconFilter = user.role === "subcon" ? `AND t.assigned_to = ${user.id}` : "";

  const cells = await query<{ sheetType: string; floor: string; progress: number; tasks: number; delayed: number }>(
    `SELECT st.code AS "sheetType", wp.floor_label AS floor,
            COALESCE(AVG(t.progress_percent), 0) AS progress,
            COUNT(t.id) AS tasks,
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE wp.floor_label IS NOT NULL ${subconFilter}
      GROUP BY st.code, st.id, wp.floor_label
      ORDER BY st.id`, today);

  // Danh sách tầng: sort theo số tầng giảm dần (tầng cao trên cùng — giống toà nhà).
  const floors = [...new Set(cells.map((c) => c.floor))]
    .sort((a, b) => parseInt(b) - parseInt(a));
  const sheets = [...new Set(cells.map((c) => c.sheetType))];

  return NextResponse.json({ floors, sheets, cells });
}
