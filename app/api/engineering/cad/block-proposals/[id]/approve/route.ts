import { NextRequest, NextResponse } from "next/server";
import { CAN, getCurrentUser } from "@/lib/bao-mat/auth";
import { duyetDeXuat } from "@/lib/ky-thuat/cad/block-proposals";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/block-proposals/:id/approve — duyệt đề xuất = phát hành version
// thư viện mới chứa block đó (M103 §3).
//
// CHỈ phiên web Admin/PM: KHÔNG nhận token thiết bị, y như đường phát hành thư viện block
// (M100 §12 — phát hành là thao tác chuỗi cung ứng nội bộ, không làm từ máy trạm bằng token cad).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role)) {
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt đề xuất block" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id đề xuất không hợp lệ" }, { status: 400 });
  }

  const kq = await duyetDeXuat({ id, userId: user.id });
  if (kq.status === "not-found") {
    return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  }
  if (kq.status === "conflict") {
    return NextResponse.json({ error: kq.message, loai: kq.loai }, { status: 409 });
  }
  return NextResponse.json({ version: kq.version, libId: kq.libId });
}
