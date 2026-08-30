import { NextRequest, NextResponse } from "next/server";
import { claimPairing } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";

export const dynamic = "force-dynamic";

// IP client — cùng quy ước header proxy như app/api/auth/login/route.ts.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// POST /api/devices/pair/claim { deviceCode } — plugin poll sau khi kỹ sư duyệt trên web.
// deviceCode là bí mật 32 byte chỉ plugin giữ (DB lưu hash) — nằm trong body POST, không nằm
// trên URL để không lọt access log. Khi đã duyệt: server SINH api key scope {cad} tại đây,
// trả đúng 1 lần; poll lần sau không nhận lại được (claim atomic — M99 PR2).
export async function POST(req: NextRequest) {
  // Plugin poll mỗi 5s trong tối đa 10 phút ≈ 120 lần — trần 300/15' đủ rộng cho ghép thật
  // nhưng vẫn chặn dò deviceCode (entropy 256 bit thì dò là vô vọng, trần này chống spam DB).
  if (await hitRateLimit(`cad-claim:${clientIp(req)}`, 300, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn poll mã ghép — thử lại sau" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = await req.json().catch(() => null);
  const deviceCode = String(body?.deviceCode ?? "").trim();
  if (!/^xdc_[0-9a-f]{64}$/.test(deviceCode)) {
    return NextResponse.json({ error: "deviceCode không hợp lệ" }, { status: 400 });
  }

  const kq = await claimPairing(deviceCode);
  switch (kq.status) {
    case "pending":
      // 202: chưa duyệt — plugin tiếp tục chờ.
      return NextResponse.json({ status: "pending" }, { status: 202 });
    case "ok":
      return NextResponse.json({
        status: "ok",
        key: kq.key, // key thô — lần duy nhất rời server, plugin cất Credential Manager
        expiresAt: kq.expiresAt,
        deviceName: kq.deviceName,
      });
    case "het-han":
      return NextResponse.json(
        { error: "Mã ghép đã hết hạn — chạy lại XBOSS_LOGIN" },
        { status: 410 },
      );
    case "tu-choi":
      return NextResponse.json({ error: "Mã ghép đã bị từ chối trên web" }, { status: 403 });
    default:
      return NextResponse.json({ error: "Không tìm thấy mã ghép" }, { status: 404 });
  }
}
