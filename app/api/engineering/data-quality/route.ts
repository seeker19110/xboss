import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { detectDataQualityIssues } from "@/lib/ky-thuat/engineering-graph";

export const dynamic = "force-dynamic";

// GET /api/engineering/data-quality — Quét và lấy danh sách vấn đề chất lượng dữ liệu kỹ thuật
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringDataQuality(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền quản lý chất lượng dữ liệu kỹ thuật" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ issues: [] });

  const sp = new URL(req.url).searchParams;
  const severityFilter = sp.get("severity");
  const statusFilter = sp.get("status");

  try {
    let issues = await detectDataQualityIssues(projectId);
    if (severityFilter) {
      issues = issues.filter((i) => i.severity === severityFilter);
    }
    if (statusFilter) {
      issues = issues.filter((i) => i.status === statusFilter);
    }
    return NextResponse.json({ issues });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
