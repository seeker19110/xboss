import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { visibleProjectIds } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// GET /api/user-projects — toàn bộ gán user↔dự án hiện có (Admin/PM, dùng cho khu quản
// lý dự án ở /admin). Trả mảng phẳng { userId, projectId }.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới xem được gán dự án" }, { status: 403 });

  const rows = await query<{ userId: number; projectId: number }>(
    `SELECT user_id AS "userId", project_id AS "projectId" FROM user_projects ORDER BY user_id, project_id`,
  );
  return NextResponse.json({ assignments: rows });
}

// PUT /api/user-projects — thay toàn bộ danh sách dự án user thấy được (Admin/PM).
// Body: { userId, projectIds: number[] }. Lưu ý (lib/projects.ts::visibleProjectIds):
// rỗng TOÀN BẢNG user_projects = mọi user thấy mọi dự án (tương thích ngược); nhưng
// một khi CÓ bất kỳ bản ghi nào trong bảng, user không có dòng nào sẽ KHÔNG thấy dự
// án nào — nên gán `projectIds: []` cho 1 user cụ thể là chủ động khoá user đó lại.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới gán được dự án" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const userId = Number(body?.userId);
  const projectIds = Array.isArray(body?.projectIds) ? body.projectIds.map(Number) : null;
  if (
    !Number.isFinite(userId) ||
    !projectIds ||
    projectIds.some((id: number) => !Number.isFinite(id))
  )
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  // Người bị gán phải tồn tại CÙNG org với người gọi — không lộ user org khác qua 403/200.
  const target = await queryOne<{ id: number; role: string }>(
    `SELECT id, role FROM users WHERE id = ? AND org_id = ?`,
    userId,
    user.orgId,
  );
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  // PM (không phải admin) chỉ được gán trong phạm vi dự án mình thấy, không tự gán mình,
  // không đụng vào Admin — chặn đường leo quyền qua route này (audit 2026-09-22).
  if (user.role !== "admin") {
    if (userId === user.id)
      return NextResponse.json({ error: "Không thể tự gán dự án cho chính mình" }, { status: 403 });
    if (target.role === "admin")
      return NextResponse.json(
        { error: "Chỉ Admin mới gán được dự án cho Admin" },
        { status: 403 },
      );
    const visible = await visibleProjectIds(user);
    if (projectIds.some((id: number) => !visible.includes(id)))
      return NextResponse.json({ error: "Chỉ gán được dự án bạn đang được thấy" }, { status: 403 });
  }

  // Mọi projectIds phải tồn tại thật, cùng org với người gọi — kể cả Admin (chặn gán vào
  // dự án org khác/id ảo). Mảng rỗng hợp lệ (chủ động khoá user, xem comment PUT ở trên).
  if (projectIds.length > 0) {
    const rows = await query<{ id: number }>(
      `SELECT id FROM projects WHERE id = ANY(?) AND org_id = ?`,
      projectIds,
      user.orgId,
    );
    if (rows.length !== new Set(projectIds).size)
      return NextResponse.json({ error: "Dự án không tồn tại" }, { status: 422 });
  }

  await withTransaction(async () => {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, userId);
    for (const projectId of projectIds) {
      await run(
        `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
        userId,
        projectId,
      );
    }
  });

  return NextResponse.json({ ok: true });
}
