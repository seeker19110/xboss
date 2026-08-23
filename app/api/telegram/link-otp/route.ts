import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { generateTelegramLinkOtp } from "@/lib/ky-thuat/engineering-site-bot";

export const dynamic = "force-dynamic";

// POST /api/telegram/link-otp
// Sinh mã OTP 6 số để liên kết tài khoản Telegram với tài khoản XBoss
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const otp = await generateTelegramLinkOtp(user.id);
    return NextResponse.json({
      success: true,
      otp,
      expiresInMinutes: 15,
      instruction: `Mở Telegram Bot và gửi tin nhắn: /link ${otp}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
