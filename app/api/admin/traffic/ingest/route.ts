import { NextRequest, NextResponse } from 'next/server';
import { recordTraffic } from '@/lib/traffic';
import { safeEqual } from '@/lib/auth';
import { TRAFFIC_TOKEN_HEADER, trafficToken } from '@/lib/traffic-token';

export const dynamic = 'force-dynamic';

// POST /api/admin/traffic/ingest
// Được gọi fire-and-forget từ proxy (Edge) để ghi vào ring buffer (Node.js).
// Xác thực bằng header bí mật nội bộ (token = XBOSS_SECRET) — endpoint reachable
// công khai nên cần chặn POST giả bơm dữ liệu rác vào ring buffer.
export async function POST(req: NextRequest) {
  if (!safeEqual(req.headers.get(TRAFFIC_TOKEN_HEADER) ?? '', trafficToken()))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const { method, path, ip, ua, ts } = body as {
      method?: string; path?: string; ip?: string; ua?: string; ts?: number;
    };
    if (!method || !path) return NextResponse.json({ ok: false }, { status: 400 });
    recordTraffic({
      method: String(method).toUpperCase(),
      path: String(path),
      ip: String(ip ?? ''),
      ua: String(ua ?? ''),
      ts: Number(ts ?? Date.now()),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
