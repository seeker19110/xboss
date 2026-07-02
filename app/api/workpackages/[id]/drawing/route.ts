import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, canTouchPackage } from "@/lib/auth";
import {
  ensureUploadDir,
  newDrawingFileName,
  photoPath,
  MAX_DOC_BYTES,
  extForDocMime,
} from "@/lib/photos";
import { createReadStream, statSync, existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

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
  if (!wp.drawingFileName)
    return NextResponse.json({ error: "Chưa có file bản vẽ" }, { status: 404 });

  const filePath = photoPath(wp.drawingFileName);
  if (!filePath || !existsSync(filePath))
    return NextResponse.json({ error: "File không tồn tại" }, { status: 404 });

  const stat = statSync(filePath);
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
  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "X-Content-Type-Options": "nosniff", // chặn browser sniff nội dung khác mime
      "Content-Length": String(stat.size),
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
  if (!(await canTouchPackage(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được thao tác trên nhóm được giao cho mình" },
      { status: 403 },
    );

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
  if (file.size > MAX_DOC_BYTES)
    return NextResponse.json(
      { error: `File vượt quá ${MAX_DOC_BYTES / 1024 / 1024}MB` },
      { status: 413 },
    );

  const mime = file.type;
  if (!extForDocMime(mime))
    return NextResponse.json({ error: "Chỉ nhận PDF hoặc ảnh" }, { status: 415 });

  const dir = ensureUploadDir();
  const fileName = newDrawingFileName(id, mime);
  const bytes = await file.arrayBuffer();
  await writeFile(join(dir, fileName), Buffer.from(bytes));

  // Xoá file cũ sau khi ghi file mới thành công
  if (wp.drawingFileName) {
    const oldPath = photoPath(wp.drawingFileName);
    if (oldPath) await unlink(oldPath).catch(() => {});
  }

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
  if (!(await canTouchPackage(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được thao tác trên nhóm được giao cho mình" },
      { status: 403 },
    );

  const wp = await queryOne<{ drawingFileName: string | null }>(
    `SELECT drawing_file_name AS "drawingFileName" FROM work_packages WHERE id = ?`,
    id,
  );

  await run(
    `UPDATE work_packages SET drawing_url = NULL, drawing_file_name = NULL, drawing_original_name = NULL WHERE id = ?`,
    id,
  );

  if (wp?.drawingFileName) {
    const oldPath = photoPath(wp.drawingFileName);
    if (oldPath) await unlink(oldPath).catch(() => {});
  }

  return NextResponse.json({ deleted: true });
}
