import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listStages, createStage } from "@/lib/tien-do/constructionStages";

export const dynamic = "force-dynamic";

// GET /api/construction-stages — danh sách công tác thi công (trục cột của /work-fronts
// bản mới) mà dự án đang chọn nhìn thấy: công tác dùng chung + công tác riêng dự án
// (M123 · D1). Mọi vai trò đăng nhập xem được.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Dự án luôn suy từ phiên (cookie xboss_project), KHÔNG bao giờ nhận từ client.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const stages = await listStages(projectId);
  return NextResponse.json({ stages });
}

// POST /api/construction-stages { name } — thêm công tác RIÊNG của dự án đang chọn (Admin/PM).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền thêm công tác (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name)
    return NextResponse.json({ error: "Tên công tác không được để trống" }, { status: 422 });

  const durationDays = Number(body?.durationDays);
  if (!Number.isInteger(durationDays) || durationDays <= 0)
    return NextResponse.json(
      { error: "Số ngày thi công phải là số nguyên dương" },
      { status: 422 },
    );

  const id = await createStage(projectId, name, durationDays);
  return NextResponse.json({ id }, { status: 201 });
}
