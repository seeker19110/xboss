import { NextRequest, NextResponse } from "next/server";
import { processIncomingTelegramMessage } from "@/lib/ky-thuat/engineering-site-bot";

export const dynamic = "force-dynamic";

// POST /api/telegram/webhook
// Endpoint nhận webhook trực tiếp từ Telegram Bot API
export async function POST(req: NextRequest) {
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
