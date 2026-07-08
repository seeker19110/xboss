import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { portfolioKpi } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/portfolio/kpi — KPI gộp cross-project (trang Portfolio). Mọi user đăng nhập,
// tôn trọng user_projects qua portfolioKpi()/listProjects().
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const kpi = await portfolioKpi(user);
  return NextResponse.json(kpi);
}
