import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { approveGate, WorkflowError } from "@/lib/ky-thuat/engineering-workflow";

export const dynamic = "force-dynamic";

// POST /api/engineering/workflows/:id/gates/:seq { decision, comments? } — ký 1 gate.
// Ngoài CAN.approveEngineeringGate, tầng lib còn kiểm: đúng `required_role` của gate, ký
// tuần tự (không nhảy cóc), và separation of duties (§13) — không dồn hết vào CAN vì các
// luật đó phụ thuộc dữ liệu từng workflow, không phải vai trò tĩnh.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; seq: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.approveEngineeringGate(user.role))
    return NextResponse.json({ error: "Không có quyền ký duyệt gate" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json(
      { error: 'decision phải là "approved" hoặc "rejected"' },
      { status: 422 },
    );
  const comments = typeof body?.comments === "string" ? body.comments.slice(0, 4000) : undefined;

  const { id, seq } = await params;
  const seqNum = Number(seq);
  if (!Number.isInteger(seqNum) || seqNum < 1)
    return NextResponse.json({ error: "seq không hợp lệ" }, { status: 422 });

  try {
    await approveGate(projectId, id, seqNum, user.id, user.role, decision, comments);
  } catch (err) {
    if (err instanceof WorkflowError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
