// Structured logging (M44 PR3): mỗi lời gọi in ra 1 dòng — production in JSON thô (pm2 gom
// stdout, log aggregator/Sentry breadcrumb parse trực tiếp), dev pretty-print có màu cho dễ
// đọc khi chạy `npm run dev`. requestId/userId tự đọc từ ngữ cảnh request hiện tại
// (lib/request-context.ts, M43) nếu có — KHÔNG throw khi thiếu (script CLI, test unit, code
// chạy ngoài request scope vẫn gọi được bình thường, chỉ là thiếu 2 trường đó).
import { getRequestContext } from "@/lib/request-context";

type Level = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const COLORS: Record<Level, string> = {
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // vàng
  error: "\x1b[31m", // đỏ
};
const RESET = "\x1b[0m";

function consoleFn(level: Level): (...args: unknown[]) => void {
  if (level === "error") return console.error;
  if (level === "warn") return console.warn;
  return console.log;
}

function write(level: Level, msg: string, fields?: LogFields): void {
  const ctx = getRequestContext();
  const entry: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx?.userId != null ? { userId: ctx.userId } : {}),
    ...fields,
  };

  const out = consoleFn(level);

  if (process.env.NODE_ENV === "production") {
    // 1 dòng JSON thô — không pretty-print để log aggregator parse được trực tiếp.
    out(JSON.stringify(entry));
    return;
  }

  // Dev: dòng ngắn dễ đọc + JSON các trường phụ (nếu có) ở cuối, không mất thông tin.
  const { t, level: _lvl, msg: _msg, ...extra } = entry;
  const extraStr = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
  out(`${COLORS[level]}[${level.toUpperCase()}]${RESET} ${t} ${msg}${extraStr}`);
}

/** Structured logger — `log.info/warn/error(msg, fields?)`, xem docs/CLAUDE.md phần Vận hành. */
export const log = {
  info: (msg: string, fields?: LogFields) => write("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};
