import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { processIncomingZaloMessage } from "@/lib/engineering-zalo-copilot";

export const dynamic = "force-dynamic";

// POST /api/zalo/simulate-action
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);
    const rawText = body.text || "";
    const zaloUserId = body.zaloUserId || `ZALO_USER_${user.id}`;

    if (!rawText.trim()) {
      return NextResponse.json({ error: "Nội dung tin nhắn không được để trống" }, { status: 400 });
    }

    const result = await processIncomingZaloMessage({
      projectId,
      zaloUserId,
      rawText,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
