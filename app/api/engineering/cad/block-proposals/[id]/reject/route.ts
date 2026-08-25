import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAdminOrPm } from "@/lib/bao-mat/auth";
import { tuChoiDeXuat } from "@/lib/ky-thuat/cad/block-proposals";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/block-proposals/:id/reject — từ chối đề xuất block (M103 §3).
// Phiên web Admin/PM; body { reason } bắt buộc — người đề xuất cần biết phải sửa gì.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role)) {
    return NextResponse.json({ error: "Chỉ Admin/PM được từ chối đề xuất block" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id đề xuất không hợp lệ" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Phải nhập lý do từ chối" }, { status: 400 });
  }

  const kq = await tuChoiDeXuat({ id, userId: user.id, reason });
  if (kq.status === "not-found") {
    return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  }
  if (kq.status === "conflict") {
    return NextResponse.json({ error: kq.message, loai: kq.loai }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
