import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

const STATUSES = ["dat_hang", "ve_kho", "da_dung"];
const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// PATCH /api/materials/:id  body: { name?, unit?, qtyPlanned?, qtyUsed?, status?, note? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền sửa vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const m = await queryOne<{ id: number; qty_used: number }>(
    `SELECT id, qty_used FROM materials WHERE id = ?`, id);
  if (!m) return NextResponse.json({ error: "Không tìm thấy vật tư" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (body.status !== undefined && !STATUSES.includes(String(body.status)))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });

  // BOQCODE duy nhất toàn hệ thống (nhóm + task + vật tư); chuỗi rỗng = xoá mã.
  if (body.boqCode !== undefined) {
    const boq = String(body.boqCode ?? "").trim();
    body.boqCode = boq || null;
    if (boq) {
      const usedBy = await boqTakenBy(boq, { table: "materials", id });
      if (usedBy) return NextResponse.json({ error: `Mã BOQ "${boq}" đã được dùng bởi ${usedBy}` }, { status: 409 });
    }
  }

  const fields: Record<string, string> = {
    name: "name", unit: "unit", qtyPlanned: "qty_planned",
    qtyUsed: "qty_used", status: "status", note: "note", boqCode: "boq_code",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(key.startsWith("qty") ? Number(body[key]) || 0 : body[key]);
    }
  }
  if (!sets.length) return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  await run(`UPDATE materials SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, ...vals);

  // Sửa trực tiếp số đã dùng cũng phải truy vết được — ghi giao dịch với delta chênh lệch.
  if (body.qtyUsed !== undefined) {
    const newQty = Number(body.qtyUsed) || 0;
    const delta = newQty - (m.qty_used ?? 0);
    if (delta !== 0) {
      await run(
        `INSERT INTO material_transactions (material_id, delta, qty_after, note, created_by)
         VALUES (?, ?, ?, 'Sửa trực tiếp tổng đã dùng', ?)`,
        id, delta, newQty, user.id);
    }
  }

  const material = await queryOne(
    `SELECT id, name, unit, qty_planned AS "qtyPlanned", qty_used AS "qtyUsed", status, note FROM materials WHERE id = ?`, id);
  return NextResponse.json({ material });
}

// DELETE /api/materials/:id (Admin/PM)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !(user.role === "admin" || user.role === "pm"))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  await run(`DELETE FROM materials WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
