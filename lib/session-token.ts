// Cookie phiên (stateless, ký HMAC) — tách khỏi lib/auth.ts để proxy.ts (Proxy/Middleware
// của Next 16 LUÔN chạy Node.js runtime) import được hàm ký/verify token mà KHÔNG kéo theo
// next/headers hoặc lib/db (pg). Module thuần node:crypto, không phụ thuộc runtime web.
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "xboss_session";
const SESSION_DAYS = 7;
export const COOKIE_MAX_AGE = SESSION_DAYS * 86400;

// Fallback chỉ dành cho dev — production bắt buộc đặt XBOSS_SECRET, nếu không ai cũng có
// thể tự ký cookie phiên (kể cả phiên admin). Kiểm tra lúc dùng (không phải lúc import)
// để next build không cần secret.
function getSecret(): string {
  const s = process.env.XBOSS_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("XBOSS_SECRET chưa được cấu hình — bắt buộc khi chạy production.");
  return "xboss-dev-secret-change-me";
}

export function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

// Token phiên: `userId.exp.pwFrag.flag.HMAC(userId.exp.pwFrag.flag)`
// - pwFrag = 12 ký tự đầu password_hash — đổi mật khẩu là token cũ tự hết hiệu lực.
// - flag = "1" nếu tài khoản BẮT BUỘC bật 2FA nhưng CHƯA bật (mustSetup2fa), "0" nếu không.
//   flag nằm TRONG phần được ký nên không thể giả mạo bằng cách sửa cookie tay (M56 PR2 —
//   proxy.ts đọc flag để chặn mọi API ngoài /api/auth/* khi flag = "1", không cần chạm DB).
export function makeToken(userId: number, passwordHash: string, mustSetup2fa: boolean): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const pwFrag = passwordHash.slice(0, 12);
  const flag = mustSetup2fa ? "1" : "0";
  const payload = `${userId}.${exp}.${pwFrag}.${flag}`;
  return `${payload}.${sign(payload)}`;
}

export type ParsedToken = { uid: number; pwFrag: string; mustSetup2fa: boolean };

export function parseToken(token: string): ParsedToken | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [uid, exp, pwFrag, flag, mac] = parts;
  // Chỉ chấp nhận flag "0"/"1" — chặn nhầm token tạm "chờ 2FA" (makeTotpPendingToken cũng
  // 5 phần, phần thứ 4 = "2fa") bị dùng làm cookie phiên.
  if (flag !== "0" && flag !== "1") return null;
  const expected = Buffer.from(sign(`${uid}.${exp}.${pwFrag}.${flag}`), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(mac, "hex");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(exp) < Date.now()) return null;
  return { uid: Number(uid), pwFrag, mustSetup2fa: flag === "1" };
}
