import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getDefs, isCustomEntityType } from "@/lib/custom-fields";

export const dynamic = "force-dynamic";

// GET /api/custom-fields?entityType=task — danh sách định nghĩa trường tuỳ biến đang
// bật cho entity + dự án đang chọn. Mọi vai trò đăng nhập đọc được (để render form
// chi tiết entity). CRUD định nghĩa nằm ở /api/admin/custom-fields.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const entityType = req.nextUrl.searchParams.get("entityType");
  if (!isCustomEntityType(entityType))
    return NextResponse.json({ error: "entityType không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const defs = await getDefs(entityType, projectId);
  return NextResponse.json({ defs });
}
