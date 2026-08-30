import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/bao-mat/api-keys";
import {
  agentClaimInputSchema,
  addClaims,
  AgentSessionError,
} from "@/lib/ky-thuat/engineering-agents";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ claims: z.array(agentClaimInputSchema).min(1).max(200) });

// POST /api/v1/engineering/agent-sessions/:id/claims — thêm claim vòng sau.
//
// Vượt max_rounds mà vẫn còn xung đột → phiên chốt 'no_consensus' và đóng lại. Đây là KẾT
// QUẢ HỢP LỆ (§21/§22 "không ép consensus giả") nên trả 200 kèm cờ `closed`, KHÔNG phải lỗi.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiKey(req, "engineering");
  if (ctx instanceof Response) return ctx;
  const { projectId } = ctx;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `${issue?.path?.join(".") ?? "body"}: ${issue?.message ?? "không hợp lệ"}` },
      { status: 422 },
    );
  }

  const { id } = await params;
  try {
    const result = await addClaims(projectId, id, parsed.data.claims);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AgentSessionError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
