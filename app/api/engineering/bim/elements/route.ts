import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listBimElements } from "@/lib/ky-thuat/engineering-bim-cad";

export const dynamic = "force-dynamic";

// GET /api/engineering/bim/elements — Danh sách phần tử BIM/CAD kèm trạng thái 4D/5D
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem phần tử BIM" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const storey = searchParams.get("storey") || undefined;
    const system = searchParams.get("system") || undefined;
    const discipline = searchParams.get("discipline") || undefined;

    const elements = await listBimElements(projectId, { storey, system, discipline });
    return NextResponse.json(elements);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
