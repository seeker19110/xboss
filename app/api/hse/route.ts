import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  HSE_KINDS,
  checkHseRefs,
  listHse,
  parseHseBody,
  validateHseInput,
  type HseKind,
} from "@/lib/hse";

export const dynamic = "force-dynamic";

// GET /api/hse?kind=&month=(YYYY-MM) — sổ HSE, scoped theo dự án đang chọn (M22). Mọi
// vai trò đăng nhập xem được.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const kindRaw = sp.get("kind")?.trim() || undefined;
  if (kindRaw && !HSE_KINDS.includes(kindRaw as HseKind))
    return NextResponse.json({ error: "Loại ghi nhận không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ records: [] });

  const records = await listHse({
    kind: kindRaw as HseKind | undefined,
    month: sp.get("month")?.trim() || undefined,
    projectId,
  });
  return NextResponse.json({ records });
}

// POST /api/hse — ghi nhận mới. Mọi vai trò thao tác tạo được (kể cả subcon báo near-miss —
// càng nhiều báo cáo càng tốt, không chặn). Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role === "cdt" || user.role === "viewer" || user.role === "bch")
    return NextResponse.json({ error: "Bạn không có quyền ghi nhận HSE" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để ghi nhận HSE" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseHseBody(body);
  const invalid = validateHseInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkHseRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const actionStatus = input.actionRequired ? "open" : "none";

  const id = await insertId(
    `INSERT INTO hse_records
       (kind, record_date, floor_label, area, description, severity, permit_type,
        permit_from, permit_to, action_required, action_assignee, action_due, action_status, created_by, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.kind,
    input.recordDate,
    input.floorLabel,
    input.area,
    input.description,
    input.severity,
    input.permitType,
    input.permitFrom,
    input.permitTo,
    input.actionRequired,
    input.actionAssignee,
    input.actionDue,
    actionStatus,
    user.id,
    projectId,
  );

  return NextResponse.json({ id }, { status: 201 });
}
