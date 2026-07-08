import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { portfolioKpi } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/portfolio/kpi — mọi user đăng nhập: KPI gộp cross-project (trang Portfolio).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const kpi = await portfolioKpi(user);
  return NextResponse.json(kpi, { headers: { "Cache-Control": "no-store" } });
}
