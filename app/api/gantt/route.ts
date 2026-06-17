import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/gantt → work packages có ngày bắt đầu/kết thúc cho timeline,
// kèm phụ thuộc (deps) và danh sách việc trước chưa xong làm nhóm bị "chặn" (blocked).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const bars = await query<{ id: number; startDate: string | null; progress: number }>(
    `SELECT wp.id, wp.code, wp.name, wp.floor_label AS "floorLabel",
            wp.start_date AS "startDate", wp.end_date AS "endDate",
            wp.progress, wp.status, st.code AS "sheetType", st.slug AS "sheetSlug"
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE wp.start_date IS NOT NULL AND wp.end_date IS NOT NULL
      ORDER BY st.id, wp.start_date, wp.id`);

  const deps = await query<{ id: number; predecessorId: number; successorId: number; predCode: string; predProgress: number }>(
    `SELECT d.id, d.predecessor_id AS "predecessorId", d.successor_id AS "successorId",
            p.code AS "predCode", p.progress AS "predProgress"
       FROM package_dependencies d
       JOIN work_packages p ON d.predecessor_id = p.id`);

  // Nhóm bị chặn: đã tới ngày bắt đầu, chưa xong, mà còn việc trước chưa hoàn thành (progress < 1).
  const today = todayISO();
  const progressById = new Map(bars.map((b) => [b.id, b.progress ?? 0]));
  const startById = new Map(bars.map((b) => [b.id, b.startDate]));
  const blockedBy = new Map<number, string[]>();
  for (const d of deps) {
    if (!startById.has(d.successorId)) continue; // successor không nằm trong tập có ngày
    if ((progressById.get(d.successorId) ?? 0) >= 1) continue; // nhóm sau đã xong
    const succStart = startById.get(d.successorId);
    if (succStart && succStart <= today && (d.predProgress ?? 0) < 1) {
      if (!blockedBy.has(d.successorId)) blockedBy.set(d.successorId, []);
      blockedBy.get(d.successorId)!.push(d.predCode);
    }
  }

  const blocked = [...blockedBy.entries()].map(([id, preds]) => ({ id, preds }));
  return NextResponse.json({ bars, deps, blocked });
}
