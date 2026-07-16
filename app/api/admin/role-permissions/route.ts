import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUser,
  CAN,
  ROLES,
  PERM_KEYS,
  LOCKED_PERMS,
  permDefaultsMatrix,
  validatePermOverride,
  type Role,
  type PermKey,
} from "@/lib/auth";
import { listPermissionOverrides, setPermissionOverride } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/admin/role-permissions — ma trận quyền cho trang admin (chỉ Admin, CAN.manageUsers):
// trả danh sách vai trò + khoá quyền hợp lệ + giá trị mặc định từng (role, perm) + danh sách
// quyền ghi bị khoá mở + toàn bộ override hiện có → UI vẽ 3 trạng thái (mặc định / mở / siết).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(user.role))
    return NextResponse.json({ error: "Chỉ Admin được xem cấu hình phân quyền" }, { status: 403 });

  const overrides = await listPermissionOverrides();
  return NextResponse.json({
    roles: ROLES,
    perms: PERM_KEYS,
    lockedPerms: LOCKED_PERMS,
    defaults: permDefaultsMatrix(),
    overrides,
  });
}

// PATCH /api/admin/role-permissions { role, permKey, allowed: boolean | null } — ghi/xoá 1
// override (chỉ Admin, CAN.manageUsers). allowed=null xoá override (về mặc định). Validate:
// role/permKey hợp lệ + luật LOCKED_PERMS (không mở quyền ghi) → 422. Ghi audit qua trigger
// (M43) + invalidate cache ngay trong process này.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình phân quyền" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const role = String(body.role ?? "");
  const permKey = String(body.permKey ?? "");
  const allowed: boolean | null =
    body.allowed === null ? null : typeof body.allowed === "boolean" ? body.allowed : undefined!;
  if (allowed === undefined)
    return NextResponse.json({ error: "Trường allowed phải là true/false/null" }, { status: 400 });

  const err = validatePermOverride(role, permKey, allowed);
  if (err) return NextResponse.json({ error: err }, { status: 422 });

  await setPermissionOverride(role as Role, permKey as PermKey, allowed, user.id);
  return NextResponse.json({ ok: true });
}
