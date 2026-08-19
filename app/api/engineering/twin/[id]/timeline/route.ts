import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getTwinTimeline } from "@/lib/engineering-twin";

export const dynamic = "force-dynamic";

// GET /api/engineering/twin/[id]/timeline?stateType=&limit=&offset= — Dòng thời gian biến thiên trạng thái
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem timeline Digital Twin" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const stateType = sp.get("stateType") || undefined;
  const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 50;
  const offset = sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0;

  try {
    const result = await getTwinTimeline(projectId, id, { stateType, limit, offset });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
