import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
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
  // Không tin project_id client gửi — trước đây `(user as any).projectId` không tồn tại trên
  // kiểu User nên biểu thức luôn rơi về giá trị client gửi qua query string (đọc chéo dự án).
  const chotDuAn = await chotProjectIdChoGhi(
    user,
    searchParams.get("projectId"),
    (await getCurrentProjectId(user)) || 1,
  );
  if (!chotDuAn.ok)
    return NextResponse.json({ error: "Không có quyền xem dự án này" }, { status: 403 });
  const projectId = chotDuAn.projectId;

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
    // Không tin project_id client gửi (cùng lỗi B1 như GET ở trên).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok)
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    const projectId = chotDuAn.projectId;
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
