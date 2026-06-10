import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { codeFromSlug } from "@/lib/sheets";

export const dynamic = "force-dynamic";

type Sheet = { id: number; code: string; name: string; responsible: string | null };
type Pkg = { id: number; code: string; seqNo: string | null; floorLabel: string | null; name: string; status: string; progress: number };
type Task = { id: number; packageId: number; code: string; name: string; status: string; endDate: string | null; progressPercent: number };

// GET /api/tasks?sheet=ogtd  → work packages (kèm sub-tasks) của 1 sheet.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("sheet");
  if (!slug) return NextResponse.json({ error: "Thiếu tham số sheet" }, { status: 400 });

  const code = codeFromSlug(slug);
  if (!code) return NextResponse.json({ error: "Sheet không hợp lệ" }, { status: 404 });

  const st = queryOne<Sheet>(`SELECT id, code, name, responsible FROM sheet_types WHERE code = ?`, code);
  if (!st) return NextResponse.json({ sheet: { code, name: code }, packages: [] });

  const pkgs = query<Pkg>(
    `SELECT id, code, seq_no AS seqNo, floor_label AS floorLabel, name, status, progress
       FROM work_packages WHERE sheet_type_id = ? ORDER BY id`, st.id);

  const tasks = query<Task>(
    `SELECT t.id, t.package_id AS packageId, t.code, t.name, t.status,
            t.end_date AS endDate, t.progress_percent AS progressPercent
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
      WHERE wp.sheet_type_id = ?
      ORDER BY t.code`, st.id);

  const byPkg = new Map<number, Task[]>();
  for (const t of tasks) {
    if (!byPkg.has(t.packageId)) byPkg.set(t.packageId, []);
    byPkg.get(t.packageId)!.push(t);
  }

  const packages = pkgs.map((p) => ({ ...p, tasks: byPkg.get(p.id) ?? [] }));

  return NextResponse.json({ sheet: st, packages });
}
