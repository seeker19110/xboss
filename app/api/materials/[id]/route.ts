import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { boqTakenBy } from "@/lib/boq";
import { validateCustom } from "@/lib/custom-fields";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const STATUSES = ["dat_hang", "ve_kho", "da_dung"];
const canEditMaterials = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// PATCH /api/materials/:id  body: { name?, unit?, qtyPlanned?, qtyUsed?, status?, note? }
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEditMaterials(user.role))
    return NextResponse.json({ error: "Không có quyền sửa vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const m =
    projectId != null
      ? await queryOne<{ id: number; qty_used: number; qty_stock: number }>(
          `SELECT id, qty_used, COALESCE(qty_stock, 0) AS qty_stock FROM materials WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
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
      if (usedBy)
        return NextResponse.json(
          { error: `Mã BOQ "${boq}" đã được dùng bởi ${usedBy}` },
          { status: 409 },
        );
    }
  }

  const fields: Record<string, string> = {
    name: "name",
    unit: "unit",
    qtyBoq: "qty_boq",
    qtyPlanned: "qty_planned",
    qtyUsed: "qty_used",
    qtyStock: "qty_stock",
    minStockLevel: "min_stock_level",
    status: "status",
    note: "note",
    boqCode: "boq_code",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(fields)) {
    if (body[key] !== undefined) {
      sets.push(`${col} = ?`);
      const isQty =
        key === "qtyBoq" ||
        key === "qtyPlanned" ||
        key === "qtyUsed" ||
        key === "qtyStock" ||
        key === "minStockLevel";
      vals.push(isQty ? Number(body[key]) || 0 : body[key]);
    }
  }
  // Trường tuỳ biến (M52 PR2): merge shallow vào cột custom — không đè field khác.
  if (body.custom !== undefined) {
    const v = await validateCustom("material", projectId, body.custom);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
    sets.push(`custom = custom || ?::jsonb`);
    vals.push(JSON.stringify(v.value));
  }
  if (!sets.length)
    return NextResponse.json({ error: "Không có trường để cập nhật" }, { status: 400 });

  vals.push(id);
  try {
    // Khoá dòng (FOR UPDATE) rồi mới đọc qty_used/qty_stock hiện hành để tính delta ghi
    // audit — tránh lost update khi có POST /transactions chạy xen giữa lúc load form và
    // lúc PATCH này gửi đi (m ở trên chỉ dùng để kiểm tồn tại/quyền, đã có thể lỗi thời).
    await withTransaction(async () => {
      const locked = await queryOne<{ qty_used: number; qty_stock: number }>(
        `SELECT qty_used, COALESCE(qty_stock, 0) AS qty_stock FROM materials WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!locked) return;

      await run(
        `UPDATE materials SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ...vals,
      );

      // Sửa trực tiếp số đã dùng cũng phải truy vết được — ghi giao dịch với delta chênh lệch.
      if (body.qtyUsed !== undefined) {
        const newQty = Number(body.qtyUsed) || 0;
        const delta = newQty - locked.qty_used;
        if (delta !== 0) {
          await run(
            `INSERT INTO material_transactions (material_id, delta, qty_after, note, created_by)
             VALUES (?, ?, ?, 'Sửa trực tiếp tổng đã dùng', ?)`,
            id,
            delta,
            newQty,
            user.id,
          );
        }
      }

      // Điều chỉnh tồn kho trực tiếp cũng phải truy vết (nhất quán với nhập/xuất kho).
      if (body.qtyStock !== undefined) {
        const newStock = Number(body.qtyStock) || 0;
        const delta = newStock - locked.qty_stock;
        if (delta !== 0) {
          await run(
            `INSERT INTO material_transactions (material_id, delta, qty_after, type, note, created_by)
             VALUES (?, ?, ?, 'dieu_chinh_kho', 'Điều chỉnh tồn kho trực tiếp', ?)`,
            id,
            delta,
            newStock,
            user.id,
          );
        }
      }
    });
  } catch (e: unknown) {
    log.error("PATCH /api/materials/:id lỗi", {
      route: "PATCH /api/materials/:id",
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Lỗi máy chủ khi cập nhật vật tư" }, { status: 500 });
  }

  const material = await queryOne(
    `SELECT id, name, unit, qty_planned AS "qtyPlanned", qty_used AS "qtyUsed", status, note FROM materials WHERE id = ?`,
    id,
  );
  return NextResponse.json({ material });
}

// DELETE /api/materials/:id (Admin only)
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được xoá vật tư" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const r =
    projectId != null
      ? await run(`DELETE FROM materials WHERE id = ? AND project_id = ?`, id, projectId)
      : { changes: 0 };
  if (r.changes === 0)
    return NextResponse.json({ error: "Không tìm thấy vật tư" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
