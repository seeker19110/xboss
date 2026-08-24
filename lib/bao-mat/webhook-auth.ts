import { safeEqual } from "@/lib/bao-mat/auth";

// Xác thực webhook đến từ nhà cung cấp ngoài (Telegram/Zalo). Hai endpoint này ghi
// thẳng vào DB (log tin nhắn, dispatch hành động hiện trường) nên KHÔNG được để mở:
// trước đây ai cũng POST được, tự chọn projectId/chatId → bơm dữ liệu giả, vượt RLS.
//
// Mặc định AN TOÀN: thiếu biến môi trường secret → webhook bị TẮT (trả 503), không
// mở toang. Cùng tinh thần fail-fast của CRON_SECRET/XBOSS_SECRET.

export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";
export const ZALO_SECRET_HEADER = "x-zalo-webhook-secret";

export type WebhookAuth = { ok: true } | { ok: false; status: 401 | 503; error: string };

function checkSecret(provided: string | null, expected: string | undefined): WebhookAuth {
  if (!expected)
    return {
      ok: false,
      status: 503,
      error: "Webhook chưa được cấu hình secret trên máy chủ — endpoint đang tắt",
    };
  if (!provided || !safeEqual(provided, expected))
    return { ok: false, status: 401, error: "Sai secret webhook" };
  return { ok: true };
}

// Telegram gửi lại đúng chuỗi đã khai lúc setWebhook(secret_token) qua header này.
export function checkTelegramWebhook(header: string | null): WebhookAuth {
  return checkSecret(header, process.env.TELEGRAM_WEBHOOK_SECRET);
}

export function checkZaloWebhook(header: string | null): WebhookAuth {
  return checkSecret(header, process.env.ZALO_WEBHOOK_SECRET);
}
