import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listStages, createStage } from "@/lib/constructionStages";

export const dynamic = "force-dynamic";

// GET /api/construction-stages — danh sách công tác thi công (trục cột của /work-fronts
// bản mới), mọi vai trò đăng nhập xem được.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const stages = await listStages();
  return NextResponse.json({ stages });
}

// POST /api/construction-stages { name } — thêm công tác mới (Admin/PM).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền thêm công tác (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name)
    return NextResponse.json({ error: "Tên công tác không được để trống" }, { status: 422 });

  const id = await createStage(name);
  return NextResponse.json({ id }, { status: 201 });
}
