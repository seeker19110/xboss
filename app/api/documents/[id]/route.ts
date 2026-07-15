import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, canTouchTask, canTouchFloor, CAN } from "@/lib/auth";
import { photoPath, sha256Hex } from "@/lib/photos";

export const dynamic = "force-dynamic";

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

  const path = photoPath(doc.file_name);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

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
    `SELECT id, file_name, mime_type, original_name, uploaded_by, floor_approval_id FROM task_documents WHERE id = ?`,
    id,
  );
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM task_documents WHERE id = ?`, id);
  // Chỉ xoá file vật lý với document upload (link document có file_name = '' — không có file)
  if (doc.file_name) {
    const path = photoPath(doc.file_name);
    if (path)
      await unlink(path).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
