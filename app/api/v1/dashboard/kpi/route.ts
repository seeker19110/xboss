import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-keys";
import { sheetProgressKpi, taskStatusCounts } from "@/lib/kpi";

export const dynamic = "force-dynamic";

// GET /api/v1/dashboard/kpi — tổng hợp % theo hệ (sheet) + đếm trạng thái (M49 PR1),
// scope read. Tái dùng helper lib/kpi.ts (dùng chung với dashboard nội bộ).
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req, "read");
  if (ctx instanceof Response) return ctx;
  const { projectId } = ctx;

  const [kpi, statusRows] = await Promise.all([
    sheetProgressKpi({ projectId }),
    taskStatusCounts(projectId),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const r of statusRows) statusCounts[r.status] = r.count;

  return NextResponse.json({ kpi, statusCounts });
}
