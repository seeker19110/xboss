import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { sheetVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

const CHECK_MS = 3_000; // chu kỳ kiểm tra watermark
const REFRESH_EVERY = 10; // ~30s gửi lại version 1 lần (bắt kịp client bỏ lỡ lúc đang edit)

// Đếm số SSE stream đang mở (M53 PR1) — module-level, chỉ đúng trong phạm vi 1 process
// (chạy nhiều instance thì mỗi instance tự đếm số của nó, /api/health trả số riêng —
// chấp nhận được, xem docs/nang-cap/M53-scale-headroom.md PR4).
let openStreams = 0;

/** Getter cho GET /api/health (Admin/PM) — số SSE stream đang mở trên process này. */
export function getOpenStreamCount(): number {
  return openStreams;
}

// GET /api/events?sheet= → SSE stream: đẩy event `version` khi sheet đổi watermark.
// Client (trang tracking) nghe để reload ngay ~3s thay vì poll 10s.
// Lưu ý môi trường serverless (Vercel) giới hạn thời gian function — kết nối bị cắt
// thì EventSource phía client tự fallback về polling.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const sheet = req.nextUrl.searchParams.get("sheet");
  if (!sheet) return new Response("Thiếu tham số sheet", { status: 400 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  // Chia sẻ giữa start()/cancel() để không đếm trừ 2 lần khi cả abort lẫn cancel cùng bắn
  // (client ngắt kết nối đột ngột có thể trigger cả hai).
  let closed = false;
  let counted = false;

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      let tick = 0;
      openStreams++;
      counted = true;
      const close = () => {
        if (closed) return;
        closed = true;
        if (counted) {
          openStreams--;
          counted = false;
        }
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* đã đóng */
        }
      };
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
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
        } catch {
          /* DB chập chờn — thử lại chu kỳ sau */
        }
      };

      await check();
      timer = setInterval(check, CHECK_MS);
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      if (timer) clearInterval(timer);
      closed = true;
      if (counted) {
        openStreams--;
        counted = false;
      }
    },
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
