import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ENV_PERMIT_KINDS,
  listPermits,
  parseEnvPermitBody,
  validateEnvPermitInput,
  type EnvPermitKind,
} from "@/lib/environment";

export const dynamic = "force-dynamic";

// GET /api/env-permits?kind= — danh sách hồ sơ môi trường, scoped theo dự án đang chọn
// (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim() || null;
  if (kindRaw && !ENV_PERMIT_KINDS.includes(kindRaw as EnvPermitKind))
    return NextResponse.json({ error: "Loại hồ sơ không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const permits =
    projectId != null
      ? await listPermits(projectId, { kind: (kindRaw as EnvPermitKind) ?? undefined })
      : [];
  return NextResponse.json({ permits });
}

// POST /api/env-permits — tạo hồ sơ môi trường (Admin/PM/kỹ sư), chưa kèm file (upload
// file qua PATCH multipart sau khi có id). Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hồ sơ môi trường (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Chưa có dự án nào để tạo hồ sơ môi trường" },
      { status: 422 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseEnvPermitBody(body);
  const invalid = validateEnvPermitInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO env_permits (project_id, kind, code, title, issued_by, issued_date,
                               expiry_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.kind,
    input.code,
    input.title,
    input.issuedBy,
    input.issuedDate,
    input.expiryDate,
    input.status,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
