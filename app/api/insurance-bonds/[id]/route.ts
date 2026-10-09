import { NextRequest, NextResponse } from "next/server";
import { moneyInputErrorBody } from "@/lib/nen/money";
import { storagePut, storageDelete } from "@/lib/nen/storage";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  newInsuranceDocFileName,
  MAX_DOC_BYTES,
  isContentTooLarge,
  checkUploadedFile,
} from "@/lib/nen/photos";
import {
  checkInsuranceContractRef,
  parseInsuranceBody,
  validateInsuranceInput,
  type InsuranceInput,
} from "@/lib/tai-chinh/insurance";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { log } from "@/lib/nen/log";

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
       FROM insurance_bonds WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
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
      ? await withProjectScope(projectId, () =>
          queryOne<Record<string, unknown>>(
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
          ),
        )
      : undefined;
  if (!bond)
    return NextResponse.json({ error: "Không tìm thấy bảo hiểm/bảo lãnh" }, { status: 404 });

  return NextResponse.json({ bond });
}

// PATCH /api/insurance-bonds/:id — sửa (Admin/PM). Nhận JSON (chỉ sửa field) hoặc
// multipart/form-data (field dạng text + phần 'file' tuỳ chọn để thêm/thay chứng thư).
// Thứ tự (S16): lưu file mới → ghi DB (tái kiểm quyền lúc ghi) → mới xoá file cũ.
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
  let input: ReturnType<typeof parseInsuranceBody>;
  try {
    input = parseInsuranceBody(merged);
  } catch (e) {
    const loi = moneyInputErrorBody(e);
    if (!loi) throw e;
    return NextResponse.json(loi.body, { status: loi.status });
  }

  const invalid = validateInsuranceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 422 });
  const refErr = await checkInsuranceContractRef(input.contractId, projectId);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  let fileCols: {
    fileName: string;
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null = null;
  if (file) {
    const checked = await checkUploadedFile(file, { accept: "document", maxBytes: MAX_DOC_BYTES });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
    const fileBuf = checked.buf;

    const fileName = newInsuranceDocFileName(id, file.type);
    await storagePut(user.orgId, fileName, fileBuf);
    fileCols = {
      fileName,
      originalName: file.name || null,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi.
  const capNhat = async () => {
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
  };
  const kq = await ghiNeuConQuyen(() => CAN.manageContracts(user.role), capNhat).catch(
    async (e: unknown) => {
      // Ghi DB lỗi ⇒ dọn file mới vừa lưu (DB vẫn trỏ file cũ) rồi ném tiếp.
      if (fileCols) await storageDelete(user.orgId, fileCols.fileName);
      throw e;
    },
  );
  if (!kq.ok) {
    // Bị thu hồi quyền lúc ghi ⇒ không ghi DB; dọn file mới, giữ nguyên file cũ.
    if (fileCols) await storageDelete(user.orgId, fileCols.fileName);
    return NextResponse.json(
      { error: "Bạn không có quyền sửa bảo hiểm/bảo lãnh (chỉ Admin/PM)" },
      { status: 403 },
    );
  }

  // DB đã trỏ file mới ⇒ xoá file cũ (best-effort, lỗi chỉ ghi log, không làm hỏng request).
  if (fileCols && existing.fileName) {
    const fileCu = existing.fileName;
    await storageDelete(user.orgId, fileCu).catch((e: unknown) =>
      log.warn("Không xoá được file chứng thư cũ", {
        route: "insurance-bonds.patch",
        fileName: fileCu,
        error: e instanceof Error ? e.message : String(e),
      }),
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

  // Soft-delete (M45 PR4): giữ row + file để khôi phục qua POST .../restore.
  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi.
  const kq = await ghiNeuConQuyen(
    () => CAN.manageContracts(user.role),
    () =>
      run(`UPDATE insurance_bonds SET deleted_at = now() WHERE id = ? AND deleted_at IS NULL`, id),
  );
  if (!kq.ok)
    return NextResponse.json(
      { error: "Bạn không có quyền xoá bảo hiểm/bảo lãnh (chỉ Admin/PM)" },
      { status: 403 },
    );

  return NextResponse.json({ deleted: id });
}
