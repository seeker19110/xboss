import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getMeeting, parseMeetingBody, validateMeetingInput } from "@/lib/meetings";

export const dynamic = "force-dynamic";

// GET /api/meetings/:id — chi tiết 1 cuộc họp kèm action, scoped theo dự án (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const meeting = projectId != null ? await getMeeting(id, projectId) : undefined;
  if (!meeting) return NextResponse.json({ error: "Không tìm thấy cuộc họp" }, { status: 404 });
  return NextResponse.json({ meeting });
}

// PATCH /api/meetings/:id — sửa biên bản họp (người tạo hoặc Admin/PM).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMeetings(user.role))
    return NextResponse.json({ error: "Không có quyền sửa biên bản họp" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const meeting =
    projectId != null
      ? await queryOne<{ id: number; created_by: number | null }>(
          `SELECT id, created_by FROM meetings WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!meeting) return NextResponse.json({ error: "Không tìm thấy cuộc họp" }, { status: 404 });
  if (meeting.created_by !== user.id && !isAdminOrPm(user.role))
    return NextResponse.json(
      { error: "Chỉ người tạo hoặc Admin/PM được sửa biên bản họp" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseMeetingBody(body);
  const invalid = validateMeetingInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  await run(
    `UPDATE meetings SET meeting_date = ?, kind = ?, title = ?, attendees = ?, content = ? WHERE id = ?`,
    input.meetingDate,
    input.kind,
    input.title,
    input.attendees,
    input.content,
    id,
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/meetings/:id — xoá cuộc họp kèm toàn bộ action (chỉ Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá cuộc họp" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const r =
    projectId != null
      ? await run(`DELETE FROM meetings WHERE id = ? AND project_id = ?`, id, projectId)
      : { changes: 0 };
  if (r.changes === 0)
    return NextResponse.json({ error: "Không tìm thấy cuộc họp" }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
