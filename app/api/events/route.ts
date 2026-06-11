import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sheetVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

const CHECK_MS = 3_000;       // chu kỳ kiểm tra watermark
const REFRESH_EVERY = 10;     // ~30s gửi lại version 1 lần (bắt kịp client bỏ lỡ lúc đang edit)

// GET /api/events?sheet= → SSE stream: đẩy event `version` khi sheet đổi watermark.
// Client (trang tracking) nghe để reload ngay ~3s thay vì poll 10s.
// Lưu ý môi trường serverless (Vercel) giới hạn thời gian function — kết nối bị cắt
// thì EventSource phía client tự fallback về polling.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });

  const sheet = req.nextUrl.searchParams.get("sheet");
  if (!sheet) return new Response("Thiếu tham số sheet", { status: 400 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      let tick = 0;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* đã đóng */ }
      };
      const send = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { close(); }
      };
      const check = async () => {
        if (closed) return;
        tick++;
        try {
          const v = await sheetVersion(sheet);
          if (v !== last || tick % REFRESH_EVERY === 0) {
            last = v;
            send(`event: version\ndata: ${JSON.stringify({ v })}\n\n`);
          } else {
            send(`: ping\n\n`); // comment SSE giữ kết nối qua proxy
          }
        } catch { /* DB chập chờn — thử lại chu kỳ sau */ }
      };

      await check();
      timer = setInterval(check, CHECK_MS);
      req.signal.addEventListener("abort", close);
    },
    cancel() { if (timer) clearInterval(timer); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: không buffer SSE
    },
  });
}
