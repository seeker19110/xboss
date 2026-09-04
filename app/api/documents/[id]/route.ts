import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageDelete } from "@/lib/nen/storage";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, canTouchTask, canTouchFloor, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { sha256Hex } from "@/lib/nen/photos";

export const dynamic = "force-dynamic";

/**
 * Tài liệu này có thuộc dự án đang chọn không.
 *
 * PHẢI kiểm riêng, KHÔNG dựa vào `canTouchTask`/`canTouchFloor`: hai hàm đó chỉ trả lời câu
 * "subcon này có được giao việc đó không" và trả `true` NGAY cho mọi vai trò khác — chúng
 * không hề so dự án. Route lại chỉ tra `WHERE id = ?`, nên trước bản vá này bất kỳ người dùng
 * không phải subcon (pm/engineer/admin/bch/cdt/viewer) đang ở dự án A chỉ cần biết id một tài
 * liệu của dự án B là TẢI ĐƯỢC NGUYÊN VĂN FILE (GET) hoặc XOÁ ĐƯỢC nó (DELETE). Id là số
 * nguyên tăng dần nên đoán được.
 *
 * Tài liệu gắn task → suy dự án qua tasks → work_packages → sheet_types → towers.
 * Tài liệu là biên bản nghiệm thu tầng → suy qua floor_approvals → sheet_types → towers.
 */
async function thuocDuAnDangChon(
  doc: { task_id: number | null; floor_approval_id: number | null },
  projectId: number,
): Promise<boolean> {
  if (doc.floor_approval_id != null) {
    const row = await queryOne<{ n: number }>(
      `SELECT 1 AS n
         FROM floor_approvals fa
         JOIN sheet_types st ON st.id = fa.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE fa.id = ? AND tw.project_id = ?`,
      doc.floor_approval_id,
      projectId,
    );
    return !!row;
  }
  if (doc.task_id == null) return false;
  const row = await queryOne<{ n: number }>(
    `SELECT 1 AS n
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE t.id = ? AND tw.project_id = ?`,
    doc.task_id,
    projectId,
  );
  return !!row;
}

type DocRow = {
  id: number;
  file_name: string;
  mime_type: string;
  original_name: string | null;
  uploaded_by: number | null;
  floor_approval_id: number | null;
  link_url: string | null;
  task_id: number | null;
  sha256: string | null;
};

// GET /api/documents/:id → trả về nội dung file biên bản/tài liệu (cần đăng nhập + có quyền xem
// task, hoặc quyền xem tầng nếu là biên bản nghiệm thu tầng — floor_approval_id, không có task_id).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const doc = await queryOne<DocRow>(
    `SELECT id, file_name, mime_type, original_name, uploaded_by, floor_approval_id, link_url, task_id, sha256 FROM task_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  // Tài liệu của dự án khác → 404 (không phải 403), để không tiết lộ nó có tồn tại.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null || !(await thuocDuAnDangChon(doc, projectId)))
    return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.floor_approval_id != null) {
    const approval = await queryOne<{ sheetTypeId: number; floorLabel: string }>(
      `SELECT sheet_type_id AS "sheetTypeId", floor_label AS "floorLabel" FROM floor_approvals WHERE id = ?`,
      doc.floor_approval_id,
    );
    if (!approval || !(await canTouchFloor(user, approval.sheetTypeId, approval.floorLabel)))
      return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });
  } else if (!(await canTouchTask(user, doc.task_id as number))) {
    return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });
  }

  if (doc.link_url) {
    // Chỉ redirect tới http(s) — chặn open redirect / scheme lạ (javascript:, data:).
    let safe = false;
    try {
      const u = new URL(doc.link_url);
      safe = u.protocol === "https:" || u.protocol === "http:";
    } catch {
      /* URL hỏng */
    }
    if (!safe) return NextResponse.json({ error: "Link không hợp lệ" }, { status: 400 });
    return NextResponse.redirect(doc.link_url, { status: 302 });
  }

  const buf = await storageGet(user.orgId, doc.file_name);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

  // Đối chiếu hash lưu lúc upload (M43 PR3) — file bị tráo/hỏng trên đĩa sẽ lệch hash.
  // sha256 NULL (upload trước PR3) thì bỏ qua, không có gì để so.
  if (doc.sha256 && sha256Hex(buf) !== doc.sha256) {
    return NextResponse.json(
      { error: "File trên đĩa không khớp hash lưu trong DB — có thể đã bị tráo/hỏng." },
      { status: 409 },
    );
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime_type,
      "X-Content-Type-Options": "nosniff", // chặn browser sniff nội dung khác mime
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name ?? doc.file_name)}"`,
      "Cache-Control": "private, max-age=31536000, immutable", // file bất biến theo id — cache 1 năm
    },
  });
}

// DELETE /api/documents/:id → xoá tài liệu. Người upload hoặc Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const doc = await queryOne<DocRow>(
    `SELECT id, file_name, mime_type, original_name, uploaded_by, floor_approval_id, task_id FROM task_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null || !(await thuocDuAnDangChon(doc, projectId)))
    return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM task_documents WHERE id = ?`, id);
  // Chỉ xoá file vật lý với document upload (link document có file_name = '' — không có file)
  if (doc.file_name) {
    await storageDelete(user.orgId, doc.file_name);
  }

  return NextResponse.json({ deleted: id });
}
