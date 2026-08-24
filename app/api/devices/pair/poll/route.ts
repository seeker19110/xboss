import { NextRequest, NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { pollPairing } from "@/lib/bao-mat/api-tokens";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/devices/pair/poll { deviceCode, deviceSecret } — plugin poll chờ người dùng
// duyệt trên web (M99 PR2). Token CHỈ sinh tại lần poll đầu tiên sau khi confirmed và
// trả thô đúng 1 lần; poll tiếp = 404. Secret sai/mã hết hạn → 404 (không lộ mã nào tồn
// tại); rate limit theo IP đủ rộng cho poll 3s/lần nhưng chặn dò secret.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await hitRateLimit(`pair-poll:${ip}`, 400, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn poll — thử lại sau" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await req.json().catch(() => null);
  const deviceCode = typeof body?.deviceCode === "string" ? body.deviceCode : "";
  const deviceSecret = typeof body?.deviceSecret === "string" ? body.deviceSecret : "";
  if (!deviceCode || !deviceSecret) {
    return NextResponse.json({ error: "Thiếu deviceCode/deviceSecret" }, { status: 400 });
  }

  const kq = await pollPairing(deviceCode, deviceSecret);
  if (kq.status === "not_found") {
    return NextResponse.json(
      { error: "Mã ghép không tồn tại, đã hết hạn hoặc token đã được nhận" },
      { status: 404 },
    );
  }
  return NextResponse.json(kq);
}
