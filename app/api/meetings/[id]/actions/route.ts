import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { parseMeetingActionBody, validateMeetingActionInput } from "@/lib/hien-truong/meetings";
import { taskProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// POST /api/meetings/:id/actions — thêm action item vào cuộc họp (Admin/PM/kỹ sư).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMeetings(user.role))
    return NextResponse.json({ error: "Không có quyền thêm việc sau họp" }, { status: 403 });

  const meetingId = parseInt(params.id);
  if (isNaN(meetingId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const meeting =
    projectId != null
      ? await queryOne(
          `SELECT id FROM meetings WHERE id = ? AND project_id = ?`,
          meetingId,
          projectId,
        )
      : undefined;
  if (!meeting) return NextResponse.json({ error: "Không tìm thấy cuộc họp" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseMeetingActionBody(body);
  const invalid = validateMeetingActionInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.assignee != null) {
    // Cách ly tổ chức (Đợt 6, Việc G): users.org_id — cùng lớp lỗi đã vá ở
    // app/api/users/[id]/route.ts (Đợt 5, M54 GĐ1 PR2).
    const u = await queryOne(
      `SELECT id FROM users WHERE id = ? AND org_id = ?`,
      input.assignee,
      user.orgId,
    );
    if (!u) return NextResponse.json({ error: "Người được giao không tồn tại" }, { status: 422 });
  }
  if (input.taskId != null) {
    // Cách ly dự án (Đợt 6, Việc G): tasks không có cột dự án trực tiếp — suy qua chuỗi
    // cha (lib/tien-do/workpackages.ts), phải khớp đúng dự án của cuộc họp.
    if ((await taskProjectId(input.taskId)) !== projectId)
      return NextResponse.json({ error: "Task liên kết không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO meeting_actions (meeting_id, content, assignee, due_date, task_id)
     VALUES (?, ?, ?, ?, ?)`,
    meetingId,
    input.content,
    input.assignee,
    input.dueDate,
    input.taskId,
  );
  return NextResponse.json({ id }, { status: 201 });
}
