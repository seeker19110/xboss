import { NextRequest, NextResponse } from "next/server";
import { run, queryOne, todayISO } from "@/lib/db";
import { getCurrentUser, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// POST /api/proposals/:id/submit — trình duyệt (draft → submitted), người tạo hoặc
// Admin/PM. Scoped theo dự án đang chọn (M22).
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const proposal =
    projectId != null
      ? await queryOne<{ id: number; status: string; requested_by: number }>(
          `SELECT id, status, requested_by FROM proposals WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!proposal) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.requested_by !== user.id && !isAdminOrPm(user.role))
    return NextResponse.json(
      { error: "Chỉ người tạo hoặc Admin/PM được trình đề xuất" },
      { status: 403 },
    );
  if (proposal.status !== "draft")
    return NextResponse.json({ error: "Đề xuất không ở trạng thái nháp" }, { status: 409 });

  await run(
    `UPDATE proposals SET status = 'submitted', submitted_at = ? WHERE id = ?`,
    todayISO(),
    id,
  );
  return NextResponse.json({ ok: true, status: "submitted" });
}
