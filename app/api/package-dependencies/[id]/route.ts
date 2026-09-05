import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { visibleProjectIds } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// DELETE /api/package-dependencies/:id → xoá 1 quan hệ phụ thuộc (Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa phụ thuộc" }, { status: 403 });

  const params = await paramsP;
  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });

  // Chống xoá xuyên dự án: suy dự án qua nhóm việc predecessor → sheet_type → tower (vá V9 —
  // trước đây DELETE theo id không kiểm gì, id đoán được sẽ xoá được quan hệ của dự án khác).
  const dep = await queryOne<{ predecessorId: number }>(
    `SELECT predecessor_id AS "predecessorId" FROM package_dependencies WHERE id = ?`,
    id,
  );
  if (!dep) return NextResponse.json({ error: "Không tìm thấy quan hệ phụ thuộc" }, { status: 404 });

  const visible = await visibleProjectIds(user);
  const proj = await queryOne<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE wp.id = ?`,
    dep.predecessorId,
  );
  if (!proj || !visible.includes(proj.projectId as number))
    return NextResponse.json({ error: "Không tìm thấy quan hệ phụ thuộc" }, { status: 404 });

  await run(`DELETE FROM package_dependencies WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
