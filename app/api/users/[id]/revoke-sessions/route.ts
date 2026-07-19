import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { isSameOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

// POST /api/users/:id/revoke-sessions → thu hồi mọi phiên đăng nhập của user (V5).
// Tăng users.session_version → mọi token phát trước đó (nhúng session_version cũ) hết hiệu
// lực ngay request kế tiếp (getCurrentUser đối chiếu session_version token với DB).
// Quyền: CAN.manageUsers (Admin). Nếu id === me.id (admin tự thu hồi) KHÔNG chặn — admin bị
// đăng xuất ở request kế tiếp, đúng hành vi mong muốn.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(me.role))
    return NextResponse.json({ error: "Chỉ Admin được thu hồi phiên" }, { status: 403 });
  // Same-origin check (V6) — nhất quán với các route mutating nhạy cảm khác (xoá/đổi mật khẩu).
  if (!isSameOrigin(req))
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const target = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id = ?`, id);
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  await run(`UPDATE users SET session_version = session_version + 1 WHERE id = ?`, id);

  return NextResponse.json({ ok: true });
}
