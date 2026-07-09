import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  attendanceByDate,
  attendanceSummary,
  listAttendance,
  parseAttendanceBody,
  validateAttendanceInput,
} from "@/lib/hr";
import { todayISO, daysFromTodayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

// GET /api/attendance?from=&to=&crewId=&view=list|byDate|summary — chấm công, scoped
// theo dự án đang chọn (M22). Xem: mọi vai trò đăng nhập.
//  - view=list (mặc định): danh sách bản ghi chấm công.
//  - view=byDate: gộp headcount theo ngày × tổ (biểu đồ cột tổng công theo tháng).
//  - view=summary: công/người trong khoảng ngày (chỉ chấm theo người).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "list";
  const from = sp.get("from") ?? daysFromTodayISO(-30);
  const to = sp.get("to") ?? todayISO();
  const crewId = sp.get("crewId") ? Number(sp.get("crewId")) : undefined;

  const projectId = await getCurrentProjectId(user);

  if (view === "byDate") {
    const byDate = projectId != null ? await attendanceByDate(projectId, from, to) : [];
    return NextResponse.json({ byDate });
  }
  if (view === "summary") {
    const summary = projectId != null ? await attendanceSummary(projectId, from, to) : [];
    return NextResponse.json({ summary });
  }

  const items = projectId != null ? await listAttendance(projectId, { from, to, crewId }) : [];
  return NextResponse.json({ items });
}

// POST /api/attendance — chấm công (Admin/PM/Kỹ sư — đội trưởng ghi công tại hiện
// trường). Gán project_id = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.recordAttendance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền chấm công (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để chấm công" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseAttendanceBody(body);
  const invalid = validateAttendanceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.crewId != null) {
    if (
      !(await queryOne(
        `SELECT id FROM crews WHERE id = ? AND project_id = ?`,
        input.crewId,
        projectId,
      ))
    )
      return NextResponse.json({ error: "Không tìm thấy tổ đội" }, { status: 422 });
  }
  if (input.personnelId != null) {
    if (
      !(await queryOne(
        `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
        input.personnelId,
        projectId,
      ))
    )
      return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO attendance (project_id, work_date, crew_id, personnel_id, headcount, present,
                              hours, note, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.workDate,
    input.crewId,
    input.personnelId,
    input.headcount,
    input.present,
    input.hours,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
