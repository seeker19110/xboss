import { NextRequest, NextResponse } from "next/server";
import { todayISO } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeCpm } from "@/lib/cpm";
import { resolveSystemId } from "@/lib/systems";
import { getCpmData } from "@/lib/gantt-data";

export const dynamic = "force-dynamic";

// GET /api/gantt?system=<systems.code> → work packages có ngày bắt đầu/kết thúc cho
// timeline, kèm phụ thuộc (deps), nhóm bị "chặn" (blocked) và đường găng CPM (critical).
// `system` lọc tập package trước khi tính CPM → đường găng tính trong phạm vi đã lọc (M36).
// Dựng bars/deps/CPM dùng chung `lib/gantt-data.ts` (tái dùng bởi `/api/schedule-control`).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const systemId = await resolveSystemId(req.nextUrl.searchParams.get("system"));
  const { nodes, edges, meta } = await getCpmData(systemId);
  const bars = [...meta.values()];

  // Nhóm bị chặn: đã tới ngày bắt đầu, chưa xong, mà còn việc trước chưa hoàn thành (progress < 1).
  const today = todayISO();
  const progressById = new Map(bars.map((b) => [b.id, b.progress ?? 0]));
  const startById = new Map(bars.map((b) => [b.id, b.startDate]));
  const blockedBy = new Map<number, string[]>();
  for (const d of edges) {
    if (!startById.has(d.successorId)) continue; // successor không nằm trong tập có ngày
    if ((progressById.get(d.successorId) ?? 0) >= 1) continue; // nhóm sau đã xong
    const succStart = startById.get(d.successorId);
    if (succStart && succStart <= today && (d.predProgress ?? 0) < 1) {
      if (!blockedBy.has(d.successorId)) blockedBy.set(d.successorId, []);
      blockedBy.get(d.successorId)!.push(d.predCode);
    }
  }

  const blocked = [...blockedBy.entries()].map(([id, preds]) => ({ id, preds }));

  const cpm = computeCpm(nodes, edges);

  return NextResponse.json({
    bars,
    deps: edges,
    blocked,
    critical: [...cpm.criticalNodes],
    criticalDeps: [...cpm.criticalEdges],
    float: Object.fromEntries(cpm.float),
  });
}
