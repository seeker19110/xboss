import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction, withProjectScope } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import {
  PO_ALL_STATUSES,
  getPurchaseOrder,
  isValidPoTransition,
  logPoStatusChange,
} from "@/lib/procurement";
import { stripSensitive } from "@/lib/sensitive-fields";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";
// Ai cần thấy PO: admin/pm (quản lý) + engineer (nhận hàng qua /receive) — khớp canReceive.
const canView = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/purchase-orders/:id → chi tiết PO + danh sách items + lịch sử đổi trạng thái,
// scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role))
    return NextResponse.json({ error: "Không có quyền xem đơn hàng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const result = await withProjectScope(projectId ?? "*", async () => {
    const exists = projectId != null ? await getPurchaseOrder(id, projectId) : undefined;
    if (!exists) return null;

    const po = await queryOne(
      `SELECT po.id, po.po_code AS "poCode", po.status,
              po.expected_date AS "expectedDate", po.note,
              po.created_at AS "createdAt",
              s.id AS "supplierId", s.name AS "supplierName", s.phone AS "supplierPhone",
              u.name AS "createdByName"
         FROM purchase_orders po
         LEFT JOIN suppliers s ON po.supplier_id = s.id
         LEFT JOIN users u ON po.created_by = u.id
        WHERE po.id = ?`,
      id,
    );
    if (!po) return null;

    const items = await query(
      `SELECT pi.id, pi.material_id AS "materialId", m.name AS "materialName",
              m.unit AS "unit", m.boq_code AS "boqCode",
              pi.qty_ordered AS "qtyOrdered", pi.qty_received AS "qtyReceived",
              pi.unit_price AS "unitPrice", pi.note,
              pi.pr_id AS "prId"
         FROM po_items pi
         LEFT JOIN materials m ON pi.material_id = m.id
        WHERE pi.po_id = ?
        ORDER BY pi.id`,
      id,
    );

    const history = await query(
      `SELECT h.from_status AS "fromStatus", h.to_status AS "toStatus",
              h.changed_at AS "changedAt", u.name AS "changedByName"
         FROM po_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.po_id = ?
        ORDER BY h.changed_at`,
      id,
    );

    return { po, items, history };
  });
  if (!result) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

  return NextResponse.json({
    po: result.po,
    items: stripSensitive("poItem", result.items, user),
    history: result.history,
  });
}

// PATCH /api/purchase-orders/:id  body: { status?, supplierId?, expectedDate?, note? }
// scoped theo dự án đang chọn (M22).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa đơn hàng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const po = projectId != null ? await getPurchaseOrder(id, projectId) : undefined;
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (body.status && !PO_ALL_STATUSES.includes(body.status))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
  // Đổi trạng thái thủ công phải theo đúng thứ tự (không nhảy cóc) — "partial"/"received"
  // do route /receive tự set theo số lượng nhận, không đi qua đây.
  if (body.status && body.status !== po.status && !isValidPoTransition(po.status, body.status))
    return NextResponse.json(
      { error: `Không thể chuyển từ "${po.status}" sang "${body.status}"` },
      { status: 409 },
    );
  // Ngày phải đúng dạng YYYY-MM-DD — chuỗi sai để Postgres từ chối sẽ thành lỗi 500.
  if (body.expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.expectedDate)))
    return NextResponse.json({ error: "Ngày dự kiến phải có dạng YYYY-MM-DD" }, { status: 422 });

  const sets: string[] = [];
  const vals: unknown[] = [];
  const fields: Record<string, string> = {
    status: "status",
    supplierId: "supplier_id",
    expectedDate: "expected_date",
    note: "note",
  };
  for (const [k, col] of Object.entries(fields)) {
    if (body[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(body[k] || null);
    }
  }
  if (!sets.length)
    return NextResponse.json({ error: "Không có trường cập nhật" }, { status: 400 });
  vals.push(id);
  await withTransaction(async () => {
    await run(`UPDATE purchase_orders SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    if (body.status && body.status !== po.status)
      await logPoStatusChange(id, po.status, body.status, user.id);
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/purchase-orders/:id — scoped theo dự án đang chọn (M22).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được xoá đơn hàng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const po = projectId != null ? await getPurchaseOrder(id, projectId) : undefined;
  if (!po) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });

  // Đã nhập kho (một phần/đủ) thì tồn kho đã cộng vào vật tư + có phiếu nhập gắn kèm —
  // xoá sẽ tạo tồn ảo và phiếu nhập mồ côi. Phải huỷ đơn thay vì xoá.
  const received = await queryOne<{ id: number }>(
    `SELECT id FROM po_items WHERE po_id = ? AND qty_received > 0 LIMIT 1`,
    id,
  );
  if (received || po.status === "partial" || po.status === "received")
    return NextResponse.json(
      { error: "Đơn hàng đã nhập kho, không thể xoá — hãy huỷ đơn" },
      { status: 409 },
    );

  await run(`DELETE FROM po_items WHERE po_id = ?`, id);
  await run(`DELETE FROM purchase_orders WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
