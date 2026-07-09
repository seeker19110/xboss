import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  newInsuranceDocFileName,
  photoPath,
  MAX_DOC_BYTES,
} from "@/lib/photos";
import {
  checkInsuranceContractRef,
  parseInsuranceBody,
  validateInsuranceInput,
  type InsuranceInput,
} from "@/lib/insurance";

export const dynamic = "force-dynamic";

type ExistingRow = InsuranceInput & { fileName: string | null };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT contract_id AS "contractId", kind, title, provider, code, value,
            issued_date AS "issuedDate", expiry_date AS "expiryDate", status, note,
            file_name AS "fileName"
       FROM insurance_bonds WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/insurance-bonds/:id — chi tiết bảo hiểm/bảo lãnh (không kèm bytes file — xem
// GET .../file để tải file). Scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xem bảo hiểm & bảo lãnh" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const bond =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT b.id, b.project_id AS "projectId", b.contract_id AS "contractId",
                  c.title AS "contractTitle", c.code AS "contractCode",
                  b.kind, b.title, b.provider, b.code, b.value,
                  b.issued_date AS "issuedDate", b.expiry_date AS "expiryDate", b.status, b.note,
                  b.file_name AS "fileName", b.original_name AS "originalName",
                  b.mime_type AS "mimeType", b.size_bytes AS "sizeBytes",
                  b.created_by AS "createdBy", u.name AS "createdByName", b.created_at AS "createdAt"
             FROM insurance_bonds b
             LEFT JOIN contracts c ON c.id = b.contract_id
             LEFT JOIN users u ON u.id = b.created_by
            WHERE b.id = ? AND b.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!bond)
    return NextResponse.json({ error: "Không tìm thấy bảo hiểm/bảo lãnh" }, { status: 404 });

  return NextResponse.json({ bond });
}

// PATCH /api/insurance-bonds/:id — sửa (Admin/PM). Nhận JSON (chỉ sửa field) hoặc
// multipart/form-data (field dạng text + phần 'file' tuỳ chọn để thêm/thay chứng thư —
// xoá file cũ trên đĩa nếu có).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa bảo hiểm/bảo lãnh (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy bảo hiểm/bảo lãnh" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  let bodyFields: Record<string, unknown>;
  let file: File | null = null;

  if (contentType.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form)
      return NextResponse.json({ error: "Dữ liệu multipart không hợp lệ" }, { status: 400 });
    bodyFields = {};
    for (const key of [
      "contractId",
      "kind",
      "title",
      "provider",
      "code",
      "value",
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
  const input = parseInsuranceBody(merged);

  const invalid = validateInsuranceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 422 });
  const refErr = await checkInsuranceContractRef(input.contractId, projectId);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

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

    if (existing.fileName) {
      const oldPath = photoPath(existing.fileName);
      if (oldPath)
        await unlink(oldPath).catch(() => {
          /* file đã mất trên đĩa — bỏ qua */
        });
    }

    const fileName = newInsuranceDocFileName(id, file.type);
    const dir = ensureUploadDir();
    await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));
    fileCols = {
      fileName,
      originalName: file.name || null,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  if (fileCols) {
    await run(
      `UPDATE insurance_bonds SET contract_id = ?, kind = ?, title = ?, provider = ?, code = ?,
              value = ?, issued_date = ?, expiry_date = ?, status = ?, note = ?,
              file_name = ?, original_name = ?, mime_type = ?, size_bytes = ?
        WHERE id = ?`,
      input.contractId,
      input.kind,
      input.title,
      input.provider,
      input.code,
      input.value,
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
      `UPDATE insurance_bonds SET contract_id = ?, kind = ?, title = ?, provider = ?, code = ?,
              value = ?, issued_date = ?, expiry_date = ?, status = ?, note = ?
        WHERE id = ?`,
      input.contractId,
      input.kind,
      input.title,
      input.provider,
      input.code,
      input.value,
      input.issuedDate,
      input.expiryDate,
      input.status,
      input.note,
      id,
    );
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/insurance-bonds/:id — xoá (Admin/PM) + file trên đĩa nếu có.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá bảo hiểm/bảo lãnh (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing)
    return NextResponse.json({ error: "Không tìm thấy bảo hiểm/bảo lãnh" }, { status: 404 });

  await run(`DELETE FROM insurance_bonds WHERE id = ?`, id);
  if (existing.fileName) {
    const p = photoPath(existing.fileName);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
