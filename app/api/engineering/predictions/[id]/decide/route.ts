import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { decidePrediction } from "@/lib/engineering-predictions";

export const dynamic = "force-dynamic";

// POST /api/engineering/predictions/[id]/decide
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringPredictions(user.role)) {
    return NextResponse.json({ error: "Không có quyền phản hồi dự báo" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const decision = body?.decision as "accepted" | "dismissed";

  if (decision !== "accepted" && decision !== "dismissed") {
    return NextResponse.json(
      { error: "Decision phải là 'accepted' hoặc 'dismissed'" },
      { status: 400 },
    );
  }

  try {
    const success = await decidePrediction(projectId, id, decision);
    return NextResponse.json({ success });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
