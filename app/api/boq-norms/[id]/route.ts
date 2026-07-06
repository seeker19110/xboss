import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { checkNormMaterial, getNorm, parseNormBody, validateNormInput } from "@/lib/norms";

export const dynamic = "force-dynamic";

// PATCH /api/boq-norms/:id — sửa định mức (Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageNorms(user.role))
    return NextResponse.json(
      { error: "Không có quyền sửa định mức (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<Record<string, unknown>>(
    `SELECT resource_type AS "resourceType", material_id AS "materialId",
            resource_name AS "resourceName", qty_per_unit AS "qtyPerUnit",
            unit_label AS "unitLabel", note
       FROM boq_norms WHERE id = ?`,
    id,
  );
  if (!existing) return NextResponse.json({ error: "Không tìm thấy định mức" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input = parseNormBody(merged);

  const invalid = validateNormInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const matErr = await checkNormMaterial(input);
  if (matErr) return NextResponse.json({ error: matErr }, { status: 422 });

  await run(
    `UPDATE boq_norms
        SET resource_type = ?, material_id = ?, resource_name = ?, qty_per_unit = ?, unit_label = ?, note = ?
      WHERE id = ?`,
    input.resourceType,
    input.materialId,
    input.resourceName,
    input.qtyPerUnit,
    input.unitLabel,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}

// DELETE /api/boq-norms/:id — xoá định mức (Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageNorms(user.role))
    return NextResponse.json(
      { error: "Không có quyền xoá định mức (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const norm = await getNorm(id);
  if (!norm) return NextResponse.json({ error: "Không tìm thấy định mức" }, { status: 404 });

  await run(`DELETE FROM boq_norms WHERE id = ?`, id);
  return NextResponse.json({ deleted: id });
}
