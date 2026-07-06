import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import {
  MEETING_ACTION_STATUSES,
  getMeetingAction,
  parseMeetingActionBody,
  setMeetingActionStatus,
  validateMeetingActionInput,
  type MeetingActionStatus,
} from "@/lib/meetings";

export const dynamic = "force-dynamic";

// PATCH /api/meetings/:id/actions/:aid
// body { status } — đánh done/mở lại/huỷ: assignee hoặc Admin/PM.
// body { content/assignee/dueDate/taskId } — sửa nội dung: Admin/PM/kỹ sư.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; aid: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const meetingId = parseInt(params.id);
  const aid = parseInt(params.aid);
  if (isNaN(meetingId) || isNaN(aid))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const action = await getMeetingAction(aid);
  if (!action || action.meetingId !== meetingId)
    return NextResponse.json({ error: "Không tìm thấy việc sau họp" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  if (typeof body.status === "string") {
    const status = body.status as MeetingActionStatus;
    if (!MEETING_ACTION_STATUSES.includes(status))
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
    if (action.assignee !== user.id && !isAdminOrPm(user.role))
      return NextResponse.json(
        { error: "Chỉ người được giao hoặc Admin/PM được đổi trạng thái việc này" },
        { status: 403 },
      );
    await setMeetingActionStatus(aid, status);
    return NextResponse.json({ ok: true, status });
  }

  if (!CAN.manageMeetings(user.role))
    return NextResponse.json({ error: "Không có quyền sửa việc sau họp" }, { status: 403 });

  const input = parseMeetingActionBody(body);
  const invalid = validateMeetingActionInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  if (input.assignee != null) {
    const u = await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee);
    if (!u) return NextResponse.json({ error: "Người được giao không tồn tại" }, { status: 422 });
  }

  await run(
    `UPDATE meeting_actions SET content = ?, assignee = ?, due_date = ?, task_id = ? WHERE id = ?`,
    input.content,
    input.assignee,
    input.dueDate,
    input.taskId,
    aid,
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/meetings/:id/actions/:aid — xoá action (chỉ Admin/PM).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; aid: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xoá việc sau họp" }, { status: 403 });

  const meetingId = parseInt(params.id);
  const aid = parseInt(params.aid);
  if (isNaN(meetingId) || isNaN(aid))
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const r = await run(
    `DELETE FROM meeting_actions WHERE id = ? AND meeting_id = ?`,
    aid,
    meetingId,
  );
  if (r.changes === 0)
    return NextResponse.json({ error: "Không tìm thấy việc sau họp" }, { status: 404 });
  return NextResponse.json({ deleted: aid });
}
