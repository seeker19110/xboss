import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// Xác nhận bill thuộc dự án đang chọn trước khi PATCH/DELETE (chống sửa/xoá chéo dự
// án) — cùng quy tắc project_id NULL = dòng cũ chưa gán dự án như GET /api/payments/bills.
async function billBelongsToProject(id: number, projectId: number | null): Promise<boolean> {
  if (projectId == null) return true;
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM payment_bills WHERE id = ? AND (project_id = ? OR project_id IS NULL)`,
    id,
    projectId,
  );
  return row != null;
}

// PATCH /api/payments/bills/:id — sửa ĐVT / khối lượng / nhân công / ghi chú.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa bill thanh toán" }, { status: 403 });

  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (!(await billBelongsToProject(id, projectId)))
    return NextResponse.json({ error: "Không tìm thấy bill thanh toán" }, { status: 404 });

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
    const l = b.labor === "" || b.labor == null ? null : Number(b.labor);
    sets.push("labor = ?");
    args.push(l != null && Number.isFinite(l) && l >= 0 ? l : null);
  }
  if (b.note !== undefined) {
    sets.push("note = ?");
    args.push(String(b.note).trim() || null);
  }
  if (!sets.length) return NextResponse.json({ error: "Không có gì để sửa" }, { status: 400 });

  args.push(id);
  await run(`UPDATE payment_bills SET ${sets.join(", ")} WHERE id = ?`, ...args);
  return NextResponse.json({ ok: true });
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

  const projectId = await getCurrentProjectId(user);
  if (!(await billBelongsToProject(id, projectId)))
    return NextResponse.json({ error: "Không tìm thấy bill thanh toán" }, { status: 404 });

  await run(`DELETE FROM payment_bills WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
