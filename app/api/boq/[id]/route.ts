import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

// PATCH /api/boq/:id — sửa dòng BOQ (Admin/PM). Đổi code phải re-check trùng.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const existing =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM boq_items WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.code !== undefined) {
    const code = String(body.code).trim();
    if (!code) return NextResponse.json({ error: "Mã không được để trống" }, { status: 422 });
    // TODO(M54 PR2): lấy orgId thật từ session
    const takenBy = await boqTakenBy(code, 1, { table: "boq_items", id });
    if (takenBy)
      return NextResponse.json(
        { error: `Mã "${code}" đã được dùng bởi ${takenBy}` },
        { status: 409 },
      );
    fields.push("code = ?");
    values.push(code);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên không được để trống" }, { status: 422 });
    fields.push("name = ?");
    values.push(name);
  }
  if (body.unit !== undefined) {
    const unit = String(body.unit).trim();
    if (!unit)
      return NextResponse.json({ error: "Đơn vị tính không được để trống" }, { status: 422 });
    fields.push("unit = ?");
    values.push(unit);
  }
  if (body.systemId !== undefined) {
    if (body.systemId === null) {
      fields.push("system_id = ?");
      values.push(null);
    } else {
      const systemId = Number(body.systemId);
      if (
        !Number.isInteger(systemId) ||
        !(await queryOne(`SELECT id FROM systems WHERE id = ?`, systemId))
      )
        return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
      fields.push("system_id = ?");
      values.push(systemId);
    }
  }
  for (const [key, col] of [
    ["qtyContract", "qty_contract"],
    ["unitPrice", "unit_price"],
    ["qtySub", "qty_sub"],
    ["subUnitPrice", "sub_unit_price"],
  ] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0)
        return NextResponse.json({ error: `${key} phải là số không âm` }, { status: 422 });
      fields.push(`${col} = ?`);
      values.push(n);
    }
  }
  if (body.note !== undefined) {
    fields.push("note = ?");
    values.push(typeof body.note === "string" ? body.note.trim() || null : null);
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n))
      return NextResponse.json({ error: "sortOrder phải là số nguyên" }, { status: 422 });
    fields.push("sort_order = ?");
    values.push(n);
  }

  if (fields.length === 0) return NextResponse.json({ ok: true });

  try {
    await run(`UPDATE boq_items SET ${fields.join(", ")} WHERE id = ?`, ...values, id);
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: "Mã BOQ đã tồn tại" }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/boq/:id — xoá dòng BOQ (Admin/PM). Cascade xoá map task đi kèm.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Không có quyền xoá (chỉ Admin/PM)" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const result =
    projectId != null
      ? await run(`DELETE FROM boq_items WHERE id = ? AND project_id = ?`, id, projectId)
      : { changes: 0 };
  if (result.changes === 0)
    return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
