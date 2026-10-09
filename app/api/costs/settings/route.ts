import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCostSettings, updateCostSettings } from "@/lib/tai-chinh/cost";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// GET /api/costs/settings — ngưỡng cảnh báo của TỔ CHỨC người gọi (Admin/PM/BCH xem; S02e).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM/BCH được xem chi phí" }, { status: 403 });

  return NextResponse.json(await getCostSettings(user.orgId));
}

// PATCH /api/costs/settings — đổi ngưỡng cảnh báo của tổ chức người gọi (chỉ Admin/PM).
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

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
  const kq = await ghiNeuConQuyen(
    () => CAN.editStructure(user.role),
    () => updateCostSettings(user.orgId, { warnPct, overPct }),
  );
  if (!kq.ok)
    return NextResponse.json({ error: "Chỉ Admin/PM được sửa ngưỡng cảnh báo" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
