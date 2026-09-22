import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { boqTakenBy } from "@/lib/khoi-luong/boq";
import { ghiLichSuBoq, type ThayDoiBoq } from "@/lib/khoi-luong/boq-history";

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
      ? await queryOne<{
          id: number;
          code: string;
          name: string;
          unit: string;
          systemId: number | null;
          qtyContractText: string;
          unitPriceText: string;
          qtySubText: string | null;
          subUnitPriceText: string | null;
          note: string | null;
        }>(
          `SELECT id, code, name, unit, system_id AS "systemId",
                  qty_contract::text AS "qtyContractText", unit_price::text AS "unitPriceText",
                  qty_sub::text AS "qtySubText", sub_unit_price::text AS "subUnitPriceText", note
             FROM boq_items WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy dòng BOQ" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  // Chỉ ghi lịch sử field THẬT SỰ đổi giá trị (so chuỗi với trường text, so Number() với
  // trường NUMERIC — để "10" và "10.000" không bị coi là đổi).
  const changes: ThayDoiBoq[] = [];

  if (body.code !== undefined) {
    const code = String(body.code).trim();
    if (!code) return NextResponse.json({ error: "Mã không được để trống" }, { status: 422 });
    const takenBy = await boqTakenBy(code, user.orgId, { table: "boq_items", id });
    if (takenBy)
      return NextResponse.json(
        { error: `Mã "${code}" đã được dùng bởi ${takenBy}` },
        { status: 409 },
      );
    fields.push("code = ?");
    values.push(code);
    if (code !== existing.code)
      changes.push({ field: "code", oldValue: existing.code, newValue: code });
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên không được để trống" }, { status: 422 });
    fields.push("name = ?");
    values.push(name);
    if (name !== existing.name)
      changes.push({ field: "name", oldValue: existing.name, newValue: name });
  }
  if (body.unit !== undefined) {
    const unit = String(body.unit).trim();
    if (!unit)
      return NextResponse.json({ error: "Đơn vị tính không được để trống" }, { status: 422 });
    fields.push("unit = ?");
    values.push(unit);
    if (unit !== existing.unit)
      changes.push({ field: "unit", oldValue: existing.unit, newValue: unit });
  }
  if (body.systemId !== undefined) {
    if (body.systemId === null) {
      fields.push("system_id = ?");
      values.push(null);
      if (existing.systemId !== null)
        changes.push({
          field: "system_id",
          oldValue: String(existing.systemId),
          newValue: null,
        });
    } else {
      const systemId = Number(body.systemId);
      if (
        !Number.isInteger(systemId) ||
        !(await queryOne(`SELECT id FROM systems WHERE id = ?`, systemId))
      )
        return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
      fields.push("system_id = ?");
      values.push(systemId);
      if (existing.systemId !== systemId)
        changes.push({
          field: "system_id",
          oldValue: existing.systemId === null ? null : String(existing.systemId),
          newValue: String(systemId),
        });
    }
  }
  for (const [key, col, oldText] of [
    ["qtyContract", "qty_contract", existing.qtyContractText],
    ["unitPrice", "unit_price", existing.unitPriceText],
    ["qtySub", "qty_sub", existing.qtySubText],
    ["subUnitPrice", "sub_unit_price", existing.subUnitPriceText],
  ] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0)
        return NextResponse.json({ error: `${key} phải là số không âm` }, { status: 422 });
      fields.push(`${col} = ?`);
      values.push(n);
      if (oldText === null || Number(oldText) !== n)
        changes.push({ field: col, oldValue: oldText, newValue: String(n) });
    }
  }
  if (body.note !== undefined) {
    const note = typeof body.note === "string" ? body.note.trim() || null : null;
    fields.push("note = ?");
    values.push(note);
    if (note !== existing.note)
      changes.push({ field: "note", oldValue: existing.note, newValue: note });
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
    await withTransaction(async () => {
      await run(`UPDATE boq_items SET ${fields.join(", ")} WHERE id = ?`, ...values, id);
      await ghiLichSuBoq(id, changes, user.id);
    });
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
