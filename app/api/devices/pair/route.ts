import { NextRequest, NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { createPairing, cleanupExpiredPairings } from "@/lib/bao-mat/api-tokens";

export const dynamic = "force-dynamic";

// IP client — cùng quy ước header proxy như app/api/auth/login/route.ts.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/devices/pair — plugin AutoCAD xin mã ghép thiết bị (M99 PR2, chưa đăng nhập).
// Trả { deviceCode (hiện cho người dùng gõ trên web), deviceSecret (CHỈ plugin giữ,
// dùng để poll nhận token), expiresIn }. Rate limit theo IP chống spam tạo phiên ghép.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await hitRateLimit(`pair:${ip}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn tạo mã ghép — thử lại sau" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const deviceName = typeof body?.deviceName === "string" ? body.deviceName.trim() : "";

  const pairing = await createPairing(deviceName);
  // Dọn phiên ghép hết hạn từ lâu — lấy mẫu xác suất thấp, không thêm round-trip mỗi lần.
  if (Math.random() < 0.05) await cleanupExpiredPairings();
  return NextResponse.json(pairing);
}
