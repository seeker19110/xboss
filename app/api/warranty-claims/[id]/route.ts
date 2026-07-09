import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";
import { getClaim, parseClaimBody, validateClaimInput } from "@/lib/warranty";

export const dynamic = "force-dynamic";

// GET /api/warranty-claims/:id — chi tiết claim. Scoped theo dự án đang chọn.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const item = projectId != null ? await getClaim(id, projectId) : null;
  if (!item) return NextResponse.json({ error: "Không tìm thấy claim bảo hành" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH /api/warranty-claims/:id — sửa/chuyển vòng đời open→handling→closed
// (manageWarranty: Admin/PM/kỹ sư). Chuyển sang 'closed' mà chưa có closed_date (mới
// đóng, không phải sửa lại bản ghi đã đóng từ trước) → tự set hôm nay.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa claim bảo hành (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getClaim(id, projectId) : null;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy claim bảo hành" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = {
    warrantyItemId: existing.warrantyItemId,
    code: existing.code,
    reportedDate: existing.reportedDate,
    description: existing.description,
    severity: existing.severity,
    status: existing.status,
    dueDate: existing.dueDate,
    resolution: existing.resolution,
    closedDate: existing.closedDate,
    assignee: existing.assignee,
  };
  for (const key of Object.keys(merged)) if (key in body) merged[key] = body[key];
  const input = parseClaimBody(merged);

  if (input.status === "closed" && !input.closedDate) input.closedDate = todayISO();

  const invalid = validateClaimInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.warrantyItemId != null) {
    const wi = await queryOne(
      `SELECT id FROM warranty_items WHERE id = ? AND project_id = ?`,
      input.warrantyItemId,
      projectId,
    );
    if (!wi)
      return NextResponse.json({ error: "Hạng mục bảo hành không tồn tại" }, { status: 422 });
  }
  if (input.assignee != null) {
    if (!(await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee)))
      return NextResponse.json({ error: "Người được gán không tồn tại" }, { status: 422 });
  }

  await run(
    `UPDATE warranty_claims SET warranty_item_id = ?, code = ?, reported_date = ?,
            description = ?, severity = ?, status = ?, due_date = ?, resolution = ?,
            closed_date = ?, assignee = ?
      WHERE id = ?`,
    input.warrantyItemId,
    input.code,
    input.reportedDate,
    input.description,
    input.severity,
    input.status,
    input.dueDate,
    input.resolution,
    input.closedDate,
    input.assignee,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/warranty-claims/:id — xoá claim bảo hành (manageWarranty: Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá claim bảo hành (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getClaim(id, projectId) : null;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy claim bảo hành" }, { status: 404 });

  await run(`DELETE FROM warranty_claims WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
