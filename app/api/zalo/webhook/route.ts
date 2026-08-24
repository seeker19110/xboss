import { NextRequest, NextResponse } from "next/server";
import { processIncomingZaloMessage } from "@/lib/ky-thuat/engineering-zalo-copilot";
import { ZALO_SECRET_HEADER, checkZaloWebhook } from "@/lib/bao-mat/webhook-auth";

export const dynamic = "force-dynamic";

// GET /api/zalo/webhook — bước xác minh lúc cấu hình webhook bên Zalo (chỉ vọng lại
// challenge, không chạm DB nên để mở được).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("challenge") || "ok";
  return NextResponse.json({ challenge });
}

// POST /api/zalo/webhook
// Xác thực bằng header secret dùng chung (xem lib/bao-mat/webhook-auth.ts): route này
// ghi zalo_site_message_logs + zalo_field_action_dispatches theo projectId lấy từ body,
// để mở thì bất kỳ ai cũng bơm được dữ liệu vào dự án bất kỳ (vượt phạm vi RLS).
export async function POST(req: NextRequest) {
  const auth = checkZaloWebhook(req.headers.get(ZALO_SECRET_HEADER));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const projectId = Number(body.projectId ?? 1);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });
    }
    const zaloUserId = body.sender?.id || body.zaloUserId || "ZALO_DEMO_USER";
    const messageText = body.message?.text || body.rawText || "";

    if (!messageText) {
      return NextResponse.json({ error: "Nội dung tin nhắn trống" }, { status: 400 });
    }

    const response = await processIncomingZaloMessage({
      projectId,
      zaloUserId,
      rawText: messageText,
    });

    return NextResponse.json({
      recipient: { id: zaloUserId },
      message: { text: response.replyText },
      metadata: { intent: response.intent, actionDispatched: response.actionDispatched },
    });
  } catch (err: unknown) {
    // Không trả err.message ra ngoài (lộ chi tiết nội bộ cho caller ẩn danh) — chỉ ghi log.
    console.error("[zalo/webhook] lỗi xử lý tin nhắn:", err);
    return NextResponse.json({ error: "Lỗi xử lý tin nhắn" }, { status: 500 });
  }
}
