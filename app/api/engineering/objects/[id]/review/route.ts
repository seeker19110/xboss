import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { reviewEngineeringObject } from "@/lib/ky-thuat/engineering-kernel";

export const dynamic = "force-dynamic";

// POST /api/engineering/objects/:id/review { decision: "approved"|"rejected", note? } —
// cổng duyệt bắt buộc trước khi object ảnh hưởng boq_items/cost (ENG-1 quyết định #3,
// boundary track ENG-* mục 4 ENG-0). Chỉ Admin/PM — không có API key nào gọi được route
// này (session auth only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.reviewEngineeringObjects(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được duyệt đối tượng kỹ thuật" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const decision =
    body && (body.decision === "approved" || body.decision === "rejected") ? body.decision : null;
  if (!decision)
    return NextResponse.json(
      { error: 'decision phải là "approved" hoặc "rejected"' },
      { status: 422 },
    );
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : undefined;

  const { id } = await params;
  try {
    await reviewEngineeringObject(projectId, id, decision, user.id, note);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Duyệt đối tượng thất bại" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
