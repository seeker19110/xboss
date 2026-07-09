import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  PUNCH_SEVERITIES,
  PUNCH_STATUSES,
  listPunch,
  parsePunchBody,
  validatePunchInput,
  type PunchSeverity,
  type PunchStatus,
} from "@/lib/handover";

export const dynamic = "force-dynamic";

// GET /api/punch-list?status=&severity=&assignee= — bảng tồn tại khi bàn giao, scoped
// theo dự án đang chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim() || undefined;
  if (status && !PUNCH_STATUSES.includes(status as PunchStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
  const severity = sp.get("severity")?.trim() || undefined;
  if (severity && !PUNCH_SEVERITIES.includes(severity as PunchSeverity))
    return NextResponse.json({ error: "Mức độ không hợp lệ" }, { status: 422 });
  const assigneeRaw = sp.get("assignee");
  const assignee = assigneeRaw ? Number(assigneeRaw) : undefined;

  const projectId = await getCurrentProjectId(user);
  const items =
    projectId != null
      ? await listPunch(projectId, {
          status: status as PunchStatus | undefined,
          severity: severity as PunchSeverity | undefined,
          assignee,
        })
      : [];
  return NextResponse.json({ items });
}

// POST /api/punch-list — tạo tồn tại (manageHandover: Admin/PM/kỹ sư). Gán project_id =
// dự án đang chọn (server suy). handoverItemId nullable — cho phép punch không gắn hạng
// mục cụ thể.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo tồn tại (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo tồn tại" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parsePunchBody(body);
  const invalid = validatePunchInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.handoverItemId != null) {
    const hi = await queryOne(
      `SELECT id FROM handover_items WHERE id = ? AND project_id = ?`,
      input.handoverItemId,
      projectId,
    );
    if (!hi)
      return NextResponse.json({ error: "Hạng mục bàn giao không tồn tại" }, { status: 422 });
  }
  if (input.assignee != null) {
    if (!(await queryOne(`SELECT id FROM users WHERE id = ?`, input.assignee)))
      return NextResponse.json({ error: "Người được gán không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO punch_list (project_id, handover_item_id, description, severity, status,
                              due_date, assignee, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.handoverItemId,
    input.description,
    input.severity,
    input.status,
    input.dueDate,
    input.assignee,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
