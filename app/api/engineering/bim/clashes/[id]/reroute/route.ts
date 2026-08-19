import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { generateClashRerouteSolution } from "@/lib/engineering-bim-cad";

export const dynamic = "force-dynamic";

// POST /api/engineering/bim/clashes/:id/reroute — Sinh phương án nắn tuyến giải quyết xung đột
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền thao tác xung đột BIM" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const { elementA, elementB } = body;

    if (!elementA || !elementB) {
      return NextResponse.json(
        { error: "Cần cung cấp thông tin elementA và elementB" },
        { status: 422 },
      );
    }

    const solution = generateClashRerouteSolution(params.id, elementA, elementB);
    return NextResponse.json(solution);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
