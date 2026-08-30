import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  generateZaloLinkOtp,
  verifyZaloLinkOtp,
  LOI_ZALO_DA_LIEN_KET,
} from "@/lib/ky-thuat/engineering-zalo-copilot";

export const dynamic = "force-dynamic";

// POST /api/zalo/link-otp
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = await req.json();
    // Không tin project_id client gửi — trước đây `(user as any).projectId` không tồn tại
    // trên kiểu User nên biểu thức luôn rơi về giá trị client gửi (bơm OTP vào dự án khác).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok)
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    const projectId = chotDuAn.projectId;
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
    // Zalo ID đang thuộc tài khoản XBoss khác → xung đột tài nguyên, không phải lỗi máy chủ.
    if (msg === LOI_ZALO_DA_LIEN_KET) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
