import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/tokens/:id — THU HỒI token thiết bị (M99 PR2, AC7): đặt revoked_at, không
// xoá dòng (giữ vết last_used_at/ai tạo). Chủ token thu hồi token của mình; Admin thu hồi
// được mọi token trong org. Idempotent: token đã thu hồi rồi → vẫn 200.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Id token không hợp lệ" }, { status: 400 });
  }

  const laAdmin = user.role === "admin";
  const rows = await query<{ id: number }>(
    `UPDATE api_tokens t SET revoked_at = COALESCE(t.revoked_at, NOW())
       FROM users u
      WHERE t.id = ? AND u.id = t.user_id
        AND ${laAdmin ? `u.org_id = ?` : `t.user_id = ?`}
      RETURNING t.id`,
    id,
    laAdmin ? user.orgId : user.id,
  );
  if (!rows[0]) {
    return NextResponse.json(
      { error: "Token không tồn tại hoặc không thuộc quyền bạn" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
