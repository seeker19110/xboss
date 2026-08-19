import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { resolveDataQualityIssue } from "@/lib/engineering-graph";

export const dynamic = "force-dynamic";

// POST /api/engineering/data-quality/[id]/resolve — Giải quyết/đóng vấn đề chất lượng dữ liệu
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringDataQuality(user.role)) {
    return NextResponse.json({ error: "Không có quyền xử lý chất lượng dữ liệu" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json(
      { error: "Cần cung cấp ghi chú giải quyết / bằng chứng xử lý" },
      { status: 400 },
    );
  }

  try {
    const ok = await resolveDataQualityIssue(projectId, id, user.id, note);
    if (!ok) {
      return NextResponse.json(
        { error: "Không tìm thấy vấn đề chất lượng dữ liệu để xử lý" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
