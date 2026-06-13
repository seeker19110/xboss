import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN, hashPassword, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "pm", "engineer", "subcon"];

// GET /api/users → danh sách user.
// Admin: quản lý. PM: cần danh sách để gán task (chỉ trả thông tin cơ bản).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(me.role) && !CAN.assign(me.role))
    return NextResponse.json({ error: "Không có quyền xem danh sách người dùng" }, { status: 403 });

  const users = await query(
    `SELECT id, name, email, role, created_at AS "createdAt" FROM users ORDER BY id`);
  return NextResponse.json({ users });
}

// POST /api/users  body: { name, email, password, role } → tạo user mới (Admin).
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(me.role))
    return NextResponse.json({ error: "Chỉ Admin được tạo người dùng" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "") as Role;

  if (!name || !email || !password)
    return NextResponse.json({ error: "Thiếu tên / email / mật khẩu" }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "Mật khẩu tối thiểu 6 ký tự" }, { status: 400 });
  if (!ROLES.includes(role))
    return NextResponse.json({ error: "Vai trò không hợp lệ" }, { status: 400 });

  const dup = await queryOne(`SELECT id FROM users WHERE email = ?`, email);
  if (dup) return NextResponse.json({ error: "Email đã tồn tại" }, { status: 409 });

  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    name, email, hashPassword(password), role);

  return NextResponse.json({ user: { id, name, email, role } }, { status: 201 });
}
