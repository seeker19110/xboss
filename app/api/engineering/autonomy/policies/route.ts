import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listAutonomyCapabilities, listAutonomyPolicies } from "@/lib/engineering-autonomy";

export const dynamic = "force-dynamic";

// GET /api/engineering/autonomy/policies
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAutonomy(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem chính sách tự động hóa" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const [capabilities, policies] = await Promise.all([
      listAutonomyCapabilities(),
      listAutonomyPolicies(projectId),
    ]);
    return NextResponse.json({ capabilities, policies });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
