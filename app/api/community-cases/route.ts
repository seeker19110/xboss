import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";
import {
  COMMUNITY_CASE_STATUSES,
  listCommunityCases,
  parseCommunityCaseBody,
  validateCommunityCaseInput,
  type CommunityCaseStatus,
} from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// GET /api/community-cases?status= — danh sách khiếu nại/quan hệ cộng đồng, scoped theo
// dự án đang chọn. Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() || null;
  if (statusRaw && !COMMUNITY_CASE_STATUSES.includes(statusRaw as CommunityCaseStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const cases =
    projectId != null
      ? await listCommunityCases(projectId, {
          status: (statusRaw as CommunityCaseStatus) ?? undefined,
        })
      : [];
  return NextResponse.json({ cases });
}

// POST /api/community-cases — tạo khiếu nại (Admin/PM/kỹ sư). Gán project_id = dự án
// đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageMonitoring(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo khiếu nại (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo khiếu nại" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCommunityCaseBody(body);
  const invalid = validateCommunityCaseInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO community_cases (project_id, code, title, source, received_date, status,
       resolution, closed_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.code,
    input.title,
    input.source,
    input.receivedDate,
    input.status,
    input.resolution,
    input.status === "closed" ? (input.closedDate ?? todayISO()) : input.closedDate,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
