import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/materials/columns → tên tuỳ chỉnh các cột bảng vật tư (theo dự án đang chọn)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  // Không có dự án nào (DB trống) → fallback dự án đầu tiên như cũ, giữ hành vi cũ.
  const row =
    projectId != null
      ? await queryOne<{ material_col_labels: string | null }>(
          `SELECT material_col_labels FROM projects WHERE id = ?`,
          projectId,
        )
      : await queryOne<{ material_col_labels: string | null }>(
          `SELECT material_col_labels FROM projects LIMIT 1`,
        );
  let labels: Record<string, string> = {};
  try {
    labels = JSON.parse(row?.material_col_labels ?? "{}") ?? {};
  } catch {
    /* dùng mặc định */
  }
  return NextResponse.json({ labels });
}

// PATCH /api/materials/columns  body: { labels: Record<string, string> } (Admin/PM)
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được đổi tên cột" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const labels = body.labels && typeof body.labels === "object" ? body.labels : {};

  const projectId = await getCurrentProjectId(user);
  if (projectId != null) {
    await run(
      `UPDATE projects SET material_col_labels = ? WHERE id = ?`,
      JSON.stringify(labels),
      projectId,
    );
  } else {
    await run(
      `UPDATE projects SET material_col_labels = ? WHERE id = (SELECT id FROM projects LIMIT 1)`,
      JSON.stringify(labels),
    );
  }
  return NextResponse.json({ ok: true });
}
