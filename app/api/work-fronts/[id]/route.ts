import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  parseWorkFrontUpdateBody,
  updateWorkFrontStatus,
  validateWorkFrontUpdate,
} from "@/lib/workfronts";

export const dynamic = "force-dynamic";

// PATCH /api/work-fronts/:id — đổi trạng thái/ngày/blocker. Admin/PM/kỹ sư; chỉ Admin
// được nhảy ngược trạng thái (sửa sai bàn giao).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền đổi trạng thái mặt bằng (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<{ id: number }>(`SELECT id FROM work_fronts WHERE id = ?`, id);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy mặt bằng" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseWorkFrontUpdateBody(body);
  const invalid = validateWorkFrontUpdate(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const result = await updateWorkFrontStatus(id, input, user.id, user.role === "admin");
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({ updated: id });
}
