import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, todayISO } from "@/lib/db";
import { sortFloorsDesc } from "@/lib/floors";
import { resolveDisciplineId } from "@/lib/disciplines";

export const dynamic = "force-dynamic";

// GET /api/timeline?he=<disciplines.code> — tiến độ hiện tại (tầng × hệ, nhóm theo tháp)
// + lịch sử (tầng × tuần). `he` lọc theo hệ thi công (M36) — không truyền = toàn dự án,
// code không tồn tại = kết quả rỗng (không lỗi).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();
  const disciplineId = await resolveDisciplineId(req.nextUrl.searchParams.get("he"));
  const heFilter = disciplineId !== null ? "AND st.discipline_id = ?" : "";
  const heParams = disciplineId !== null ? [disciplineId] : [];

  // Tiến độ hiện tại theo tháp × tầng × hệ — trễ tính theo ngày quá hạn
  // (giống /api/dashboard/floors, nhất quán với cách lib/status.ts suy ra "tre").
  const current = await query<{
    tower: string | null;
    floorLabel: string;
    sheetType: string;
    sheetSlug: string | null;
    progress: number;
    tasks: number;
    delayed: number;
  }>(
    `SELECT tw.name AS tower, wp.floor_label AS "floorLabel",
            st.code AS "sheetType", st.slug AS "sheetSlug",
            COALESCE(AVG(t.progress_percent), 0) AS progress,
            COUNT(t.id)::int AS tasks,
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0)::int AS delayed
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       LEFT JOIN towers tw ON st.tower_id = tw.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
        ${heFilter}
      GROUP BY tw.id, tw.name, wp.floor_label, st.id, st.code, st.slug
      ORDER BY tw.id, st.sort_order, st.id, wp.floor_label`,
    today,
    ...heParams,
  );

  // Tiến độ theo tuần × tầng (gộp tất cả hệ/tháp, lọc theo `he` nếu có) — 13 tuần gần nhất
  const history = await query<{
    floorLabel: string;
    weekStart: string;
    avgProgress: number;
  }>(
    `SELECT wp.floor_label AS "floorLabel",
           DATE_TRUNC('week', th.changed_at)::DATE::TEXT AS "weekStart",
           AVG(th.new_progress) AS "avgProgress"
      FROM task_history th
      JOIN tasks t ON th.task_id = t.id
      JOIN work_packages wp ON t.package_id = wp.id
      JOIN sheet_types st ON wp.sheet_type_id = st.id
     WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
       AND th.changed_at >= NOW() - INTERVAL '13 weeks'
       ${heFilter}
     GROUP BY wp.floor_label, DATE_TRUNC('week', th.changed_at)
     ORDER BY "floorLabel", "weekStart"`,
    ...heParams,
  );

  // Danh sách tuần (ISO date, thứ Hai đầu tuần)
  const weeksSet = new Set(history.map((h) => h.weekStart));
  const weeks = [...weeksSet].sort();

  // Nhóm theo tháp — mỗi tháp có danh sách sheet + tầng riêng (giống /api/dashboard/floors).
  const towerNames = [...new Set(current.map((c) => c.tower ?? ""))];
  const towers = towerNames.map((name) => {
    const tc = current.filter((c) => (c.tower ?? "") === name);
    return {
      name,
      sheets: [...new Set(tc.map((c) => c.sheetType))],
      floors: [...new Set(tc.map((c) => c.floorLabel))].sort(sortFloorsDesc),
    };
  });

  // Danh sách tầng phẳng (tương thích cũ + trục lịch sử)
  const floors = [
    ...new Set([...current.map((c) => c.floorLabel), ...history.map((h) => h.floorLabel)]),
  ].sort(sortFloorsDesc);

  // Danh sách hệ phẳng (cho dropdown lọc)
  const sheetsMap = new Map<string, string | null>();
  for (const c of current) sheetsMap.set(c.sheetType, c.sheetSlug);
  const sheets = [...sheetsMap.entries()].map(([code, slug]) => ({ code, slug }));

  return NextResponse.json({ towers, current, history, weeks, floors, sheets });
}
