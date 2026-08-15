import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-keys";
import {
  agentSessionInputSchema,
  openAgentSession,
  getAgentSession,
  AgentSessionError,
} from "@/lib/engineering-agents";

export const dynamic = "force-dynamic";

// POST /api/v1/engineering/agent-sessions — mở 1 phiên phối hợp đa agent (ENG-4).
// Server tự chạy DETECT → CLASSIFY (§18 bước 1–2), tạo bản ghi xung đột và tính mức đồng
// thuận; trả về kèm đề xuất phân xử cho từng xung đột.
//
// RANH GIỚI: kết quả phiên là KẾ HOẠCH ĐÃ HOÀ GIẢI, không phải lệnh thực thi. Muốn có tác
// động thật phải tạo workflow ENG-3 và đi qua đủ cửa duyệt — route này không tạo/duyệt
// workflow, không ghi boq_items/payment_bills/tasks.
export async function POST(req: NextRequest) {
  const ctx = await requireApiKey(req, "engineering");
  if (ctx instanceof Response) return ctx;
  const { auth, projectId } = ctx;

  const parsed = agentSessionInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `${issue?.path?.join(".") ?? "body"}: ${issue?.message ?? "không hợp lệ"}` },
      { status: 422 },
    );
  }

  try {
    const { sessionId } = await openAgentSession(projectId, auth.keyId, parsed.data);
    const detail = await getAgentSession(projectId, sessionId);
    return NextResponse.json(detail, { status: 201 });
  } catch (err) {
    if (err instanceof AgentSessionError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
