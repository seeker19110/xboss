import { NextRequest, NextResponse } from "next/server";
import { processIncomingZaloMessage } from "@/lib/engineering-zalo-copilot";

export const dynamic = "force-dynamic";

// GET /api/zalo/webhook (Verification for Zalo Webhook setup)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("challenge") || "ok";
  return NextResponse.json({ challenge });
}

// POST /api/zalo/webhook
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = Number(body.projectId || 1);
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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
