import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// GET /api/v1/materials?page= — vật tư đọc-only (M49 PR1), scope read. Lọc theo dự án
// của key qua cột materials.project_id (M27).
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req, "read");
  if (ctx instanceof Response) return ctx;
  const { projectId } = ctx;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = 100;
  const offset = (page - 1) * limit;

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM materials m WHERE m.project_id = ?`,
    projectId,
  );
  const rows = await query(
    `SELECT m.id, m.boq_code AS "boqCode", m.name, m.unit,
            m.qty_boq AS "qtyBoq", m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed",
            COALESCE(m.qty_stock, 0) AS "qtyStock", m.status
       FROM materials m
      WHERE m.project_id = ?
      ORDER BY m.sort_order, m.id
      LIMIT ? OFFSET ?`,
    projectId,
    limit,
    offset,
  );

  return NextResponse.json({ data: rows, page, total: totalRow?.total ?? 0 });
}
