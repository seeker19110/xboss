import { NextRequest, NextResponse } from "next/server";
import { recordTraffic } from "@/lib/bao-mat/traffic";
import { safeEqual } from "@/lib/bao-mat/auth";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/bao-mat/traffic-token";

export const dynamic = "force-dynamic";

// POST /api/admin/traffic/ingest
// Được gọi fire-and-forget từ proxy (Node.js) để ghi vào ring buffer.
// Xác thực bằng HMAC riêng cho traffic (không gửi XBOSS_SECRET) — endpoint reachable
// công khai nên cần chặn POST giả bơm dữ liệu rác vào ring buffer.
export async function POST(req: NextRequest) {
  if (!safeEqual(req.headers.get(TRAFFIC_TOKEN_HEADER) ?? "", trafficToken()))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const { method, path, ip, ua, ts, orgId } = body as {
      method?: string;
      path?: string;
      ip?: string;
      ua?: string;
      ts?: number;
      orgId?: unknown;
    };
    if (!method || !path) return NextResponse.json({ ok: false }, { status: 400 });
    recordTraffic({
      method: String(method).toUpperCase(),
      path: String(path),
      ip: String(ip ?? ""),
      ua: String(ua ?? ""),
      ts: Number(ts ?? Date.now()),
      // S02e: org do proxy suy từ cookie phiên đã ký; giá trị lạ → ẩn danh (không hiện cho ai).
      orgId: Number.isSafeInteger(orgId) && (orgId as number) > 0 ? (orgId as number) : null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
