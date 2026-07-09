import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  HANDOVER_ITEM_STATUSES,
  listHandoverItems,
  parseHandoverItemBody,
  validateHandoverItemInput,
  type HandoverItemStatus,
} from "@/lib/handover";

export const dynamic = "force-dynamic";

// GET /api/handover-items?status= — danh sách hạng mục bàn giao CĐT, scoped theo dự án
// đang chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() || null;
  if (statusRaw && !HANDOVER_ITEM_STATUSES.includes(statusRaw as HandoverItemStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const items =
    projectId != null
      ? await listHandoverItems(projectId, {
          status: (statusRaw as HandoverItemStatus) ?? undefined,
        })
      : [];
  return NextResponse.json({ items });
}

// POST /api/handover-items — tạo hạng mục bàn giao (manageHandover: Admin/PM/kỹ sư).
// Gán project_id = dự án đang chọn (server suy). status='accepted' chỉ đặt được qua
// PATCH (cần CAN.approve).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hạng mục bàn giao (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Chưa có dự án nào để tạo hạng mục bàn giao" },
      { status: 422 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseHandoverItemBody(body);
  if (input.status === "accepted" && !CAN.approve(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được đặt trạng thái Đã nghiệm thu" },
      {
        status: 403,
      },
    );
  const invalid = validateHandoverItemInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.disciplineId != null) {
    if (!(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, input.disciplineId)))
      return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }
  if (input.workPackageId != null) {
    if (!(await queryOne(`SELECT id FROM work_packages WHERE id = ?`, input.workPackageId)))
      return NextResponse.json({ error: "Nhóm công việc không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO handover_items (project_id, title, discipline_id, work_package_id, status,
                                  handover_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.title,
    input.disciplineId,
    input.workPackageId,
    input.status,
    input.handoverDate,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
