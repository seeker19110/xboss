// Xác thực webhook ĐI VÀO (V1 — đợt "nâng tầm" 2026-08-24).
//
// Khác hẳn lib/bao-mat/webhooks.ts (webhook ĐI RA — XBoss ký rồi POST tới hệ ngoài): file này
// kiểm chữ ký của bên thứ ba POST VÀO XBoss (Telegram Bot API, Zalo OA). Trước đợt này cả hai
// route /api/telegram/webhook và /api/zalo/webhook đều nhận POST công khai không kiểm gì —
// ai cũng giả được tin nhắn hiện trường.
//
// FAIL-FAST: thiếu biến môi trường bí mật → throw ngay (cùng tinh thần CRON_SECRET/
// XBOSS_SECRET). Đọc env LAZY trong thân hàm, không ở top-level, để `next build` vẫn chạy
// được khi chưa cấu hình (xem ghi chú thiết kế trong lib/nen/env.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

// Chỉ cần đọc header — khai kiểu theo cấu trúc thay vì buộc `NextRequest`, để test dựng được
// bằng `new Request(...)` thuần, không phải dựng cả đối tượng request của Next. NextRequest
// thoả kiểu này nên route gọi thẳng `xacThucWebhookTelegram(req)` không cần ép kiểu.
export type YeuCauCoHeader = { headers: { get(name: string): string | null } };

const HEADER_TELEGRAM = "x-telegram-bot-api-secret-token";
// Zalo OA gửi chữ ký ở `X-ZEvent-Signature`; chấp nhận thêm tên rút gọn `X-Zalo-Signature`
// cho các cấu hình proxy/gateway đặt lại tên header.
const HEADER_ZALO = ["x-zevent-signature", "x-zalo-signature"];

function docBiMat(ten: string): string {
  const giaTri = process.env[ten];
  if (!giaTri) {
    throw new Error(
      `Thiếu biến môi trường ${ten} — không thể xác thực webhook đi vào. ` +
        `Cấu hình biến này trước khi bật webhook (xem mục "Biến môi trường quan trọng" trong CLAUDE.md).`,
    );
  }
  return giaTri;
}

// So chuỗi constant-time; độ dài lệch → false ngay (timingSafeEqual throw khi khác độ dài).
function soBang(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Telegram Bot API: khi đăng ký webhook bằng `setWebhook(..., secret_token=...)`, mọi update
 * Telegram gửi tới đều kèm header `X-Telegram-Bot-Api-Secret-Token` mang đúng chuỗi đó.
 * Thiếu/sai header → route trả 401 và KHÔNG đọc body, KHÔNG ghi DB.
 */
export function xacThucWebhookTelegram(req: YeuCauCoHeader): boolean {
  const biMat = docBiMat("TELEGRAM_WEBHOOK_SECRET");
  const nhan = req.headers.get(HEADER_TELEGRAM);
  if (!nhan) return false;
  return soBang(nhan, biMat);
}

/**
 * Zalo OA: chữ ký HMAC-SHA256 (hex) của **raw body** với khoá `ZALO_OA_SECRET`.
 *
 * QUAN TRỌNG — vì sao route phải truyền `rawBody` chứ không phải object đã parse: chữ ký tính
 * trên đúng chuỗi byte bên gửi đã ký. `req.json()` rồi `JSON.stringify()` lại sẽ đổi thứ tự
 * khoá/khoảng trắng/escape unicode nên HMAC lệch. Route đọc `await req.text()` một lần rồi tự
 * `JSON.parse` — đây cũng là cách tối thiểu nhất trong App Router (body chỉ đọc được 1 lần).
 *
 * Chấp nhận tiền tố `mac=`/`sha256=` mà một số cấu hình Zalo/proxy thêm vào giá trị header.
 */
export function xacThucWebhookZalo(req: YeuCauCoHeader, rawBody: string): boolean {
  const biMat = docBiMat("ZALO_OA_SECRET");
  let nhan: string | null = null;
  for (const ten of HEADER_ZALO) {
    nhan = req.headers.get(ten);
    if (nhan) break;
  }
  if (!nhan) return false;
  const chuKy = nhan.trim().replace(/^(mac=|sha256=)/i, "");
  const mongDoi = createHmac("sha256", biMat).update(rawBody, "utf8").digest("hex");
  return soBang(chuKy.toLowerCase(), mongDoi);
}
