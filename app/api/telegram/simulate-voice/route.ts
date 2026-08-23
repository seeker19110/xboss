import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import {
  processIncomingTelegramMessage,
  listTelegramMessageLogs,
} from "@/lib/ky-thuat/engineering-site-bot";

export const dynamic = "force-dynamic";

// GET /api/telegram/simulate-voice
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);

  try {
    const logs = await listTelegramMessageLogs(projectId, 50);
    return NextResponse.json({ success: true, data: logs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/telegram/simulate-voice
// Cho phép Kỹ sư thử nghiệm gửi lệnh giọng nói/text giả lập từ Web UI
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = await req.json();
    const rawText = body.text || "";
    const projectId = Number(body.projectId || (user as any).projectId || 1);
    const mockChatId = 88880000 + user.id;

    // Tự động đảm bảo binding cho user đang test
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO telegram_user_bindings (user_id, telegram_chat_id, telegram_username, is_verified)
       VALUES (?, ?, 'web_simulator_user', true)
       ON CONFLICT (telegram_chat_id) DO UPDATE SET is_verified = true`,
      user.id,
      mockChatId,
    );

    const res = await processIncomingTelegramMessage({
      chatId: mockChatId,
      messageType: body.messageType || "text",
      rawText,
      projectId,
    });

    return NextResponse.json({ success: true, data: res });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
