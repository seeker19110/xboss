import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  CORRESPONDENCE_KINDS,
  CORRESPONDENCE_STATUSES,
  checkCorrespondenceRefs,
  listCorrespondences,
  parseCorrespondenceBody,
  validateCorrespondenceInput,
  type CorrespondenceKind,
  type CorrespondenceStatus,
} from "@/lib/correspondence";

export const dynamic = "force-dynamic";

// GET /api/correspondences?status=&kind=&counterparty=&q= — sổ công văn/RFI.
// Nhạy cảm hợp đồng: mọi vai trò trừ subcon.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewCorrespondence(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem công văn" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const statusRaw = sp.get("status")?.trim() || null;
  if (statusRaw && !CORRESPONDENCE_STATUSES.includes(statusRaw as CorrespondenceStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
  const kindRaw = sp.get("kind")?.trim() || null;
  if (kindRaw && !CORRESPONDENCE_KINDS.includes(kindRaw as CorrespondenceKind))
    return NextResponse.json({ error: "Loại văn bản không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const correspondences =
    projectId != null
      ? await listCorrespondences({
          status: (statusRaw as CorrespondenceStatus) ?? undefined,
          kind: (kindRaw as CorrespondenceKind) ?? undefined,
          counterparty: sp.get("counterparty")?.trim() || undefined,
          q: sp.get("q")?.trim() || undefined,
          taskId: sp.get("taskId") ? Number(sp.get("taskId")) : undefined,
          workPackageId: sp.get("workPackageId") ? Number(sp.get("workPackageId")) : undefined,
          drawingId: sp.get("drawingId") ? Number(sp.get("drawingId")) : undefined,
          projectId,
        })
      : [];
  return NextResponse.json({ correspondences });
}

// POST /api/correspondences — tạo văn bản mới (Admin/PM/kỹ sư), gán project_id = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCorrespondence(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo công văn (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo công văn" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCorrespondenceBody(body);
  const invalid = validateCorrespondenceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkCorrespondenceRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const id = await insertId(
    `INSERT INTO correspondences
       (code, direction, kind, counterparty, subject, sent_date, due_date, status,
        task_id, work_package_id, drawing_id, note, created_by, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.code,
    input.direction,
    input.kind,
    input.counterparty,
    input.subject,
    input.sentDate,
    input.dueDate,
    input.status,
    input.taskId,
    input.workPackageId,
    input.drawingId,
    input.note,
    user.id,
    projectId,
  );

  return NextResponse.json({ id }, { status: 201 });
}
