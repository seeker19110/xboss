import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { executeExecutionRequest } from "@/lib/ky-thuat/engineering-autonomy";

export const dynamic = "force-dynamic";

// POST /api/engineering/autonomy/requests/[id]/execute
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringAutonomy(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực thi tác vụ tự động" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-autonomy", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return NextResponse.json({ error: "Thiếu Approval Token" }, { status: 400 });
  }

  try {
    const updated = await executeExecutionRequest(projectId, id, token, user.role);
    return NextResponse.json({ request: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
