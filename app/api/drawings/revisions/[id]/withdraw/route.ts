import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getRevisionDrawingProject, withdrawRevision } from "@/lib/ky-thuat/drawings";

export const dynamic = "force-dynamic";

// POST /api/drawings/revisions/:id/withdraw — chính người đã tải lên rev tự thu hồi (rút lại)
// bản gửi SAI của mình khi còn "submitted"/"commented" (Admin/PM chưa quyết định). Không thay
// PATCH /api/drawings/revisions/:id (Admin/PM duyệt/từ chối) — route này CHỈ cho chính chủ.
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Cùng quyền với lúc tải lên rev (POST /api/drawings/:id/revisions): vai trò đã mất quyền
  // quản lý bản vẽ thì không được đụng revision nữa, kể cả revision do chính mình gửi trước đó.
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Bạn không có quyền thu hồi bản vẽ (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );
  }

  if (await hitRateLimit(`drawing-revision-withdraw:${user.id}`, 20, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn thu hồi bản vẽ (20 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const params = await paramsP;
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const revProject = await getRevisionDrawingProject(id);
  if (!revProject || revProject.projectId !== projectId)
    return NextResponse.json({ error: "Không tìm thấy revision" }, { status: 404 });

  const result = await withdrawRevision(id, user.id);
  if (result.status === "not-found")
    return NextResponse.json({ error: "Không tìm thấy revision" }, { status: 404 });
  if (result.status === "forbidden")
    return NextResponse.json(
      { error: "Chỉ người đã tải lên revision mới được thu hồi" },
      { status: 403 },
    );
  if (result.status === "conflict")
    return NextResponse.json({ error: result.message }, { status: 409 });

  return NextResponse.json({ updated: id, status: "withdrawn", drawingId: result.drawingId });
}
