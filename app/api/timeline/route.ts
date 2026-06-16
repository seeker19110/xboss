import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/timeline — tiến độ tầng × tuần (12 tuần gần nhất) từ task_history.
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Tiến độ hiện tại theo tầng × hệ (để tô màu ô hiện tại)
  const current = await query<{
    floorLabel: string; sheetType: string; sheetSlug: string | null;
    progress: number; tasks: number; delayed: number;
  }>(`
    SELECT wp.floor_label AS "floorLabel",
           st.code AS "sheetType", st.slug AS "sheetSlug",
           COALESCE(AVG(t.progress_percent), 0) AS progress,
           COUNT(t.id)::int AS tasks,
           COALESCE(SUM(CASE WHEN t.status = 'tre' THEN 1 ELSE 0 END), 0)::int AS delayed
      FROM work_packages wp
      JOIN sheet_types st ON wp.sheet_type_id = st.id
      LEFT JOIN tasks t ON t.package_id = wp.id
     WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
     GROUP BY wp.floor_label, st.id, st.code, st.slug
     ORDER BY st.id, wp.floor_label`);

  // Tiến độ theo tuần × tầng (gộp tất cả hệ) — 13 tuần gần nhất
  const history = await query<{
    floorLabel: string; weekStart: string; avgProgress: number;
  }>(`
    SELECT wp.floor_label AS "floorLabel",
           DATE_TRUNC('week', th.changed_at)::DATE::TEXT AS "weekStart",
           AVG(th.new_progress) AS "avgProgress"
      FROM task_history th
      JOIN tasks t ON th.task_id = t.id
      JOIN work_packages wp ON t.package_id = wp.id
     WHERE wp.floor_label IS NOT NULL AND wp.floor_label != ''
       AND th.changed_at >= NOW() - INTERVAL '13 weeks'
     GROUP BY wp.floor_label, DATE_TRUNC('week', th.changed_at)
     ORDER BY "floorLabel", "weekStart"`);

  // Danh sách tuần (ISO date, thứ Hai đầu tuần)
  const weeksSet = new Set(history.map(h => h.weekStart));
  const weeks = [...weeksSet].sort();

  // Danh sách tầng (sắp xếp: RF → số giảm dần → B)
  const floorsSet = new Set([
    ...current.map(c => c.floorLabel),
    ...history.map(h => h.floorLabel),
  ]);
  const sortFloor = (f: string) => {
    if (f === 'RF') return 9999;
    const n = parseInt(f);
    if (!isNaN(n)) return n;
    // B1F, B2F...
    const m = f.match(/B(\d+)/i);
    if (m) return -parseInt(m[1]);
    return 0;
  };
  const floors = [...floorsSet].sort((a, b) => sortFloor(b) - sortFloor(a));

  // Danh sách hệ
  const sheetsMap = new Map<string, string | null>();
  for (const c of current) sheetsMap.set(c.sheetType, c.sheetSlug);
  const sheets = [...sheetsMap.entries()].map(([code, slug]) => ({ code, slug }));

  return NextResponse.json({ current, history, weeks, floors, sheets });
}
