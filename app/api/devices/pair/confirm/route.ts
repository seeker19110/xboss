import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { confirmPairing } from "@/lib/bao-mat/cad-devices";

export const dynamic = "force-dynamic";

// POST /api/devices/pair/confirm { userCode, approve } — kỹ sư duyệt/từ chối mã ghép trên web
// (M99 PR2). Session thường + CAN.manageDrawings (admin/pm/engineer) — token thiết bị sinh ra
// sẽ mang danh chính người duyệt, quyền đi theo vai trò của họ.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền ghép thiết bị AutoCAD" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const userCode = String(body?.userCode ?? "").trim();
  const approve = body?.approve !== false; // mặc định duyệt; { approve: false } = từ chối
  if (!userCode || userCode.length > 20) {
    return NextResponse.json({ error: "Thiếu hoặc sai userCode" }, { status: 400 });
  }

  const kq = await confirmPairing(userCode, user, approve);
  switch (kq) {
    case "ok":
      return NextResponse.json({
        ok: true,
        message: approve
          ? "Đã duyệt — quay lại AutoCAD, plugin sẽ tự nhận token trong vài giây."
          : "Đã từ chối mã ghép.",
      });
    case "het-han":
      return NextResponse.json(
        { error: "Mã ghép đã hết hạn — chạy lại XBOSS_LOGIN trong AutoCAD để lấy mã mới" },
        { status: 410 },
      );
    case "da-xu-ly":
      return NextResponse.json({ error: "Mã ghép này đã được xử lý trước đó" }, { status: 409 });
    default:
      return NextResponse.json({ error: "Không tìm thấy mã ghép" }, { status: 404 });
  }
}
