import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// GET /api/v1/tasks?sheet=&floor=&status=&page= — API mở đọc-only (M49 PR1), auth qua
// API key (scope read). Phân trang 100 dòng/trang + total. Lọc đúng dự án của key qua
// towers.project_id (xem app/api/tasks/route.ts).
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req, "read");
  if (ctx instanceof Response) return ctx;
  const { projectId } = ctx;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = 100;
  const offset = (page - 1) * limit;

  const conds = ["tw.project_id = ?"];
  const args: unknown[] = [projectId];
  const sheet = sp.get("sheet");
  if (sheet) {
    conds.push("st.slug = ?");
    args.push(sheet);
  }
  const floor = sp.get("floor");
  if (floor) {
    conds.push("wp.floor_label = ?");
    args.push(floor);
  }
  const status = sp.get("status");
  if (status) {
    conds.push("t.status = ?");
    args.push(status);
  }
  const where = conds.join(" AND ");

  const from = `FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE ${where}`;

  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total ${from}`, ...args);
  const rows = await query(
    `SELECT t.id, t.code, t.boq_code AS "boqCode", t.name,
            wp.floor_label AS floor, t.status, t.progress_percent AS progress,
            t.start_date AS "startDate", t.end_date AS "endDate",
            t.package_id AS "packageId"
       ${from}
      ORDER BY t.sort_order, t.id
      LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset,
  );

  return NextResponse.json({ data: rows, page, total: totalRow?.total ?? 0 });
}
