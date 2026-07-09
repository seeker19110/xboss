import { NextRequest, NextResponse } from "next/server";
import { insertId, query, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseCertificationBody, validateCertificationInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

export type CertificationRow = {
  id: number;
  projectId: number | null;
  personnelId: number | null;
  personnelName: string | null;
  kind: string;
  code: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdBy: number | null;
  createdAt: string;
};

// GET /api/certifications?personnelId= — danh sách chứng chỉ, scoped theo dự án đang
// chọn (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const personnelIdRaw = req.nextUrl.searchParams.get("personnelId");
  const personnelId = personnelIdRaw ? Number(personnelIdRaw) : undefined;

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ certifications: [] });

  const conds = ["c.project_id = ?"];
  const args: unknown[] = [projectId];
  if (personnelId != null) {
    conds.push("c.personnel_id = ?");
    args.push(personnelId);
  }
  const certifications = await query<CertificationRow>(
    `SELECT c.id, c.project_id AS "projectId", c.personnel_id AS "personnelId",
            p.full_name AS "personnelName", c.kind, c.code,
            c.issued_date AS "issuedDate", c.expiry_date AS "expiryDate",
            c.file_name AS "fileName", c.original_name AS "originalName",
            c.mime_type AS "mimeType", c.size_bytes AS "sizeBytes",
            c.created_by AS "createdBy", c.created_at AS "createdAt"
       FROM certifications c LEFT JOIN personnel p ON p.id = c.personnel_id
      WHERE ${conds.join(" AND ")}
      ORDER BY c.expiry_date NULLS LAST, c.id DESC`,
    ...args,
  );
  return NextResponse.json({ certifications });
}

// POST /api/certifications — tạo chứng chỉ (Admin/PM), chưa kèm file (upload file qua
// PATCH multipart sau khi có id). Gán project_id = dự án đang chọn (server suy).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo chứng chỉ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo chứng chỉ" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCertificationBody(body);
  const invalid = validateCertificationInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

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
    `INSERT INTO certifications (project_id, personnel_id, kind, code, issued_date, expiry_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.personnelId,
    input.kind,
    input.code,
    input.issuedDate,
    input.expiryDate,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
