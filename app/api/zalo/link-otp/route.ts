import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { generateZaloLinkOtp, verifyZaloLinkOtp } from "@/lib/ky-thuat/engineering-zalo-copilot";

export const dynamic = "force-dynamic";

// POST /api/zalo/link-otp
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);
    const action = body.action || "generate"; // generate | verify

    if (action === "generate") {
      const zaloUserId = body.zaloUserId || `ZID_${Date.now().toString().slice(-6)}`;
      const otpCode = await generateZaloLinkOtp(
        projectId,
        user.id,
        zaloUserId,
        body.displayName || user.name,
      );
      return NextResponse.json({
        success: true,
        data: { zaloUserId, otpCode, expiresMinutes: 15 },
      });
    }

    if (action === "verify") {
      if (!body.zaloUserId || !body.otpCode) {
        return NextResponse.json({ error: "Thiếu zaloUserId hoặc otpCode" }, { status: 422 });
      }

      const isValid = await verifyZaloLinkOtp(body.zaloUserId, body.otpCode);
      if (!isValid) {
        return NextResponse.json({ error: "Mã OTP không hợp lệ hoặc đã hết hạn" }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: "Liên kết tài khoản Zalo thành công" });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
