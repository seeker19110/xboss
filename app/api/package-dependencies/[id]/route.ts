import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
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

  // Chống xoá xuyên dự án: suy dự án qua nhóm việc → sheet_type → tower (vá V9 — trước đây
  // DELETE theo id không kiểm gì, id đoán được sẽ xoá được quan hệ của dự án khác).
  //
  // Kiểm CẢ HAI đầu quan hệ, không chỉ predecessor: POST cùng cụm đã ép hai đầu cùng dự án
  // nên dữ liệu sinh qua API luôn khớp, nhưng dòng lệch dự án vẫn có thể lọt vào bảng qua
  // đường khác (import, backfill, sửa tay). Chỉ kiểm một đầu thì đúng những dòng lệch đó lại
  // xoá được xuyên dự án — kiểm cả hai để bản vá không phụ thuộc vào bất biến của route khác.
  const dep = await queryOne<{ predecessorId: number; successorId: number }>(
    `SELECT predecessor_id AS "predecessorId", successor_id AS "successorId"
       FROM package_dependencies WHERE id = ?`,
    id,
  );
  if (!dep)
    return NextResponse.json({ error: "Không tìm thấy quan hệ phụ thuộc" }, { status: 404 });

  const visible = await visibleProjectIds(user);
  const dsProj = await query<{ projectId: number | null }>(
    `SELECT tw.project_id AS "projectId"
       FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
      WHERE wp.id IN (?, ?)`,
    dep.predecessorId,
    dep.successorId,
  );
  const thayDuHaiDau = dsProj.length === (dep.predecessorId === dep.successorId ? 1 : 2);
  if (!thayDuHaiDau || !dsProj.every((p) => visible.includes(p.projectId as number)))
    return NextResponse.json({ error: "Không tìm thấy quan hệ phụ thuộc" }, { status: 404 });

  await run(`DELETE FROM package_dependencies WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
