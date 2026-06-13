import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

const canApprove = (r?: Role) => r === "admin" || r === "pm";

// PATCH /api/purchase-requests/:id  body: { action: 'approve'|'reject', reviewNote? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const pr = await queryOne<{ id: number; status: string }>(
    `SELECT id, status FROM purchase_requests WHERE id = ?`, id);
  if (!pr) return NextResponse.json({ error: "Không tìm thấy yêu cầu" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // Duyệt/từ chối: chỉ Admin/PM, chỉ khi đang pending
  if (action === "approve" || action === "reject") {
    if (!canApprove(user.role))
      return NextResponse.json({ error: "Chỉ Admin/PM được duyệt yêu cầu" }, { status: 403 });
    if (pr.status !== "pending")
      return NextResponse.json({ error: "Yêu cầu không còn ở trạng thái chờ duyệt" }, { status: 409 });

    const newStatus = action === "approve" ? "approved" : "rejected";
    await run(
      `UPDATE purchase_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?`,
      newStatus, user.id, body.reviewNote ? String(body.reviewNote).trim() : null, id);

    return NextResponse.json({ ok: true, status: newStatus });
  }

  // Sửa note (người tạo, khi còn pending)
  if (body.note !== undefined && pr.status === "pending") {
    await run(`UPDATE purchase_requests SET note = ? WHERE id = ?`, String(body.note).trim() || null, id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const pr = await queryOne<{ requested_by: number; status: string }>(
    `SELECT requested_by, status FROM purchase_requests WHERE id = ?`, id);
  if (!pr) return NextResponse.json({ error: "Không tìm thấy yêu cầu" }, { status: 404 });

  if (pr.requested_by !== user.id && user.role !== "admin" && user.role !== "pm")
    return NextResponse.json({ error: "Không có quyền xoá yêu cầu này" }, { status: 403 });
  if (pr.status === "ordered")
    return NextResponse.json({ error: "Yêu cầu đã được đặt hàng, không thể xoá" }, { status: 409 });

  await run(`DELETE FROM purchase_requests WHERE id = ?`, id);
  return NextResponse.json({ ok: true });
}
