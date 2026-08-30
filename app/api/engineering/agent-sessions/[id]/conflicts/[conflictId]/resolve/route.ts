import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  resolveConflict,
  RESOLUTION_METHODS,
  AgentSessionError,
  VoteNotAllowedError,
  type ResolutionMethod,
} from "@/lib/ky-thuat/engineering-agents";

export const dynamic = "force-dynamic";

// POST .../conflicts/:conflictId/resolve { resolution, method, lowRiskPreference? } —
// người có thẩm quyền chốt 1 xung đột. Bắt buộc khai PHƯƠNG PHÁP đi tới kết luận (§19);
// 'preference_vote' bị chặn cứng bởi assertVoteAllowed ở tầng lib (403 khi vi phạm).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; conflictId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.resolveEngineeringConflicts(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được chốt xung đột" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const resolution = typeof body?.resolution === "string" ? body.resolution.trim() : "";
  const method = body?.method as ResolutionMethod | undefined;
  if (!resolution) return NextResponse.json({ error: "Thiếu nội dung kết luận" }, { status: 422 });
  if (!method || !(RESOLUTION_METHODS as readonly string[]).includes(method))
    return NextResponse.json(
      { error: `method phải là một trong: ${RESOLUTION_METHODS.join(", ")}` },
      { status: 422 },
    );

  const { id, conflictId } = await params;
  try {
    await resolveConflict(projectId, id, conflictId, user.id, resolution, method, {
      lowRiskPreference: body?.lowRiskPreference === true,
    });
  } catch (err) {
    if (err instanceof VoteNotAllowedError)
      return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof AgentSessionError)
      return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
