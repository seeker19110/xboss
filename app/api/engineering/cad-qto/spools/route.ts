import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listCadSpools, calculatePhysicalEarnedValue } from "@/lib/engineering-cad-qto";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-qto/spools — Danh sách phân đoạn Spool CAD & Tiến độ EV
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem Spool CAD" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const floor = searchParams.get("floor") || undefined;
    const discipline = searchParams.get("discipline") || undefined;
    const status = searchParams.get("status") || undefined;

    const spools = await listCadSpools(projectId, { floor, discipline, status });
    const ev = calculatePhysicalEarnedValue(spools);

    return NextResponse.json({
      spools,
      earnedValue: ev,
      totalCount: spools.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
