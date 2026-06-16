import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRecent, subscribeTraffic, latestId } from '@/lib/traffic';

export const dynamic = 'force-dynamic';

// GET /api/admin/traffic/events  — SSE stream, chỉ Admin.
// Gửi snapshot ban đầu rồi đẩy từng entry mới khi chúng đến.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return new Response('Không có quyền', { status: 403 });
  }

  const sinceParam = req.nextUrl.searchParams.get('since');
  const since = sinceParam ? parseInt(sinceParam, 10) : undefined;

  const encoder = new TextEncoder();
  let unsub: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        unsub?.();
        try { controller.close(); } catch { /* đã đóng */ }
      };

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { close(); }
      };

      // Gửi ngay các entry đã có (nếu client reconnect với ?since=)
      const initial = getRecent(since);
      if (initial.length) send({ entries: initial, latestId: latestId() });

      // Đẩy từng entry mới khi có
      unsub = subscribeTraffic(entry => send({ entries: [entry], latestId: entry.id }));

      // Ping giữ kết nối mỗi 20s
      const ping = setInterval(() => {
        if (closed) { clearInterval(ping); return; }
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { close(); clearInterval(ping); }
      }, 20_000);

      req.signal.addEventListener('abort', () => { clearInterval(ping); close(); });
    },
    cancel() { unsub?.(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
