import { NextRequest, NextResponse } from "next/server";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  ensureUploadDir,
  extForDocMime,
  newHandoverMinutesFileName,
  photoPath,
  MAX_DOC_BYTES,
} from "@/lib/photos";
import {
  parseHandoverItemBody,
  validateHandoverItemInput,
  type HandoverItemInput,
} from "@/lib/handover";

export const dynamic = "force-dynamic";

type ExistingRow = HandoverItemInput & { minutesFile: string | null };

async function loadExisting(
  id: number,
  projectId: number | null,
): Promise<ExistingRow | undefined> {
  if (projectId == null) return undefined;
  return queryOne<ExistingRow>(
    `SELECT title, discipline_id AS "disciplineId", work_package_id AS "workPackageId",
            status, handover_date AS "handoverDate", minutes_file AS "minutesFile"
       FROM handover_items WHERE id = ? AND project_id = ?`,
    id,
    projectId,
  );
}

// GET /api/handover-items/:id — chi tiết hạng mục bàn giao. Scoped theo dự án (M22).
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
  const item =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT h.id, h.project_id AS "projectId", h.title,
                  h.discipline_id AS "disciplineId", d.code AS "disciplineCode", d.name AS "disciplineName",
                  h.work_package_id AS "workPackageId", wp.code AS "workPackageCode", wp.name AS "workPackageName",
                  h.status, h.handover_date AS "handoverDate", h.minutes_file AS "minutesFile",
                  h.created_by AS "createdBy", u.name AS "createdByName", h.created_at AS "createdAt"
             FROM handover_items h
             LEFT JOIN disciplines d ON d.id = h.discipline_id
             LEFT JOIN work_packages wp ON wp.id = h.work_package_id
             LEFT JOIN users u ON u.id = h.created_by
            WHERE h.id = ? AND h.project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!item) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  return NextResponse.json({ item });
}

// PATCH /api/handover-items/:id — sửa (manageHandover: Admin/PM/kỹ sư). Nhận JSON (chỉ
// sửa field) hoặc multipart/form-data (kèm 'file' để thêm/thay biên bản — xoá file cũ
// nếu có). Đổi status='accepted' cần CAN.approve — khoá FOR UPDATE trong transaction,
// cùng pattern nghiệm thu 2 bước (POST /api/tasks/:id/approve).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hạng mục bàn giao (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  let bodyFields: Record<string, unknown>;
  let file: File | null = null;

  if (contentType.startsWith("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form)
      return NextResponse.json({ error: "Dữ liệu multipart không hợp lệ" }, { status: 400 });
    bodyFields = {};
    for (const key of ["title", "disciplineId", "workPackageId", "status", "handoverDate"]) {
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
  for (const key of ["title", "disciplineId", "workPackageId", "status", "handoverDate"])
    if (key in bodyFields) merged[key] = bodyFields[key];
  const input = parseHandoverItemBody(merged);

  const invalid = validateHandoverItemInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.disciplineId != null) {
    if (!(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, input.disciplineId)))
      return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }
  if (input.workPackageId != null) {
    if (!(await queryOne(`SELECT id FROM work_packages WHERE id = ?`, input.workPackageId)))
      return NextResponse.json({ error: "Nhóm công việc không tồn tại" }, { status: 422 });
  }

  const changingToAccepted = input.status === "accepted" && existing.status !== "accepted";
  if (changingToAccepted && !CAN.approve(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM được đặt trạng thái Đã nghiệm thu" },
      { status: 403 },
    );

  let minutesFile: string | null = existing.minutesFile;
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
    if (existing.minutesFile) {
      const oldPath = photoPath(existing.minutesFile);
      if (oldPath)
        await unlink(oldPath).catch(() => {
          /* file đã mất trên đĩa — bỏ qua */
        });
    }
    minutesFile = newHandoverMinutesFileName(id, file.type);
    const dir = ensureUploadDir();
    await writeFile(join(dir, minutesFile), Buffer.from(await file.arrayBuffer()));
  }

  try {
    await withTransaction(async () => {
      // FOR UPDATE để tránh 2 người cùng duyệt/đổi trạng thái đồng thời.
      const locked = await queryOne<{ status: string }>(
        `SELECT status FROM handover_items WHERE id = ? FOR UPDATE`,
        id,
      );
      if (!locked) throw Object.assign(new Error("Không tìm thấy hạng mục"), { status: 404 });

      await run(
        `UPDATE handover_items SET title = ?, discipline_id = ?, work_package_id = ?, status = ?,
                handover_date = ?, minutes_file = ?
          WHERE id = ?`,
        input.title,
        input.disciplineId,
        input.workPackageId,
        input.status,
        input.handoverDate,
        minutesFile,
        id,
      );
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/handover-items/:id — xoá hạng mục bàn giao (manageHandover: Admin/PM/kỹ
// sư) + file biên bản trên đĩa nếu có.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xoá hạng mục bàn giao (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing = await loadExisting(id, projectId);
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hạng mục" }, { status: 404 });

  await run(`DELETE FROM handover_items WHERE id = ?`, id);
  if (existing.minutesFile) {
    const p = photoPath(existing.minutesFile);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
