import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { deleteAlertRule } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// DELETE /api/admin/alert-rules/:id — chỉ Admin. Xoá xong metric quay lại default cũ.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageAlertRules(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình ngưỡng cảnh báo" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  await deleteAlertRule(id);
  return NextResponse.json({ deleted: id });
}
