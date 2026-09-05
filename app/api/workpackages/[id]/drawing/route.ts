import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, canTouchPackage } from "@/lib/bao-mat/auth";
import { newDrawingFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { storagePut, storageGet, storageDelete } from "@/lib/nen/storage";
import { visibleProjectIds } from "@/lib/ha-tang/projects";
import { packageProjectId } from "@/lib/tien-do/workpackages";

export const dynamic = "force-dynamic";

// canTouchPackage (lib/bao-mat/auth.ts) chỉ kiểm subcon có được GÁN nhóm không (trả `true` vô
// điều kiện cho mọi vai trò khác) — không kiểm dự án, nên vẫn cần packageProjectId() chặn riêng.

type WP = {
  id: number;
  drawingUrl: string | null;
  drawingFileName: string | null;
  drawingOriginalName: string | null;
};

// GET /api/workpackages/:id/drawing → phục vụ file bản vẽ đã upload.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const wp = await queryOne<WP>(
    `SELECT id, drawing_url AS "drawingUrl", drawing_file_name AS "drawingFileName",
            drawing_original_name AS "drawingOriginalName"
       FROM work_packages WHERE id = ?`,
    id,
  );
  if (!wp) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  const visible = await visibleProjectIds(user);
  const pid = await packageProjectId(id);
  if (pid == null || !visible.includes(pid))
    return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  if (!(await canTouchPackage(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được thao tác trên nhóm được giao cho mình" },
      { status: 403 },
    );
  if (!wp.drawingFileName)
    return NextResponse.json({ error: "Chưa có file bản vẽ" }, { status: 404 });

  const buf = await storageGet(user.orgId, wp.drawingFileName);
  if (!buf) return NextResponse.json({ error: "File không tồn tại" }, { status: 404 });

  const ext = wp.drawingFileName.split(".").pop()?.toLowerCase() ?? "";
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "application/octet-stream";

  const displayName = wp.drawingOriginalName ?? wp.drawingFileName;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "X-Content-Type-Options": "nosniff", // chặn browser sniff nội dung khác mime
      "Content-Length": String(buf.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// POST /api/workpackages/:id/drawing → upload file bản vẽ (PDF hoặc ảnh, tối đa 20MB).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const wp = await queryOne<{ id: number; drawingFileName: string | null }>(
    `SELECT id, drawing_file_name AS "drawingFileName" FROM work_packages WHERE id = ?`,
    id,
  );
  if (!wp) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  const visiblePost = await visibleProjectIds(user);
  const pidPost = await packageProjectId(id);
  if (pidPost == null || !visiblePost.includes(pidPost))
    return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  if (!(await canTouchPackage(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được thao tác trên nhóm được giao cho mình" },
      { status: 403 },
    );

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { file, buf: fileBuf } = up;
  const mime = file.type;
  const fileName = newDrawingFileName(id, mime);
  await storagePut(user.orgId, fileName, fileBuf);

  // Xoá file cũ sau khi ghi file mới thành công
  if (wp.drawingFileName) await storageDelete(user.orgId, wp.drawingFileName);

  const drawingUrl = `/api/workpackages/${id}/drawing`;
  await run(
    `UPDATE work_packages SET drawing_url = ?, drawing_file_name = ?, drawing_original_name = ? WHERE id = ?`,
    drawingUrl,
    fileName,
    file.name || null,
    id,
  );

  return NextResponse.json({ drawingUrl, fileName }, { status: 201 });
}

// DELETE /api/workpackages/:id/drawing → xoá file bản vẽ đã upload.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const wp = await queryOne<{ drawingFileName: string | null }>(
    `SELECT drawing_file_name AS "drawingFileName" FROM work_packages WHERE id = ?`,
    id,
  );
  // Nhóm THẬT SỰ không tồn tại: giữ nguyên hành vi cũ (xoá idempotent, không lỗi). Nhóm CÓ tồn
  // tại nhưng thuộc dự án khác (vá W0): không được lộ/xoá — 404 như đã tồn tại được.
  if (wp) {
    const visibleDel = await visibleProjectIds(user);
    const pidDel = await packageProjectId(id);
    if (pidDel == null || !visibleDel.includes(pidDel))
      return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  }
  if (!(await canTouchPackage(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được thao tác trên nhóm được giao cho mình" },
      { status: 403 },
    );

  await run(
    `UPDATE work_packages SET drawing_url = NULL, drawing_file_name = NULL, drawing_original_name = NULL WHERE id = ?`,
    id,
  );

  if (wp?.drawingFileName) await storageDelete(user.orgId, wp.drawingFileName);

  return NextResponse.json({ deleted: true });
}
