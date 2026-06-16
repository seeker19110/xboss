import { NextRequest, NextResponse } from 'next/server';
import { recordTraffic } from '@/lib/traffic';

export const dynamic = 'force-dynamic';

// POST /api/admin/traffic/ingest
// Được gọi fire-and-forget từ middleware (Edge) để ghi vào ring buffer (Node.js).
// Không cần auth vì chỉ nhận từ loopback — không expose dữ liệu, chỉ ghi.
export async function POST(req: NextRequest) {
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
