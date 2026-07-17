import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// GET /api/v1/packages?sheet=&page= — nhóm công tác đọc-only (M49 PR1), scope read.
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
  const where = conds.join(" AND ");

  const from = `FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE ${where}`;

  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total ${from}`, ...args);
  const rows = await query(
    `SELECT wp.id, wp.code, wp.boq_code AS "boqCode", wp.name,
            wp.floor_label AS floor, wp.progress, wp.status, st.slug AS "sheetSlug"
       ${from}
      ORDER BY wp.sort_order, wp.id
      LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset,
  );

  return NextResponse.json({ data: rows, page, total: totalRow?.total ?? 0 });
}
