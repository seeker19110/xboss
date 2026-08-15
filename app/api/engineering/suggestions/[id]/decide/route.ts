import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  decideSuggestion,
  SUGGESTION_DECISIONS,
  type SuggestionDecision,
} from "@/lib/engineering-intel";

export const dynamic = "force-dynamic";

// POST /api/engineering/suggestions/:id/decide { decision, note? } — §6 human interaction.
// Chỉ Admin/PM. LƯU Ý RANH GIỚI PHASE: "accepted" ở đây nghĩa là người dùng đồng ý với nội
// dung đề xuất — KHÔNG phải cho phép thực thi. Không có side effect nào ngoài chính bảng
// engineering_suggestions (ENG-3 mới là tầng biến đề xuất thành hành động có kiểm soát).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.decideEngineeringSuggestions(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được quyết định đề xuất kỹ thuật" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const decision = body?.decision as SuggestionDecision | undefined;
  if (!decision || !(SUGGESTION_DECISIONS as readonly string[]).includes(decision))
    return NextResponse.json(
      { error: `decision phải là một trong: ${SUGGESTION_DECISIONS.join(", ")}` },
      { status: 422 },
    );
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : undefined;

  const { id } = await params;
  try {
    await decideSuggestion(projectId, id, user.id, decision, note);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ghi quyết định thất bại" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
