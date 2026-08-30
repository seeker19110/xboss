import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { layLo } from "@/lib/ky-thuat/cad/block";
import { NGUONG_CHON_SAN } from "@/lib/dich-vu/cad";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/block-proposals/batch/:id — chi tiết một lô để dựng bảng duyệt.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem lô block" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  }
  const kq = await layLo(id);
  if (!kq) return NextResponse.json({ error: "Không tìm thấy lô" }, { status: 404 });
  return NextResponse.json({ ...kq, nguongChonSan: NGUONG_CHON_SAN });
}
