import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { confirmPairing } from "@/lib/bao-mat/api-tokens";

export const dynamic = "force-dynamic";

// POST /api/devices/pair/confirm { deviceCode } — người dùng duyệt ghép thiết bị trên web
// (M99 PR2, phiên đăng nhập thường). Token phát ra sẽ mang ĐÚNG quyền user duyệt, nên chỉ
// vai trò được thao tác bản vẽ (CAN.manageDrawings: admin/pm/engineer) mới duyệt được.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền ghép thiết bị plugin (cần quyền thao tác bản vẽ)" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const deviceCode = typeof body?.deviceCode === "string" ? body.deviceCode.trim() : "";
  if (!deviceCode) return NextResponse.json({ error: "Thiếu mã ghép" }, { status: 400 });

  const kq = await confirmPairing(deviceCode, user.id);
  if (!kq) {
    return NextResponse.json(
      { error: "Mã ghép không tồn tại, đã hết hạn hoặc đã được duyệt" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, deviceName: kq.deviceName });
}
