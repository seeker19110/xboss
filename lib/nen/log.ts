// Structured logging (M44 PR3): mỗi lời gọi in ra 1 dòng — production in JSON thô (pm2 gom
// stdout, log aggregator/Sentry breadcrumb parse trực tiếp), dev pretty-print có màu cho dễ
// đọc khi chạy `npm run dev`. requestId/userId tự đọc từ ngữ cảnh request hiện tại
// (lib/request-context.ts, M43) nếu có — KHÔNG throw khi thiếu (script CLI, test unit, code
// chạy ngoài request scope vẫn gọi được bình thường, chỉ là thiếu 2 trường đó).
import { getRequestContext } from "@/lib/nen/request-context";

type Level = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

// C4 §6 (quality/security gate) — "Log redaction scan: secret/token/password/raw sensitive
// payload không xuất hiện". Trước bản vá này, `write()` spread thẳng `fields` vào JSON không
// lọc gì — 1 field đặt tên `password`/`token`/`secret`, hoặc message lỗi vô tình echo lại
// connection string/Authorization header (đã thấy thật ở app/api/auth/oidc/callback/route.ts:
// `e.message` của thư viện `openid-client` khi đổi token lỗi có thể mang theo token/JWT), là
// bay thẳng vào log production — pm2/log aggregator giữ log lâu dài, không phải chỗ nên có bí
// mật. Hai lớp lọc, áp cho MỌI lời gọi (không phải opt-in ở call site — call site không nên
// phải nhớ "đừng log secret", nên phải chặn ở lớp ghi log):
//
//  1. Theo TÊN TRƯỜNG: field nào khớp `SENSITIVE_KEY_RE` → thay nguyên giá trị bằng
//     "[REDACTED]" (đệ quy vào object/mảng lồng nhau).
//  2. Theo GIÁ TRỊ chuỗi: dù tên trường không đáng ngờ, quét vài dạng bí mật CỤ THỂ hay gặp
//     trong message lỗi — mật khẩu trong connection string Postgres, header/chuỗi `Bearer
//     <token>`, API key thô `xbk_...` (lib/api-keys.ts), chuỗi dạng JWT (OIDC). CỐ Ý bó hẹp
//     vào các dạng biết trước thay vì dò entropy chung chung (kiểu gitleaks) — dò chung dễ
//     báo nhầm số điện thoại/mã hợp đồng dài thành "bí mật", làm log mất tác dụng.
const SENSITIVE_KEY_RE =
  /pass(word)?|secret|token|api[_-]?key|authoriz(e|ation)|cookie|private[_-]?key|credential/i;

const REDACTED = "[REDACTED]";
const MAX_REDACT_DEPTH = 6; // chặn đệ quy vô hạn nếu field lỡ mang object có tham chiếu vòng sâu

function redactSecretPatterns(s: string): string {
  return s
    .replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+(@)/gi, `$1${REDACTED}$2`)
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(/\bxbk_[0-9a-fA-F]{16,}/g, REDACTED)
    .replace(/\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, REDACTED); // chuỗi dạng JWT (header.payload.sig)
}

function redactValue(key: string, v: unknown, depth: number): unknown {
  if (SENSITIVE_KEY_RE.test(key)) return v === undefined ? v : REDACTED;
  if (depth >= MAX_REDACT_DEPTH) return v;
  if (typeof v === "string") return redactSecretPatterns(v);
  if (Array.isArray(v)) return v.map((x) => redactValue(key, x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = redactValue(k, val, depth + 1);
    return out;
  }
  return v;
}

function redactFields(fields: LogFields | undefined): LogFields | undefined {
  if (!fields) return fields;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = redactValue(k, v, 0);
  return out;
}

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
    // msg thường là chuỗi tĩnh do lập trình viên viết ("GET /api/x lỗi"), nhưng vẫn quét
    // theo GIÁ TRỊ để an toàn — không có gì đảm bảo mãi mãi không ai nối message lỗi thư
    // viện ngoài (như openid-client) thẳng vào đây thay vì qua field `err`.
    msg: redactSecretPatterns(msg),
    ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx?.userId != null ? { userId: ctx.userId } : {}),
    ...redactFields(fields),
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
