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
  newLegalDocFileName,
  photoPath,
  MAX_DOC_BYTES,
  isContentTooLarge,
} from "@/lib/photos";
import { parseLegalBody, validateLegalInput, type LegalInput } from "@/lib/kickoff";

export const dynamic = "force-dynamic";

type ExistingRow = LegalInput & { fileName: string | null };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT kind, code, title, issued_by AS "issuedBy", issued_date AS "issuedDate",
            expiry_date AS "expiryDate", status, note, file_name AS "fileName"
       FROM legal_documents WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/legal-documents/:id — chi tiết hồ sơ pháp lý (không kèm bytes file — xem
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
  const document =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT d.id, d.project_id AS "projectId", d.kind, d.code, d.title,
                  d.issued_by AS "issuedBy", d.issued_date AS "issuedDate",
                  d.expiry_date AS "expiryDate", d.status, d.note,
                  d.file_name AS "fileName", d.original_name AS "originalName",
                  d.mime_type AS "mimeType", d.size_bytes AS "sizeBytes",
                  d.created_by AS "createdBy", u.name AS "createdByName", d.created_at AS "createdAt"
             FROM legal_documents d LEFT JOIN users u ON u.id = d.created_by
            WHERE d.id = ? AND d.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!document) return NextResponse.json({ error: "Không tìm thấy hồ sơ" }, { status: 404 });

  return NextResponse.json({ document });
}

// PATCH /api/legal-documents/:id — sửa hồ sơ (Admin/PM). Nhận JSON (chỉ sửa field) hoặc
// multipart/form-data (field dạng text + phần 'file' tuỳ chọn để thêm/thay file chính —
// xoá file cũ trên đĩa nếu có).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageKickoff(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hồ sơ pháp lý (chỉ Admin/PM)" },
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
    for (const key of [
      "kind",
      "code",
      "title",
      "issuedBy",
      "issuedDate",
      "expiryDate",
      "status",
      "note",
    ]) {
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

  // Field không gửi giữ giá trị cũ; field gửi rỗng/null để xoá (code/note/ngày...).
  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in bodyFields) merged[key] = bodyFields[key];
  const input = parseLegalBody(merged);

  const invalid = validateLegalInput(input);
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

    const fileName = newLegalDocFileName(id, file.type);
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
      `UPDATE legal_documents SET kind = ?, code = ?, title = ?, issued_by = ?, issued_date = ?,
              expiry_date = ?, status = ?, note = ?,
              file_name = ?, original_name = ?, mime_type = ?, size_bytes = ?
        WHERE id = ?`,
      input.kind,
      input.code,
      input.title,
      input.issuedBy,
      input.issuedDate,
      input.expiryDate,
      input.status,
      input.note,
      fileCols.fileName,
      fileCols.originalName,
      fileCols.mimeType,
      fileCols.sizeBytes,
      id,
    );
  } else {
    await run(
      `UPDATE legal_documents SET kind = ?, code = ?, title = ?, issued_by = ?, issued_date = ?,
              expiry_date = ?, status = ?, note = ?
        WHERE id = ?`,
      input.kind,
      input.code,
      input.title,
      input.issuedBy,
      input.issuedDate,
      input.expiryDate,
      input.status,
      input.note,
      id,
    );
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/legal-documents/:id — xoá hồ sơ (Admin/PM) + file trên đĩa nếu có.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageKickoff(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hồ sơ pháp lý (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hồ sơ" }, { status: 404 });

  await run(`DELETE FROM legal_documents WHERE id = ?`, id);
  if (existing.fileName) {
    const p = photoPath(existing.fileName);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
