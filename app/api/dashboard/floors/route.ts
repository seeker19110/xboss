import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/dashboard/floors → ma trận tầng × sheet: % trung bình + số task trễ,
// nhóm theo tháp (nhiều tháp → frontend chia bảng cạnh nhau).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();
  const subconFilter = user.role === "subcon" ? " AND t.assigned_to = ?" : "";

  const cells = await query<{ tower: string | null; sheetType: string; sheetSlug: string | null; floor: string; progress: number; tasks: number; delayed: number }>(
    `SELECT tw.name AS tower, st.code AS "sheetType", st.slug AS "sheetSlug", wp.floor_label AS floor,
            COALESCE(AVG(t.progress_percent), 0) AS progress,
            COUNT(t.id) AS tasks,
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN towers tw ON st.tower_id = tw.id
      WHERE wp.floor_label IS NOT NULL${subconFilter}
      GROUP BY tw.id, tw.name, st.code, st.slug, st.id, wp.floor_label
      ORDER BY tw.id, st.id`,
    ...(user.role === "subcon" ? [today, user.id] : [today]));

  // Mỗi tháp có danh sách sheet + tầng riêng (tầng cao trên cùng — giống toà nhà).
  const towerNames = [...new Set(cells.map((c) => c.tower ?? ""))];
  const towers = towerNames.map((name) => {
    const tc = cells.filter((c) => (c.tower ?? "") === name);
    return {
      name,
      sheets: [...new Set(tc.map((c) => c.sheetType))],
      floors: [...new Set(tc.map((c) => c.floor))].sort((a, b) => parseInt(b) - parseInt(a)),
    };
  });

  // Giữ floors/sheets phẳng cho tương thích cũ.
  const floors = [...new Set(cells.map((c) => c.floor))].sort((a, b) => parseInt(b) - parseInt(a));
  const sheets = [...new Set(cells.map((c) => c.sheetType))];

  return NextResponse.json({ towers, floors, sheets, cells });
}
