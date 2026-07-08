import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listMeetings, parseMeetingBody, validateMeetingInput } from "@/lib/meetings";

export const dynamic = "force-dynamic";

// GET /api/meetings — danh sách họp kèm action, scoped theo dự án đang chọn (M22).
// Mọi vai trò đăng nhập xem được.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const meetings = projectId != null ? await listMeetings({ projectId }) : [];
  return NextResponse.json({ meetings });
}

// POST /api/meetings — tạo biên bản họp mới (Admin/PM/kỹ sư), gán project_id = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMeetings(user.role))
    return NextResponse.json({ error: "Không có quyền tạo biên bản họp" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo biên bản họp" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseMeetingBody(body);
  const invalid = validateMeetingInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO meetings (meeting_date, kind, title, attendees, content, created_by, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.meetingDate,
    input.kind,
    input.title,
    input.attendees,
    input.content,
    user.id,
    projectId,
  );
  return NextResponse.json({ id }, { status: 201 });
}
