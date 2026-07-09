import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  LEGAL_KINDS,
  listLegalDocuments,
  parseLegalBody,
  validateLegalInput,
  type LegalKind,
} from "@/lib/kickoff";

export const dynamic = "force-dynamic";

// GET /api/legal-documents?kind= — danh sách hồ sơ pháp lý, scoped theo dự án đang
// chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim() || null;
  if (kindRaw && !LEGAL_KINDS.includes(kindRaw as LegalKind))
    return NextResponse.json({ error: "Loại hồ sơ không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const documents =
    projectId != null
      ? await listLegalDocuments(projectId, { kind: (kindRaw as LegalKind) ?? undefined })
      : [];
  return NextResponse.json({ documents });
}

// POST /api/legal-documents — tạo hồ sơ pháp lý (Admin/PM), chưa kèm file (upload file
// qua PATCH multipart sau khi có id). Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageKickoff(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hồ sơ pháp lý (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo hồ sơ pháp lý" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseLegalBody(body);
  const invalid = validateLegalInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const id = await insertId(
    `INSERT INTO legal_documents (project_id, kind, code, title, issued_by, issued_date,
                                   expiry_date, status, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.kind,
    input.code,
    input.title,
    input.issuedBy,
    input.issuedDate,
    input.expiryDate,
    input.status,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
