import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canDecideDesignChange, decideDesignChange } from "@/lib/designchanges";

export const dynamic = "force-dynamic";

// POST /api/design-changes/:id/decide  body: { decision: 'approved'|'rejected', decisionNote? }
// — quyết thay đổi thiết kế đang chờ duyệt (CAN.approve = Admin/PM). Duyệt có tác động
// chi phí/tiến độ bắt buộc ghi decisionNote.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canDecideDesignChange(user))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được quyết thay đổi thiết kế" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  const { decision } = body;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json(
      { error: "decision phải là 'approved' hoặc 'rejected'" },
      { status: 422 },
    );

  const result = await decideDesignChange({
    designChangeId: id,
    decision,
    decisionNote: typeof body.decisionNote === "string" ? body.decisionNote : null,
    decidedBy: user.id,
  });
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 409 });

  return NextResponse.json({ ok: true, status: decision });
}
