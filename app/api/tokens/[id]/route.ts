import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { queryOne, run } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/tokens/:id — thu hồi token thiết bị AutoCAD (M99 PR2/AC7): đặt revoked_at,
// KHÔNG xoá dòng (giữ audit trail last_used_at). Chủ token tự thu hồi; Admin thu hồi được
// của mọi người trong org (xử lý máy kỹ sư đã nghỉ/mất máy).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Id không hợp lệ" }, { status: 400 });
  }

  const token = await queryOne<{ id: number; createdBy: number; revoked: boolean }>(
    `SELECT id, created_by AS "createdBy", (revoked_at IS NOT NULL) AS revoked
       FROM api_keys
      WHERE id = ? AND org_id = ? AND 'cad' = ANY(scopes)`,
    id,
    user.orgId,
  );
  if (!token) return NextResponse.json({ error: "Không tìm thấy token" }, { status: 404 });
  const laChu = token.createdBy === user.id;
  if (!laChu && !CAN.manageIntegrations(user.role)) {
    return NextResponse.json({ error: "Chỉ chủ token hoặc Admin được thu hồi" }, { status: 403 });
  }
  if (token.revoked) return NextResponse.json({ ok: true, message: "Token đã thu hồi trước đó" });

  await run(`UPDATE api_keys SET revoked_at = now() WHERE id = ?`, id);
  return NextResponse.json({ ok: true, message: "Đã thu hồi — plugin sẽ nhận 401 ở lần gọi sau" });
}
