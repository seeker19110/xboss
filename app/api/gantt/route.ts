import { NextResponse } from "next/server";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeCpm } from "@/lib/cpm";

export const dynamic = "force-dynamic";

const DAY_MS = 86400_000;
const d2n = (s: string) => new Date(s + "T00:00:00Z").getTime();

// GET /api/gantt → work packages có ngày bắt đầu/kết thúc cho timeline,
// kèm phụ thuộc (deps), nhóm bị "chặn" (blocked) và đường găng CPM (critical).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const bars = await query<{ id: number; startDate: string | null; endDate: string | null; progress: number }>(
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

  // Đường găng (CPM): thời lượng nhóm = số ngày từ BĐ→KT (tối thiểu 1).
  const cpmNodes = bars
    .filter((b) => b.startDate && b.endDate)
    .map((b) => ({ id: b.id, duration: Math.max(1, (d2n(b.endDate!) - d2n(b.startDate!)) / DAY_MS + 1) }));
  const cpm = computeCpm(cpmNodes, deps);

  return NextResponse.json({
    bars, deps, blocked,
    critical: [...cpm.criticalNodes],
    criticalDeps: [...cpm.criticalEdges],
    float: Object.fromEntries(cpm.float),
  });
}
