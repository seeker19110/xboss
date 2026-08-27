import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { tuChoiLo } from "@/lib/ky-thuat/cad/block-lo";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/block-proposals/batch/:id/reject — từ chối cả lô kèm lý do.

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approve(user.role)) {
    return NextResponse.json({ error: "Chỉ Admin/PM được từ chối lô block" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { lyDo?: unknown };
  const kq = await tuChoiLo({ userId: user.id, loId: id, lyDo: String(body.lyDo ?? "") });
  if (!kq.ok) return NextResponse.json({ error: kq.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
