import { NextRequest, NextResponse } from "next/server";
import { createPairing } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";

export const dynamic = "force-dynamic";

// IP client — cùng quy ước header proxy như app/api/auth/login/route.ts.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/devices/pair { deviceName } — plugin AutoCAD xin mã ghép (M99 PR2, §6.1).
// KHÔNG cần đăng nhập (plugin chưa có gì) → rate limit chặt theo IP như đường login.
export async function POST(req: NextRequest) {
  if (await hitRateLimit(`cad-pair:${clientIp(req)}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn xin mã ghép thiết bị — thử lại sau" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await req.json().catch(() => null);
  const deviceName = String(body?.deviceName ?? "").trim();
  if (!deviceName || deviceName.length > 100) {
    return NextResponse.json(
      { error: "Thiếu hoặc sai deviceName (tối đa 100 ký tự)" },
      { status: 400 },
    );
  }

  const pairing = await createPairing(deviceName);
  return NextResponse.json({
    userCode: pairing.userCode,
    deviceCode: pairing.deviceCode, // bí mật — chỉ trả 1 lần, DB giữ hash
    expiresIn: pairing.expiresInSeconds,
    confirmPath: "/engineering/thiet-bi-cad",
  });
}
