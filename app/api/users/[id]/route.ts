import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, hashPassword, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "pm", "engineer", "subcon"];

// PATCH /api/users/:id  body: { name?, role?, password? } → sửa user (Admin).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || !CAN.manageUsers(me.role))
    return NextResponse.json({ error: "Chỉ Admin được sửa người dùng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const target = await queryOne<{ id: number; role: Role }>(`SELECT id, role FROM users WHERE id = ?`, id);
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.role !== undefined) {
    const role = String(body.role) as Role;
    if (!ROLES.includes(role)) return NextResponse.json({ error: "Vai trò không hợp lệ" }, { status: 400 });
    // Không cho hạ cấp admin cuối cùng (kể cả tự hạ mình).
    if (target.role === "admin" && role !== "admin") {
      const admins = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`);
      if (Number(admins?.n) <= 1)
        return NextResponse.json({ error: "Không thể hạ cấp Admin cuối cùng" }, { status: 400 });
    }
    await run(`UPDATE users SET role = ? WHERE id = ?`, role, id);
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên không được trống" }, { status: 400 });
    await run(`UPDATE users SET name = ? WHERE id = ?`, name, id);
  }

  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 6) return NextResponse.json({ error: "Mật khẩu tối thiểu 6 ký tự" }, { status: 400 });
    await run(`UPDATE users SET password_hash = ? WHERE id = ?`, hashPassword(pw), id);
  }

  const user = await queryOne(`SELECT id, name, email, role FROM users WHERE id = ?`, id);
  return NextResponse.json({ user });
}

// DELETE /api/users/:id → xoá user (Admin). Không xoá chính mình / admin cuối.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || !CAN.manageUsers(me.role))
    return NextResponse.json({ error: "Chỉ Admin được xoá người dùng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  if (id === me.id) return NextResponse.json({ error: "Không thể tự xoá tài khoản đang đăng nhập" }, { status: 400 });

  const target = await queryOne<{ id: number; role: Role }>(`SELECT id, role FROM users WHERE id = ?`, id);
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  if (target.role === "admin") {
    const admins = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`);
    if (Number(admins?.n) <= 1)
      return NextResponse.json({ error: "Không thể xoá Admin cuối cùng" }, { status: 400 });
  }

  // Gỡ liên kết trước khi xoá (giữ lịch sử/thông báo sạch FK).
  await run(`UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?`, id);
  await run(`DELETE FROM notifications WHERE user_id = ?`, id);
  await run(`DELETE FROM users WHERE id = ?`, id);

  return NextResponse.json({ ok: true });
}
