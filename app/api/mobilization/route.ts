import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listMobilization, parseMobilizationBody, validateMobilizationInput } from "@/lib/kickoff";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// GET /api/mobilization — checklist huy động công trường, scoped theo dự án đang chọn
// (M22). Xem: mọi vai trò đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const items = projectId != null ? await listMobilization(projectId) : [];
  return NextResponse.json({ items });
}

// POST /api/mobilization — tạo hạng mục checklist (Admin/PM). Gán project_id = dự án
// đang chọn (server suy, không tin client). Đánh dấu 'done' ngay lúc tạo → tự set done_date.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageKickoff(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hạng mục huy động (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo hạng mục" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseMobilizationBody(body);
  const invalid = validateMobilizationInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.assignee != null) {
    if (
      !Number.isInteger(input.assignee) ||
      !(await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee))
    )
      return NextResponse.json({ error: "Người được gán không tồn tại" }, { status: 422 });
  }

  const doneDate = input.status === "done" ? todayISO() : null;

  const id = await insertId(
    `INSERT INTO mobilization_items (project_id, category, title, status, due_date, done_date,
                                      assignee, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.category,
    input.title,
    input.status,
    input.dueDate,
    doneDate,
    input.assignee,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
