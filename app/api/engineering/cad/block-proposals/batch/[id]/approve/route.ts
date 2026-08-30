import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { duyetLo, docSuaDong } from "@/lib/ky-thuat/cad/block";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/block-proposals/batch/:id/approve — duyệt lô, phát hành MỘT version.
// Quyền hẹp hơn lúc nạp: chỉ Admin/PM được quyết cái gì vào thư viện (cùng luật M103).
// Route là ranh giới HTTP thuần (ADR-0008): kiểm phiên/quyền, đọc tham số, gọi lib, bọc response.

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role)) {
    return NextResponse.json({ error: "Chỉ Admin/PM được duyệt lô block" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { dong?: unknown };
  const doc = docSuaDong(body.dong);
  if ("loi" in doc) return NextResponse.json({ error: doc.loi }, { status: 400 });

  const kq = await duyetLo({ userId: user.id, loId: id, sua: doc.sua });
  if (kq.status === "not-found") {
    return NextResponse.json({ error: "Không tìm thấy lô" }, { status: 404 });
  }
  if (kq.status === "invalid") return NextResponse.json({ errors: kq.errors }, { status: 422 });
  if (kq.status === "stale") return NextResponse.json({ error: kq.message }, { status: 409 });
  if (kq.status === "idempotent")
    return NextResponse.json({ version: kq.version, idempotent: true });
  return NextResponse.json({ version: kq.version, soBlockThem: kq.soBlockThem }, { status: 201 });
}
