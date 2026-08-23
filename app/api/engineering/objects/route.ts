import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listEngineeringObjects } from "@/lib/ky-thuat/engineering-kernel";

export const dynamic = "force-dynamic";

// GET /api/engineering/objects?type= — danh sách Engineering Object đã nhận cho dự án
// đang chọn (ENG-1, docs/nang-cap/ENG-1-mep-agent-integration.md mục 6.2). Admin/PM.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.reviewEngineeringObjects(user.role))
    return NextResponse.json({ error: "Không có quyền xem đối tượng kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ objects: [] });

  const sp = new URL(req.url).searchParams;
  const objectType = sp.get("type") || undefined;
  const status = sp.get("status") || undefined;
  const objects = await listEngineeringObjects(projectId, { objectType, status });
  return NextResponse.json({ objects });
}
