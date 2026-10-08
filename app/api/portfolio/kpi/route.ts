import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { portfolioKpi } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// GET /api/portfolio/kpi — KPI gộp cross-project (trang Portfolio). Mọi user đăng nhập,
// tôn trọng user_projects + org qua portfolioKpi(). `?org=<id>` cùng nghĩa với
// GET /api/projects để list và KPI dùng chung một filter (QUALITY-FINAL-1 S12).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const orgParam = req.nextUrl.searchParams.get("org");
  const orgId = orgParam && Number.isFinite(Number(orgParam)) ? Number(orgParam) : null;

  const kpi = await portfolioKpi(user, orgId);
  return NextResponse.json(kpi);
}
