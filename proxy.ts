import { type NextRequest, NextResponse } from 'next/server';

// Middleware chạy Edge Runtime — chỉ intercept /api/ (trừ chính endpoint traffic/ingest).
// Fire-and-forget POST đến ingest để ghi ring buffer trong Node.js runtime.
// Không await → không làm trễ request gốc.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Bỏ qua endpoint ingest để tránh vòng lặp vô hạn và các route traffic
  if (!path.startsWith('/api/admin/traffic/')) {
    const ingestUrl = new URL('/api/admin/traffic/ingest', req.url);
    fetch(ingestUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: req.method,
        path,
        ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '',
        ua: req.headers.get('user-agent') ?? '',
        ts: Date.now(),
      }),
    }).catch(() => {});
  }
  return NextResponse.next();
}

export const config = {
  // Chỉ intercept các API route — bỏ qua static file, _next/image, favicon...
  matcher: ['/api/:path*'],
};
