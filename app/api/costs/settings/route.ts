import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCostSettings, updateCostSettings } from "@/lib/cost";

export const dynamic = "force-dynamic";

// GET /api/costs/settings — ngưỡng cảnh báo (Admin/PM/BCH xem).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem chi phí" }, { status: 403 });

  return NextResponse.json(await getCostSettings());
}

// PATCH /api/costs/settings — đổi ngưỡng cảnh báo (chỉ Admin/PM).
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa ngưỡng cảnh báo" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const warnPct = Number(body?.warnPct);
  const overPct = Number(body?.overPct);
  if (
    !Number.isFinite(warnPct) ||
    !Number.isFinite(overPct) ||
    warnPct <= 0 ||
    overPct < warnPct ||
    overPct > 1000
  )
    return NextResponse.json(
      { error: "Ngưỡng không hợp lệ (0 < cảnh báo ≤ vượt ≤ 1000)" },
      { status: 422 },
    );

  await updateCostSettings({ warnPct, overPct });
  return NextResponse.json({ ok: true });
}
