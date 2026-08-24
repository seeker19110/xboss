import { NextRequest, NextResponse } from "next/server";
import { processIncomingTelegramMessage } from "@/lib/ky-thuat/engineering-site-bot";
import { TELEGRAM_SECRET_HEADER, checkTelegramWebhook } from "@/lib/bao-mat/webhook-auth";

export const dynamic = "force-dynamic";

// POST /api/telegram/webhook
// Endpoint nhận webhook trực tiếp từ Telegram Bot API.
// Xác thực: header secret_token đã khai lúc setWebhook (xem lib/bao-mat/webhook-auth.ts).
// Không có secret hợp lệ thì không xử lý — endpoint này ghi DB và thao tác thay người dùng
// đã liên kết, để mở sẽ cho phép giả mạo chat_id bất kỳ.
export async function POST(req: NextRequest) {
  const auth = checkTelegramWebhook(req.headers.get(TELEGRAM_SECRET_HEADER));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const message = body.message || body.channel_post;

    if (!message || !message.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    let rawText = message.text || message.caption || "";
    let messageType: "text" | "photo" | "voice" | "document" = "text";

    if (message.photo) {
      messageType = "photo";
      if (!rawText) rawText = "Gửi ảnh hiện trường";
    } else if (message.voice) {
      messageType = "voice";
      if (!rawText) rawText = "Tin nhắn thoại hiện trường";
    }

    const res = await processIncomingTelegramMessage({
      chatId,
      messageType,
      rawText,
      rawPayload: body,
    });

    // Nếu có token bot cấu hình, có thể gọi trực tiếp sendMessage về Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken && res.replyText) {
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: res.replyText,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, data: res });
  } catch (err: unknown) {
    // Không trả err.message ra ngoài (lộ chi tiết nội bộ cho caller ẩn danh) — chỉ ghi log.
    console.error("[telegram/webhook] lỗi xử lý tin nhắn:", err);
    return NextResponse.json({ error: "Lỗi xử lý tin nhắn" }, { status: 500 });
  }
}
