import { NextRequest, NextResponse } from "next/server";
import { insertId, run, withTransaction, todayISO, withProjectScope } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { nextSeqCode, withUniqueRetry } from "@/lib/ha-tang/seqcode";
import {
  checkPurchaseOrderParents,
  listPurchaseOrders,
  parsePoQuantity,
} from "@/lib/tai-chinh/procurement";
import {
  moneyInputErrorBody,
  parseOptionalMoneyInput,
  QuantityInputError,
  quantityInputErrorBody,
} from "@/lib/nen/money";

export const dynamic = "force-dynamic";

const canManage = (r?: Role) => r === "admin" || r === "pm";
// Ai cần thấy PO: admin/pm (quản lý) + engineer (nhận hàng qua /receive) — khớp canReceive.
const canView = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/purchase-orders?status= — scoped theo dự án đang chọn (M22).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role))
    return NextResponse.json({ error: "Không có quyền xem đơn hàng" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;
  const orders =
    projectId != null
      ? await withProjectScope(projectId, () => listPurchaseOrders({ status, projectId }))
      : [];

  return NextResponse.json({ orders });
}

// POST /api/purchase-orders  body: { supplierId?, expectedDate?, note?, items: [{materialId, prId?, qtyOrdered, unitPrice?, note?}] }
// project_id gán = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManage(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo đơn hàng" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo đơn hàng" }, { status: 422 });
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const items: {
    materialId: number;
    prId?: number;
    qtyOrdered: unknown;
    unitPrice?: unknown;
    note?: string;
  }[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length)
    return NextResponse.json({ error: "Đơn hàng phải có ít nhất 1 vật tư" }, { status: 400 });
  // Ngày phải đúng dạng YYYY-MM-DD — chuỗi sai để Postgres từ chối sẽ thành lỗi 500.
  if (body.expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.expectedDate)))
    return NextResponse.json({ error: "Ngày dự kiến phải có dạng YYYY-MM-DD" }, { status: 422 });

  // S10 (A3-FR01/FR02): đơn giá đọc exact TRƯỚC khi mở transaction — "1.500" kiểu vi-VN → 400
  // (trước đây ghi 1,5 đ), vượt NUMERIC(15,2) → 422; rỗng/0 → null (chưa có giá) như cũ.
  let donGia: (string | null)[];
  try {
    donGia = items.map((i) => {
      const v = parseOptionalMoneyInput(i.unitPrice, { label: "Đơn giá" });
      return v == null || v.unscaled === 0n ? null : v.text;
    });
  } catch (err) {
    const loi = moneyInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  // DATA-MIGRATIONS §6: số lượng đặt đọc exact (≤18 nguyên/6 lẻ, không exponent, cắt đuôi 0) —
  // ghi cả qty_ordered_exact ('exact_input_v1') lẫn cột float cũ cho reader legacy.
  let soLuong: string[];
  try {
    soLuong = items.map((i) => {
      const q = parsePoQuantity(i.qtyOrdered, "Số lượng đặt");
      if (q == null) throw new QuantityInputError("quantity_invalid", "Thiếu số lượng đặt");
      return q;
    });
  } catch (err) {
    const loi = quantityInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  if (donGia.some((g) => g != null && g.startsWith("-")))
    return NextResponse.json({ error: "Đơn giá phải ≥ 0" }, { status: 400 });

  const supplierId = body.supplierId ? Number(body.supplierId) : null;
  const contractId = body.contractId ? Number(body.contractId) : null;

  // Sinh mã PO: PO-YYYYMM-NNN — retry toàn bộ (gen + transaction) nếu đụng mã.
  const ym = todayISO().slice(0, 7).replace("-", "");
  const result = await withUniqueRetry(() =>
    withTransaction(async () => {
      // A1-AC03: NCC cùng tổ chức; hợp đồng/vật tư/PR cùng dự án — kiểm trong transaction ghi.
      const parentErr = await checkPurchaseOrderParents(
        {
          supplierId,
          contractId,
          items: items.map((i) => ({
            materialId: Number(i.materialId),
            prId: i.prId ? Number(i.prId) : null,
          })),
        },
        projectId,
        user.orgId,
      );
      if (parentErr) return { error: parentErr };
      const poCode = await nextSeqCode("purchase_orders", "po_code", `PO-${ym}-`);
      const id = await insertId(
        `INSERT INTO purchase_orders (po_code, supplier_id, expected_date, note, created_by, contract_id, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        poCode,
        supplierId,
        body.expectedDate ? String(body.expectedDate) : null,
        body.note ? String(body.note).trim() : null,
        user.id,
        contractId,
        projectId,
      );

      for (const [i, item] of items.entries()) {
        await insertId(
          `INSERT INTO po_items (po_id, material_id, pr_id, qty_ordered, qty_ordered_exact,
           qty_ordered_provenance, qty_received, qty_received_exact, qty_received_provenance,
           unit_price, note)
         VALUES (?, ?, ?, ?, ?::numeric, 'exact_input_v1', 0, 0, 'exact_input_v1', ?, ?)`,
          id,
          Number(item.materialId),
          item.prId ? Number(item.prId) : null,
          Number(soLuong[i]),
          soLuong[i],
          donGia[i],
          item.note ? String(item.note).trim() : null,
        );
      }

      // Cập nhật PR liên quan → trạng thái 'ordered'
      const prIds = items.filter((i) => i.prId).map((i) => i.prId!);
      for (const prId of prIds) {
        await run(`UPDATE purchase_requests SET status = 'ordered' WHERE id = ?`, prId);
      }

      return { poId: id, poCode };
    }),
  );

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ id: result.poId, poCode: result.poCode }, { status: 201 });
}
