import { NextRequest, NextResponse } from "next/server";
import { storageGet, storageDelete } from "@/lib/nen/storage";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { taskProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

type PhotoRow = {
  id: number;
  file_name: string;
  mime_type: string;
  uploaded_by: number | null;
  task_id: number | null;
  album_id: number | null;
};

/**
 * Ảnh này có thuộc dự án đang chọn không (vá W6, Đợt 5).
 *
 * PHẢI kiểm riêng, KHÔNG dựa vào `canTouchTask`: hàm đó chỉ trả lời "subcon có được giao
 * task này không" và trả `true` VÔ ĐIỀU KIỆN cho mọi vai trò khác — không hề so dự án. Trước
 * bản vá này, mọi vai trò không phải subcon ở dự án A chỉ cần biết id ảnh của dự án B là xem/
 * xoá được nguyên văn ảnh đó (id đoán được).
 *
 * Ảnh gắn task → suy dự án qua task → work_package → sheet_type → tower (taskProjectId).
 * Ảnh album mốc tiến độ (M31, task_id NULL, album_id có) → suy qua progress_albums.project_id
 * (cột trực tiếp). Ảnh không gắn task lẫn không gắn album (dữ liệu cũ trước M31/M22, nếu còn)
 * không suy được dự án nào → mặc định KHÔNG cho thấy (an toàn hơn cho lộ xuyên dự án).
 */
async function thuocDuAnDangChon(
  photo: { task_id: number | null; album_id: number | null },
  projectId: number,
): Promise<boolean> {
  if (photo.album_id != null) {
    const row = await queryOne<{ n: number }>(
      `SELECT 1 AS n FROM progress_albums WHERE id = ? AND project_id = ?`,
      photo.album_id,
      projectId,
    );
    return !!row;
  }
  if (photo.task_id == null) return false;
  return (await taskProjectId(photo.task_id)) === projectId;
}

// GET /api/photos/:id → trả về nội dung file ảnh (cần đăng nhập + có quyền xem task).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const photo = await queryOne<PhotoRow>(
    `SELECT id, file_name, mime_type, uploaded_by, task_id, album_id FROM task_photos WHERE id = ?`,
    id,
  );
  if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  if (projectId == null || !(await thuocDuAnDangChon(photo, projectId)))
    return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  if (photo.task_id != null && !(await canTouchTask(user, photo.task_id)))
    return NextResponse.json({ error: "Không có quyền xem ảnh này" }, { status: 403 });

  const buf = await storageGet(user.orgId, photo.file_name);
  if (!buf) return NextResponse.json({ error: "File ảnh không còn trên đĩa" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": photo.mime_type,
      "X-Content-Type-Options": "nosniff", // chặn browser sniff nội dung khác mime
      "Cache-Control": "private, max-age=31536000, immutable", // ảnh bất biến theo id — cache 1 năm
    },
  });
}

// DELETE /api/photos/:id → xoá ảnh. Người upload hoặc Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("field", projectId);
  if (blocked) return blocked;

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const photo = await queryOne<PhotoRow>(
    `SELECT id, file_name, mime_type, uploaded_by, task_id, album_id FROM task_photos WHERE id = ?`,
    id,
  );
  if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  // Cách ly dự án (vá W6, Đợt 5) — xem ghi chú `thuocDuAnDangChon` ở trên; DELETE trước đây
  // lỏng hơn GET (không kiểm gì ngoài uploaded_by/editStructure).
  if (projectId == null || !(await thuocDuAnDangChon(photo, projectId)))
    return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  if (photo.uploaded_by !== user.id && !CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM được xoá ảnh" },
      { status: 403 },
    );

  await run(`DELETE FROM task_photos WHERE id = ?`, id);
  await storageDelete(user.orgId, photo.file_name);

  return NextResponse.json({ deleted: id });
}
