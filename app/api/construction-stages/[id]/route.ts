import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { updateStage } from "@/lib/constructionStages";

export const dynamic = "force-dynamic";

// PATCH /api/construction-stages/:id { name?, active? } — đổi tên/ẩn công tác (Admin/PM).
// Không cho sửa sortOrder qua route này (nằm ngoài phạm vi kéo-thả sắp xếp).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa công tác (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const patch: { name?: string; active?: boolean; durationDays?: number } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name)
      return NextResponse.json({ error: "Tên công tác không được để trống" }, { status: 422 });
    patch.name = name;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.durationDays !== undefined) {
    const durationDays = Number(body.durationDays);
    if (!Number.isInteger(durationDays) || durationDays <= 0)
      return NextResponse.json(
        { error: "Số ngày thi công phải là số nguyên dương" },
        { status: 422 },
      );
    patch.durationDays = durationDays;
  }

  await updateStage(id, patch);
  return NextResponse.json({ updated: id });
}
