import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { withUniqueRetry } from "@/lib/seqcode";
import { getCurrentProjectId } from "@/lib/projects";
import {
  DESIGN_CHANGE_STATUSES,
  checkDesignChangeRefs,
  listDesignChanges,
  nextDesignChangeCode,
  parseDesignChangeBody,
  validateDesignChangeInput,
  type DesignChangeStatus,
} from "@/lib/designchanges";

export const dynamic = "force-dynamic";

// GET /api/design-changes?status= — danh sách thay đổi thiết kế của dự án đang chọn
// (scoping M22). Mọi vai trò đăng nhập đều xem được (giống bản vẽ).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  if (statusRaw && !(DESIGN_CHANGE_STATUSES as readonly string[]).includes(statusRaw))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const items = await listDesignChanges({
    projectId,
    status: statusRaw as DesignChangeStatus | undefined,
  });
  return NextResponse.json({ items });
}

// POST /api/design-changes — tạo thay đổi thiết kế mới (Admin/PM/kỹ sư). Mã DC-000N tự
// sinh; project_id gán từ server theo dự án đang chọn (không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDesignChanges(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo thay đổi thiết kế (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseDesignChangeBody(body);
  const invalid = validateDesignChangeInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkDesignChangeRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const projectId = await getCurrentProjectId(user);

  const { id, code } = await withUniqueRetry(async () => {
    const code = await nextDesignChangeCode();
    const id = await insertId(
      `INSERT INTO design_changes
         (project_id, code, title, system_id, drawing_id, requested_by_note, reason,
          impact_technical, impact_cost, impact_schedule, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId,
      code,
      input.title,
      input.systemId,
      input.drawingId,
      input.requestedByNote,
      input.reason,
      input.impactTechnical,
      input.impactCost,
      input.impactSchedule,
      user.id,
    );
    return { id, code };
  });
  return NextResponse.json({ id, code }, { status: 201 });
}
