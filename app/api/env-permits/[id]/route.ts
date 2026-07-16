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
  newEnvPermitFileName,
  photoPath,
  MAX_DOC_BYTES,
  isContentTooLarge,
} from "@/lib/photos";
import { parseEnvPermitBody, validateEnvPermitInput, type EnvPermitInput } from "@/lib/environment";

export const dynamic = "force-dynamic";

type ExistingRow = EnvPermitInput & { fileName: string | null };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT kind, code, title, issued_by AS "issuedBy", issued_date AS "issuedDate",
            expiry_date AS "expiryDate", status, file_name AS "fileName"
       FROM env_permits WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/env-permits/:id — chi tiết hồ sơ môi trường (không kèm bytes file — xem
// GET .../file để tải file). Scoped theo dự án đang chọn (M22).
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
  const permit =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT p.id, p.project_id AS "projectId", p.kind, p.code, p.title,
                  p.issued_by AS "issuedBy", p.issued_date AS "issuedDate",
                  p.expiry_date AS "expiryDate", p.status,
                  p.file_name AS "fileName", p.original_name AS "originalName",
                  p.mime_type AS "mimeType", p.size_bytes AS "sizeBytes",
                  p.created_by AS "createdBy", u.name AS "createdByName", p.created_at AS "createdAt"
             FROM env_permits p LEFT JOIN users u ON u.id = p.created_by
            WHERE p.id = ? AND p.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!permit) return NextResponse.json({ error: "Không tìm thấy hồ sơ" }, { status: 404 });

  return NextResponse.json({ permit });
}

// PATCH /api/env-permits/:id — sửa hồ sơ (Admin/PM/kỹ sư). Nhận JSON (chỉ sửa field) hoặc
// multipart/form-data (field dạng text + phần 'file' tuỳ chọn để thêm/thay file chính —
// xoá file cũ trên đĩa nếu có).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hồ sơ môi trường (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hồ sơ" }, { status: 404 });

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
    for (const key of ["kind", "code", "title", "issuedBy", "issuedDate", "expiryDate", "status"]) {
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

  // Field không gửi giữ giá trị cũ; field gửi rỗng/null để xoá (code/ngày...).
  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in bodyFields) merged[key] = bodyFields[key];
  const input = parseEnvPermitBody(merged);

  const invalid = validateEnvPermitInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

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

    const fileName = newEnvPermitFileName(id, file.type);
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
      `UPDATE env_permits SET kind = ?, code = ?, title = ?, issued_by = ?, issued_date = ?,
              expiry_date = ?, status = ?,
              file_name = ?, original_name = ?, mime_type = ?, size_bytes = ?
        WHERE id = ?`,
      input.kind,
      input.code,
      input.title,
      input.issuedBy,
      input.issuedDate,
      input.expiryDate,
      input.status,
      fileCols.fileName,
      fileCols.originalName,
      fileCols.mimeType,
      fileCols.sizeBytes,
      id,
    );
  } else {
    await run(
      `UPDATE env_permits SET kind = ?, code = ?, title = ?, issued_by = ?, issued_date = ?,
              expiry_date = ?, status = ?
        WHERE id = ?`,
      input.kind,
      input.code,
      input.title,
      input.issuedBy,
      input.issuedDate,
      input.expiryDate,
      input.status,
      id,
    );
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/env-permits/:id — xoá hồ sơ (Admin/PM/kỹ sư) + file trên đĩa nếu có.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEnv(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hồ sơ môi trường (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hồ sơ" }, { status: 404 });

  await run(`DELETE FROM env_permits WHERE id = ?`, id);
  if (existing.fileName) {
    const p = photoPath(existing.fileName);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
