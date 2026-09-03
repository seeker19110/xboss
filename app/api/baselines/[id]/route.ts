import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// DELETE /api/baselines/:id → xoá baseline (Admin/PM). baseline_tasks xoá theo CASCADE.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá baseline" }, { status: 403 });

  // Dự án luôn suy từ phiên (cookie xboss_project), KHÔNG bao giờ nhận từ client.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Baseline thuộc dự án khác → 404 (không phải 403, để không tiết lộ baseline có tồn tại).
  const b = await queryOne<{ id: number }>(
    `SELECT id FROM baselines WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
  if (!b) return NextResponse.json({ error: "Không tìm thấy baseline" }, { status: 404 });

  await run(`DELETE FROM baselines WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
