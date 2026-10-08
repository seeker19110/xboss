import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, withProjectScope } from "@/lib/db";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { moneyInputErrorBody, parseOptionalMoneyInput, type MoneyInput } from "@/lib/nen/money";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// Phạm vi bill (S02a cụm 3, P1-1): đúng project_id của dự án đã xác minh — dòng legacy
// project_id NULL KHÔNG sửa/xoá được qua dự án nào — và mọi liên kết cha (hợp đồng/IPC/sheet)
// cùng dự án + org, giống điều kiện GET /api/payments/bills. Ghép thẳng vào câu UPDATE/DELETE
// (một câu, không kiểm-rồi-ghi) nên không có cửa sổ race. Tham số: id, projectId, projectId,
// orgId, projectId, orgId, projectId, orgId.
const BILL_SCOPE = `id = ? AND project_id = ?
   AND (contract_id IS NULL OR EXISTS (
     SELECT 1 FROM contracts c JOIN projects cp ON cp.id = c.project_id
      WHERE c.id = payment_bills.contract_id AND c.project_id = ? AND cp.org_id = ?
   ))
   AND (payment_cert_id IS NULL OR EXISTS (
     SELECT 1 FROM payment_certs pc
       JOIN contracts cc ON cc.id = pc.contract_id
       JOIN projects cp ON cp.id = cc.project_id
      WHERE pc.id = payment_bills.payment_cert_id AND cc.project_id = ? AND cp.org_id = ?
        AND (payment_bills.contract_id IS NULL OR pc.contract_id = payment_bills.contract_id)
   ))
   AND (sheet_type_id IS NULL OR EXISTS (
     SELECT 1 FROM sheet_types pst
       JOIN towers pt ON pt.id = pst.tower_id
       JOIN projects pp ON pp.id = pt.project_id
      WHERE pst.id = payment_bills.sheet_type_id AND pt.project_id = ? AND pp.org_id = ?
   ))`;

function billScopeParams(id: number, projectId: number, orgId: number) {
  return [id, projectId, projectId, orgId, projectId, orgId, projectId, orgId];
}

const notFound = () =>
  NextResponse.json(
    { error: "Không tìm thấy bill thanh toán" },
    { status: 404, headers: PRIVATE_NO_STORE },
  );

// PATCH /api/payments/bills/:id — sửa ĐVT / khối lượng / nhân công / ghi chú.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa bill thanh toán" }, { status: 403 });

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null) return notFound();

  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const sets: string[] = [];
  const args: unknown[] = [];
  if (b.unit !== undefined) {
    sets.push("unit = ?");
    args.push(String(b.unit).trim() || null);
  }
  if (b.quantity !== undefined) {
    const q = b.quantity === "" || b.quantity == null ? null : Number(b.quantity);
    sets.push("quantity = ?");
    args.push(q != null && Number.isFinite(q) && q >= 0 ? q : null);
  }
  if (b.labor !== undefined) {
    // S10 (A3-FR01/FR02): rỗng/null = xoá; "1.234" kiểu vi-VN → 400; vượt NUMERIC(15,2) → 422
    // (trước đây lỗi tràn 500); số âm → 400 thay vì lặng lẽ ghi null.
    let labor: MoneyInput | null;
    try {
      labor = parseOptionalMoneyInput(b.labor, { label: "Nhân công" });
    } catch (err) {
      const loi = moneyInputErrorBody(err);
      if (loi) return NextResponse.json(loi.body, { status: loi.status });
      throw err;
    }
    if (labor && labor.unscaled < 0n)
      return NextResponse.json({ error: "Nhân công phải ≥ 0" }, { status: 400 });
    sets.push("labor = ?::numeric");
    args.push(labor?.text ?? null);
  }
  if (b.note !== undefined) {
    sets.push("note = ?");
    args.push(String(b.note).trim() || null);
  }
  if (!sets.length) return NextResponse.json({ error: "Không có gì để sửa" }, { status: 400 });

  const updated = await withProjectScope(
    projectId,
    () =>
      query<{ id: number }>(
        `UPDATE payment_bills SET ${sets.join(", ")} WHERE ${BILL_SCOPE} RETURNING id`,
        ...args,
        ...billScopeParams(id, projectId, user.orgId),
      ),
    { readOnly: false },
  );
  if (updated.length === 0) return notFound();
  return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
}

// DELETE /api/payments/bills/:id — xoá bill thanh toán.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá bill thanh toán" }, { status: 403 });

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null) return notFound();

  const deleted = await withProjectScope(
    projectId,
    () =>
      query<{ id: number }>(
        `DELETE FROM payment_bills WHERE ${BILL_SCOPE} RETURNING id`,
        ...billScopeParams(id, projectId, user.orgId),
      ),
    { readOnly: false },
  );
  if (deleted.length === 0) return notFound();
  return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
}
