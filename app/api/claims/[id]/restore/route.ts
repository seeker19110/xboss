import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// POST /api/claims/:id/restore — khôi phục claim đã soft-delete (M45 PR4). Chỉ Admin.
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được khôi phục claim" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM claims WHERE id = ? AND project_id = ? AND deleted_at IS NOT NULL`,
          id,
          projectId,
        )
      : undefined;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy claim đã xoá" }, { status: 404 });

  await run(`UPDATE claims SET deleted_at = NULL WHERE id = ?`, id);
  return NextResponse.json({ restored: id });
}
