import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { queryOne, run } from "@/lib/db";

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

  // M54 GĐ1 PR2: cô lập tenant — chỉ thu hồi key thuộc org người gọi (khớp lọc org_id
  // của GET cùng cụm; DELETE ở đây chạy ngoài withTransaction nên RLS không tự áp được).
  const key = await queryOne<{ id: number }>(
    `SELECT id FROM api_keys WHERE id = ? AND org_id = ?`,
    id,
    user.orgId,
  );
  if (!key) return NextResponse.json({ error: "Không tìm thấy API key" }, { status: 404 });

  await run(`UPDATE api_keys SET revoked_at = now() WHERE id = ? AND revoked_at IS NULL`, id);
  return NextResponse.json({ revoked: id });
}
