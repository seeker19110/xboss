import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getWarrantyItem, parseWarrantyItemBody, validateWarrantyInput } from "@/lib/warranty";

export const dynamic = "force-dynamic";

// GET /api/warranty-items/:id — chi tiết hạng mục bảo hành. Scoped theo dự án đang chọn.
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
  const item = projectId != null ? await getWarrantyItem(id, projectId) : null;
  if (!item)
    return NextResponse.json({ error: "Không tìm thấy hạng mục bảo hành" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH /api/warranty-items/:id — sửa hạng mục bảo hành (manageWarranty: Admin/PM/kỹ sư).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hạng mục bảo hành (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getWarrantyItem(id, projectId) : null;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy hạng mục bảo hành" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = {
    title: existing.title,
    disciplineId: existing.disciplineId,
    handoverItemId: existing.handoverItemId,
    warrantyFrom: existing.warrantyFrom,
    warrantyMonths: existing.warrantyMonths,
    guaranteeId: existing.guaranteeId,
    status: existing.status,
    note: existing.note,
  };
  for (const key of Object.keys(merged)) if (key in body) merged[key] = body[key];
  const input = parseWarrantyItemBody(merged);

  const invalid = validateWarrantyInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.disciplineId != null) {
    if (!(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, input.disciplineId)))
      return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }
  if (input.handoverItemId != null) {
    const hi = await queryOne(
      `SELECT id FROM handover_items WHERE id = ? AND project_id = ?`,
      input.handoverItemId,
      projectId,
    );
    if (!hi)
      return NextResponse.json({ error: "Hạng mục bàn giao không tồn tại" }, { status: 422 });
  }
  if (input.guaranteeId != null) {
    const ib = await queryOne(
      `SELECT id FROM insurance_bonds WHERE id = ? AND project_id = ? AND kind = 'bao_lanh_bao_hanh'`,
      input.guaranteeId,
      projectId,
    );
    if (!ib)
      return NextResponse.json(
        { error: "Bảo lãnh bảo hành không tồn tại hoặc không đúng loại" },
        { status: 422 },
      );
  }

  await run(
    `UPDATE warranty_items SET title = ?, discipline_id = ?, handover_item_id = ?,
            warranty_from = ?, warranty_months = ?, guarantee_id = ?, status = ?, note = ?
      WHERE id = ?`,
    input.title,
    input.disciplineId,
    input.handoverItemId,
    input.warrantyFrom,
    input.warrantyMonths,
    input.guaranteeId,
    input.status,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/warranty-items/:id — xoá hạng mục bảo hành (manageWarranty: Admin/PM/kỹ sư).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWarranty(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hạng mục bảo hành (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = projectId != null ? await getWarrantyItem(id, projectId) : null;
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy hạng mục bảo hành" }, { status: 404 });

  await run(`DELETE FROM warranty_items WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
