import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { run } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/admin/api-keys/:id — thu hồi key (set revoked_at, KHÔNG xoá dòng để giữ
// audit). Admin. Idempotent: chỉ đặt revoked_at khi còn hiệu lực.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý API key" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  await run(`UPDATE api_keys SET revoked_at = now() WHERE id = ? AND revoked_at IS NULL`, id);
  return NextResponse.json({ revoked: id });
}
