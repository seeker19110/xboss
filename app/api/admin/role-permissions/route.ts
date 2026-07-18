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
import { queryOne, query } from "@/lib/db";
import { listPermissionOverrides, setPermissionOverride } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Kiểm id dự án có thật trong bảng projects (override theo dự án phải trỏ dự án tồn tại).
async function projectExists(id: number): Promise<boolean> {
  const row = await queryOne<{ id: number }>(`SELECT id FROM projects WHERE id = ?`, id);
  return !!row;
}

// GET /api/admin/role-permissions[?projectId=<id>] — ma trận quyền cho trang admin (chỉ
// Admin, CAN.manageUsers): trả danh sách vai trò + khoá quyền hợp lệ + giá trị mặc định
// từng (role, perm) + danh sách quyền ghi bị khoá mở + override hiện có → UI vẽ 3 trạng
// thái (mặc định / mở / siết). M61: có `?projectId=` → trả override của dự án đó KÈM
// override toàn hệ (UI vẽ trạng thái kế thừa); không param → chỉ override toàn hệ (như cũ).
// Luôn kèm `projects: [{id, name}]` cho selector phạm vi.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(user.role))
    return NextResponse.json({ error: "Chỉ Admin được xem cấu hình phân quyền" }, { status: 403 });

  const projects = await query<{ id: number; name: string }>(
    `SELECT id, name FROM projects ORDER BY id`,
  );

  const raw = req.nextUrl.searchParams.get("projectId");
  let overrides;
  if (raw !== null && raw !== "") {
    const projectId = Number(raw);
    if (!Number.isInteger(projectId) || projectId <= 0)
      return NextResponse.json({ error: "Mã dự án không hợp lệ" }, { status: 422 });
    if (!(await projectExists(projectId)))
      return NextResponse.json({ error: "Dự án không tồn tại" }, { status: 422 });
    // Override toàn hệ (kế thừa) + override riêng của dự án — UI phân biệt qua field projectId.
    const [globalOverrides, scopedOverrides] = await Promise.all([
      listPermissionOverrides(null),
      listPermissionOverrides(projectId),
    ]);
    overrides = [...globalOverrides, ...scopedOverrides];
  } else {
    overrides = await listPermissionOverrides(null);
  }

  return NextResponse.json({
    roles: ROLES,
    perms: PERM_KEYS,
    lockedPerms: LOCKED_PERMS,
    defaults: permDefaultsMatrix(),
    overrides,
    projects,
  });
}

// PATCH /api/admin/role-permissions { role, permKey, allowed: boolean | null, projectId? }
// — ghi/xoá 1 override (chỉ Admin, CAN.manageUsers). allowed=null xoá override (về mặc
// định/kế thừa). projectId=null|bỏ trống → override toàn hệ (tương thích ngược); số → theo
// dự án (id phải tồn tại → 422). Validate role/permKey + luật LOCKED_PERMS + chống tự khoá
// admin/manageUsers (áp mọi phạm vi) → 422. Ghi audit qua trigger (M43) + invalidate cache.
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

  // projectId: bỏ trống/null → toàn hệ; số → theo dự án.
  let projectId: number | null;
  if (body.projectId === undefined || body.projectId === null) {
    projectId = null;
  } else if (typeof body.projectId === "number" && Number.isInteger(body.projectId)) {
    projectId = body.projectId;
  } else {
    return NextResponse.json({ error: "Mã dự án không hợp lệ" }, { status: 422 });
  }

  const err = validatePermOverride(role, permKey, allowed, projectId);
  if (err) return NextResponse.json({ error: err }, { status: 422 });

  if (projectId !== null && !(await projectExists(projectId)))
    return NextResponse.json({ error: "Dự án không tồn tại" }, { status: 422 });

  await setPermissionOverride(role as Role, permKey as PermKey, allowed, user.id, projectId);
  return NextResponse.json({ ok: true });
}
