import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { RISK_STATUSES, parseRiskBody, validateRiskInput, type RiskStatus } from "@/lib/risks";

export const dynamic = "force-dynamic";

// PATCH /api/risks/:id — sửa rủi ro / đổi trạng thái (Admin/PM/kỹ sư), scoped theo dự
// án đang chọn (M22). Đóng (closed) ghi closed_at; mở lại xoá closed_at.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageRisks(user.role))
    return NextResponse.json({ error: "Không có quyền sửa rủi ro" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const risk =
    projectId != null
      ? await queryOne<{ id: number; status: string }>(
          `SELECT id, status FROM risks WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!risk) return NextResponse.json({ error: "Không tìm thấy rủi ro" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  // Chỉ đổi trạng thái — không bắt gửi lại toàn bộ trường.
  if (typeof body.status === "string" && Object.keys(body).length === 1) {
    const status = body.status as RiskStatus;
    if (!RISK_STATUSES.includes(status))
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
    await run(
      `UPDATE risks SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN NOW() ELSE NULL END WHERE id = ?`,
      status,
      status,
      id,
    );
    return NextResponse.json({ ok: true, status });
  }

  const input = parseRiskBody(body);
  const invalid = validateRiskInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  if (input.owner != null) {
    const u = await queryOne(`SELECT id FROM users WHERE id = ?`, input.owner);
    if (!u) return NextResponse.json({ error: "Người phụ trách không tồn tại" }, { status: 422 });
  }

  await run(
    `UPDATE risks SET title = ?, description = ?, category = ?, probability = ?, impact = ?, mitigation = ?, owner = ? WHERE id = ?`,
    input.title,
    input.description,
    input.category,
    input.probability,
    input.impact,
    input.mitigation,
    input.owner,
    id,
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/risks/:id — xoá rủi ro (chỉ Admin/PM), scoped theo dự án đang chọn.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá rủi ro" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const r =
    projectId != null
      ? await run(`DELETE FROM risks WHERE id = ? AND project_id = ?`, id, projectId)
      : { changes: 0 };
  if (r.changes === 0)
    return NextResponse.json({ error: "Không tìm thấy rủi ro" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
