import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { REVISION_STATUSES, setRevisionStatus, type RevisionStatus } from "@/lib/drawings";

export const dynamic = "force-dynamic";

// PATCH /api/drawings/revisions/:id — đổi trạng thái duyệt rev (Admin/PM). Rev mới
// approved/approved_with_comments tự thay thế (superseded) rev cùng drawing đang ở
// 1 trong 2 trạng thái đó (xem lib/drawings.ts setRevisionStatus).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.decideDrawingRevision(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền duyệt bản vẽ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM drawing_revisions WHERE id = ?`,
    id,
  );
  if (!existing) return NextResponse.json({ error: "Không tìm thấy revision" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const status = String(body.status ?? "").trim() as RevisionStatus;
  if (!REVISION_STATUSES.includes(status))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
  const decisionNote =
    typeof body.decisionNote === "string" && body.decisionNote.trim()
      ? body.decisionNote.trim()
      : null;

  const result = await setRevisionStatus(id, status, decisionNote);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ updated: id, status, drawingId: result.drawingId });
}
