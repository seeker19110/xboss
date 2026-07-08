import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  DRAWING_KINDS,
  REVISION_STATUSES,
  checkDrawingRefs,
  listDrawings,
  parseDrawingBody,
  validateDrawingInput,
  type DrawingKind,
  type RevisionStatus,
} from "@/lib/drawings";

export const dynamic = "force-dynamic";

// GET /api/drawings?kind=&floor=&system=&status= — danh sách bản vẽ kèm rev hiện hành
// + rev đã duyệt mới nhất. Mọi vai trò đăng nhập đều xem được (kể cả subcon — cần bản
// vẽ để thi công tại hiện trường).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind")?.trim() || undefined;
  if (kind && !DRAWING_KINDS.includes(kind as DrawingKind))
    return NextResponse.json({ error: "Loại bản vẽ không hợp lệ" }, { status: 422 });
  const status = sp.get("status")?.trim() || undefined;
  if (status && !REVISION_STATUSES.includes(status as RevisionStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const drawings =
    projectId != null
      ? await listDrawings({
          kind: kind as DrawingKind | undefined,
          floorLabel: sp.get("floor")?.trim() || undefined,
          systemGroup: sp.get("system")?.trim() || undefined,
          status: status as RevisionStatus | undefined,
          projectId,
        })
      : [];
  return NextResponse.json({ drawings });
}

// POST /api/drawings — tạo bản vẽ mới (số bản vẽ, chưa có file — upload rev qua
// /api/drawings/:id/revisions). Admin/PM/engineer. Gán project_id = dự án đang chọn
// (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo bản vẽ (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo bản vẽ" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseDrawingBody(body);
  const invalid = validateDrawingInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkDrawingRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO drawings (code, name, kind, system_group, floor_label, work_package_id, created_by, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.code,
      input.name,
      input.kind,
      input.systemGroup,
      input.floorLabel,
      input.workPackageId,
      user.id,
      projectId,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Số bản vẽ "${input.code}" đã tồn tại` }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
