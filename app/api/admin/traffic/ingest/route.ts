import { NextRequest, NextResponse } from "next/server";
import { recordTraffic } from "@/lib/bao-mat/traffic";
import { safeEqual } from "@/lib/bao-mat/auth";
import { TRAFFIC_TOKEN_HEADER, trafficToken } from "@/lib/bao-mat/traffic-token";

export const dynamic = "force-dynamic";

/** Số entry tối đa trong 1 lô (proxy gom ≤50/lô; chừa dư địa). */
const MAX_BATCH = 200;

type Raw = {
  method?: string;
  path?: string;
  ip?: string;
  ua?: string;
  ts?: number;
  orgId?: unknown;
};

// Ghi 1 entry; trả false nếu thiếu method/path (không ghi).
function ghi(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const { method, path, ip, ua, ts, orgId } = body as Raw;
  if (!method || !path) return false;
  recordTraffic({
    // Cắt độ dài phòng thủ chiều sâu (ring buffer 500 dòng hiển thị cho admin).
    method: String(method).toUpperCase().slice(0, 16),
    path: String(path).slice(0, 512),
    ip: String(ip ?? "").slice(0, 64),
    ua: String(ua ?? "").slice(0, 512),
    ts: Number(ts ?? Date.now()),
    // S02e: org do proxy suy từ cookie phiên đã ký; giá trị lạ → ẩn danh (không hiện cho ai).
    orgId: Number.isSafeInteger(orgId) && (orgId as number) > 0 ? (orgId as number) : null,
  });
  return true;
}

// POST /api/admin/traffic/ingest
// Được gọi fire-and-forget từ proxy (Node.js) để ghi vào ring buffer. Body là 1 object
// hoặc 1 mảng (≤200 phần tử — proxy gom lô); phần tử thiếu method/path trong mảng bị bỏ.
// Xác thực bằng HMAC riêng cho traffic (không gửi XBOSS_SECRET) — endpoint reachable
// công khai nên cần chặn POST giả bơm dữ liệu rác vào ring buffer.
export async function POST(req: NextRequest) {
  if (!safeEqual(req.headers.get(TRAFFIC_TOKEN_HEADER) ?? "", trafficToken()))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body: unknown = await req.json();
    if (Array.isArray(body)) {
      if (body.length === 0 || body.length > MAX_BATCH)
        return NextResponse.json({ ok: false }, { status: 400 });
      let n = 0;
      for (const e of body) if (ghi(e)) n++;
      if (n === 0) return NextResponse.json({ ok: false }, { status: 400 });
      return NextResponse.json({ ok: true, recorded: n });
    }
    if (!ghi(body)) return NextResponse.json({ ok: false }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
