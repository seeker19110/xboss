import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sheetVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

type Sheet = { id: number; code: string; name: string; responsible: string | null; slug: string };
type Pkg = { id: number; code: string; seqNo: string | null; floorLabel: string | null; name: string; status: string; progress: number; boqCode: string | null; drawingUrl: string | null; startDate: string | null; endDate: string | null };
type Task = { id: number; packageId: number; code: string; name: string; status: string; endDate: string | null; progressPercent: number; boqCode: string | null; drawingUrl: string | null; assignedTo: number | null; assigneeName: string | null };

// GET /api/tasks?sheet=ogtd  → work packages (kèm sub-tasks) của 1 sheet.
// Sub-con chỉ thấy task được giao cho mình.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("sheet");
  if (!slug) return NextResponse.json({ error: "Thiếu tham số sheet" }, { status: 400 });

  const st = await queryOne<Sheet>(`SELECT id, code, name, responsible, slug FROM sheet_types WHERE slug = ?`, slug);
  if (!st) return NextResponse.json({ error: "Sheet không hợp lệ" }, { status: 404 });

  const pkgs = await query<Pkg>(
    `SELECT id, code, seq_no AS "seqNo", floor_label AS "floorLabel", name, status, progress,
            boq_code AS "boqCode", drawing_url AS "drawingUrl",
            start_date AS "startDate", end_date AS "endDate"
       FROM work_packages WHERE sheet_type_id = ? ORDER BY sort_order, id`, st.id);

  const subconFilter = user.role === "subcon" ? `AND t.assigned_to = ${user.id}` : "";
  const tasks = await query<Task>(
    `SELECT t.id, t.package_id AS "packageId", t.code, t.name, t.status,
            t.end_date AS "endDate", t.progress_percent AS "progressPercent",
            t.boq_code AS "boqCode", t.drawing_url AS "drawingUrl",
            t.assigned_to AS "assignedTo", u.name AS "assigneeName"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE wp.sheet_type_id = ? ${subconFilter}
      ORDER BY t.sort_order, t.id`, st.id);

  const byPkg = new Map<number, Task[]>();
  for (const t of tasks) {
    if (!byPkg.has(t.packageId)) byPkg.set(t.packageId, []);
    byPkg.get(t.packageId)!.push(t);
  }

  let packages = pkgs.map((p) => ({ ...p, tasks: byPkg.get(p.id) ?? [] }));
  // Sub-con: ẩn nhóm không có task nào của mình.
  if (user.role === "subcon") packages = packages.filter((p) => p.tasks.length > 0);

  return NextResponse.json({ sheet: st, packages, version: await sheetVersion(slug) });
}
