import { NextRequest, NextResponse } from "next/server";
import { query, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/user-projects — CAN.assign (admin/pm): toàn bộ gán user↔dự án hiện có,
// dùng cho khu quản lý ở /admin (giống gán user↔hệ).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const rows = await query<{ userId: number; projectId: number }>(
    `SELECT user_id AS "userId", project_id AS "projectId" FROM user_projects ORDER BY user_id, project_id`,
  );
  return NextResponse.json({ assignments: rows }, { headers: { "Cache-Control": "no-store" } });
}

// PUT /api/user-projects  body: { userId, projectIds: number[] } — thay TOÀN BỘ danh sách
// dự án user đó thấy được (rỗng = không gán riêng, quay về mặc định "thấy hết" nếu bảng
// user_projects rỗng toàn hệ thống — xem lib/projects.ts::visibleProjectIds).
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.assign(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = Number(body.userId);
  const projectIds: number[] | null = Array.isArray(body.projectIds)
    ? body.projectIds.map(Number)
    : null;
  if (!Number.isFinite(userId) || !projectIds || projectIds.some((id) => !Number.isFinite(id)))
    return NextResponse.json({ error: "userId/projectIds không hợp lệ" }, { status: 422 });

  await withTransaction(async () => {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, userId);
    for (const projectId of projectIds) {
      await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, userId, projectId);
    }
  });

  return NextResponse.json({ ok: true });
}
