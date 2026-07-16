import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newCertificationFileName,
  photoPath,
  MAX_DOC_BYTES,
  isContentTooLarge,
} from "@/lib/photos";
import {
  parseCertificationBody,
  validateCertificationInput,
  type CertificationInput,
} from "@/lib/hr";

export const dynamic = "force-dynamic";

type ExistingRow = CertificationInput & { fileName: string | null };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT personnel_id AS "personnelId", kind, code, issued_date AS "issuedDate",
            expiry_date AS "expiryDate", file_name AS "fileName"
       FROM certifications WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/certifications/:id — chi tiết chứng chỉ (không kèm bytes file). Scoped
// theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const certification =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT c.id, c.project_id AS "projectId", c.personnel_id AS "personnelId",
                  p.full_name AS "personnelName", c.kind, c.code,
                  c.issued_date AS "issuedDate", c.expiry_date AS "expiryDate",
                  c.file_name AS "fileName", c.original_name AS "originalName",
                  c.mime_type AS "mimeType", c.size_bytes AS "sizeBytes",
                  c.created_by AS "createdBy", c.created_at AS "createdAt"
             FROM certifications c LEFT JOIN personnel p ON p.id = c.personnel_id
            WHERE c.id = ? AND c.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!certification)
    return NextResponse.json({ error: "Không tìm thấy chứng chỉ" }, { status: 404 });

  return NextResponse.json({ certification });
}

// PATCH /api/certifications/:id — sửa chứng chỉ (Admin/PM). Nhận JSON (chỉ sửa field)
// hoặc multipart/form-data (field dạng text + phần 'file' tuỳ chọn để thêm/thay file —
// xoá file cũ trên đĩa nếu có).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa chứng chỉ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy chứng chỉ" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  let bodyFields: Record<string, unknown>;
  let file: File | null = null;

  if (contentType.startsWith("multipart/form-data")) {
    if (isContentTooLarge(req.headers.get("content-length"), MAX_DOC_BYTES))
      return NextResponse.json(
        { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
        { status: 413 },
      );

    const form = await req.formData().catch(() => null);
    if (!form)
      return NextResponse.json({ error: "Dữ liệu multipart không hợp lệ" }, { status: 400 });
    bodyFields = {};
    for (const key of ["personnelId", "kind", "code", "issuedDate", "expiryDate"]) {
      if (form.has(key)) bodyFields[key] = form.get(key);
    }
    const f = form.get("file");
    if (f instanceof File && f.size > 0) file = f;
  } else {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object")
      return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
    bodyFields = json;
  }

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in bodyFields) merged[key] = bodyFields[key];
  const input = parseCertificationBody(merged);

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

  let fileCols: {
    fileName: string | null;
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null = null;
  if (file) {
    const ext = extForDocMime(file.type);
    if (!ext)
      return NextResponse.json(
        { error: `Chỉ nhận PDF hoặc ảnh, nhận được: ${file.type || "không rõ"}` },
        { status: 415 },
      );
    if (file.size > MAX_DOC_BYTES)
      return NextResponse.json(
        { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
        { status: 413 },
      );

    const fileBuf = Buffer.from(await file.arrayBuffer());
    if (!verifyFileMime(fileBuf, file.type))
      return NextResponse.json(
        { error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)" },
        { status: 415 },
      );

    if (existing.fileName) {
      const oldPath = photoPath(existing.fileName);
      if (oldPath)
        await unlink(oldPath).catch(() => {
          /* file đã mất trên đĩa — bỏ qua */
        });
    }

    const fileName = newCertificationFileName(id, file.type);
    const dir = ensureUploadDir();
    await writeFile(join(dir, fileName), fileBuf);
    fileCols = {
      fileName,
      originalName: file.name || null,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  if (fileCols) {
    await run(
      `UPDATE certifications SET personnel_id = ?, kind = ?, code = ?, issued_date = ?,
              expiry_date = ?, file_name = ?, original_name = ?, mime_type = ?, size_bytes = ?
        WHERE id = ?`,
      input.personnelId,
      input.kind,
      input.code,
      input.issuedDate,
      input.expiryDate,
      fileCols.fileName,
      fileCols.originalName,
      fileCols.mimeType,
      fileCols.sizeBytes,
      id,
    );
  } else {
    await run(
      `UPDATE certifications SET personnel_id = ?, kind = ?, code = ?, issued_date = ?, expiry_date = ?
        WHERE id = ?`,
      input.personnelId,
      input.kind,
      input.code,
      input.issuedDate,
      input.expiryDate,
      id,
    );
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/certifications/:id — xoá chứng chỉ (Admin/PM) + file trên đĩa nếu có.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHr(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá chứng chỉ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy chứng chỉ" }, { status: 404 });

  await run(`DELETE FROM certifications WHERE id = ?`, id);
  if (existing.fileName) {
    const p = photoPath(existing.fileName);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
