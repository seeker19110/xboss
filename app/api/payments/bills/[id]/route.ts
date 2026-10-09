import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { query, withProjectScope } from "@/lib/db";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import {
  moneyInputErrorBody,
  parseOptionalMoneyInput,
  parseQuantityInput,
  quantityInputErrorBody,
  type MoneyInput,
} from "@/lib/nen/money";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import {
  BILL_SCOPE,
  LOI_PHIEU_DA_CHOT,
  LOI_PHIEU_DIEU_CHINH,
  LOI_PHIEU_GAN_IPC,
  billScopeParams,
  khoaPhieu,
  phieuDaChot,
  phieuDieuChinhIpc,
  phieuGanIpc,
} from "@/lib/tai-chinh/payment-bills";

export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

const notFound = () =>
  NextResponse.json(
    { error: "Không tìm thấy bill thanh toán" },
    { status: 404, headers: PRIVATE_NO_STORE },
  );

// PATCH /api/payments/bills/:id — sửa ĐVT / khối lượng / nhân công / ghi chú. Số tiền không sửa
// qua route này; M129: body có `amount` trên phiếu đã chi gắn IPC → 409 `bill_paid_locked` (điều
// chỉnh phải qua chứng từ M128), phiếu khác giữ hành vi cũ (bỏ qua `amount`). M128: phiếu sinh từ
// chứng từ điều chỉnh (type 'adjustment') chỉ đọc — body có amount/quantity/labor/unit → 409
// `bill_adjustment_locked` (chỉ còn sửa ghi chú).
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
    // Rỗng/null = xoá; sai dạng/âm → 400 `quantity_invalid`, tràn NUMERIC(15,3) → 422.
    let q: string | null;
    try {
      q = parseQuantityInput(b.quantity);
    } catch (err) {
      const loi = quantityInputErrorBody(err);
      if (loi) return NextResponse.json(loi.body, { status: loi.status });
      throw err;
    }
    sets.push("quantity = ?::numeric");
    args.push(q);
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
  const doiSoTien = b.amount !== undefined;
  const doiKlTien = doiSoTien || ["quantity", "labor", "unit"].some((k) => b[k] !== undefined);
  if (!sets.length && !doiSoTien)
    return NextResponse.json({ error: "Không có gì để sửa" }, { status: 400 });

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await withProjectScope(
    projectId,
    () =>
      ghiNeuConQuyen(
        () => CAN.editStructure(user.role),
        async (): Promise<"not_found" | "locked" | "adjustment_locked" | "empty" | "ok"> => {
          if (doiKlTien) {
            const phieu = await khoaPhieu(id, projectId, user.orgId);
            if (!phieu) return "not_found";
            if (phieuDieuChinhIpc(phieu)) return "adjustment_locked";
            if (doiSoTien && phieuDaChot(phieu)) return "locked";
          }
          if (!sets.length) return "empty";
          const rows = await query<{ id: number }>(
            `UPDATE payment_bills SET ${sets.join(", ")} WHERE ${BILL_SCOPE} RETURNING id`,
            ...args,
            ...billScopeParams(id, projectId, user.orgId),
          );
          return rows.length ? "ok" : "not_found";
        },
      ),
    { readOnly: false },
  );
  if (!kq.ok)
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa bill thanh toán" }, { status: 403 });
  if (kq.value === "not_found") return notFound();
  if (kq.value === "locked")
    return NextResponse.json(
      { error: LOI_PHIEU_DA_CHOT, code: "bill_paid_locked" },
      { status: 409, headers: PRIVATE_NO_STORE },
    );
  if (kq.value === "adjustment_locked")
    return NextResponse.json(
      { error: LOI_PHIEU_DIEU_CHINH, code: "bill_adjustment_locked" },
      { status: 409, headers: PRIVATE_NO_STORE },
    );
  if (kq.value === "empty")
    return NextResponse.json({ error: "Không có gì để sửa" }, { status: 400 });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
}

// DELETE /api/payments/bills/:id — xoá bill thanh toán. M129: MỌI phiếu gắn IPC (committed lẫn
// paid) → 409 `bill_ipc_locked` (huỷ/sửa phải qua chứng từ điều chỉnh M128).
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

  // S13c: bill còn được hoá đơn (invoices.payment_bill_id) tham chiếu → 23503 → 409, không 500.
  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  let deleted: { id: number }[] | "locked";
  try {
    const kq = await withProjectScope(
      projectId,
      () =>
        ghiNeuConQuyen(
          () => CAN.editStructure(user.role),
          async () => {
            const phieu = await khoaPhieu(id, projectId, user.orgId);
            if (phieu && phieuGanIpc(phieu)) return "locked" as const;
            return query<{ id: number }>(
              `DELETE FROM payment_bills WHERE ${BILL_SCOPE} RETURNING id`,
              ...billScopeParams(id, projectId, user.orgId),
            );
          },
        ),
      { readOnly: false },
    );
    if (!kq.ok)
      return NextResponse.json({ error: "Chỉ Admin/PM được xoá bill thanh toán" }, { status: 403 });
    deleted = kq.value;
  } catch (err) {
    if ((err as { code?: string }).code !== "23503") throw err;
    return NextResponse.json(
      {
        error: "Bill thanh toán đang được hoá đơn tham chiếu — xoá/gỡ hoá đơn trước khi xoá bill",
        code: "dependency_conflict",
      },
      { status: 409, headers: PRIVATE_NO_STORE },
    );
  }
  if (deleted === "locked")
    return NextResponse.json(
      { error: LOI_PHIEU_GAN_IPC, code: "bill_ipc_locked" },
      { status: 409, headers: PRIVATE_NO_STORE },
    );
  if (deleted.length === 0) return notFound();
  return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
}
