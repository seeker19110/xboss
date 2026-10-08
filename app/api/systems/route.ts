import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listSystems } from "@/lib/tien-do/systems";

export const dynamic = "force-dynamic";

// GET /api/systems — danh mục hệ + số sheet + % tiến độ tổng (mọi user đăng nhập
// xem được — dùng cho sidebar "Hệ thi công" + card hệ trên dashboard).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // S02: số liệu tổng hợp theo dự án đang chọn; không có dự án khả kiến → danh sách rỗng.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ systems: [] });
  const systems = await listSystems(projectId);
  return NextResponse.json({ systems });
}
