import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN, canTouchPackage } from "@/lib/auth";
import {
  ensureUploadDir,
  newBbntFileName,
  photoPath,
  MAX_DOC_BYTES,
  extForDocMime,
  extForMime,
  verifyFileMime,
} from "@/lib/photos";
import { createReadStream, statSync, existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

type WP = {
  id: number;
  bbntUrl: string | null;
  bbntFileName: string | null;
  bbntOriginalName: string | null;
};

// GET /api/workpackages/:id/bbnt → phục vụ file biên bản nghiệm thu đã upload.
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
    `SELECT id, bbnt_url AS "bbntUrl", bbnt_file_name AS "bbntFileName",
            bbnt_original_name AS "bbntOriginalName"
       FROM work_packages WHERE id = ?`,
    id,
  );
  if (!wp) return NextResponse.json({ error: "Không tìm thấy nhóm" }, { status: 404 });
  if (!(await canTouchPackage(user, id)))
    return NextResponse.json(
      { error: "Bạn chỉ được thao tác trên nhóm được giao cho mình" },
      { status: 403 },
    );
  if (!wp.bbntFileName)
    return NextResponse.json({ error: "Chưa có file biên bản" }, { status: 404 });

  const filePath = photoPath(wp.bbntFileName);
  if (!filePath || !existsSync(filePath))
    return NextResponse.json({ error: "File không tồn tại" }, { status: 404 });

  const stat = statSync(filePath);
  const ext = wp.bbntFileName.split(".").pop()?.toLowerCase() ?? "";
  const mime =
    ext === "pdf"
      ? "application/pdf"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "gif"
              ? "image/gif"
              : "application/octet-stream";

  const displayName = wp.bbntOriginalName ?? wp.bbntFileName;
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

// POST /api/workpackages/:id/bbnt → upload biên bản nghiệm thu (PDF hoặc ảnh, tối đa 20MB).
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

  const wp = await queryOne<{ id: number; bbntFileName: string | null }>(
    `SELECT id, bbnt_file_name AS "bbntFileName" FROM work_packages WHERE id = ?`,
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
  if (!extForDocMime(mime) && !extForMime(mime))
    return NextResponse.json({ error: "Chỉ nhận PDF hoặc ảnh" }, { status: 415 });

  const bytes = await file.arrayBuffer();
  const fileBuf = Buffer.from(bytes);
  if (!verifyFileMime(fileBuf, mime))
    return NextResponse.json(
      { error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)" },
      { status: 415 },
    );

  const dir = ensureUploadDir();
  const fileName = newBbntFileName(id, mime);
  await writeFile(join(dir, fileName), fileBuf);

  // Xoá file cũ sau khi ghi file mới thành công
  if (wp.bbntFileName) {
    const oldPath = photoPath(wp.bbntFileName);
    if (oldPath) await unlink(oldPath).catch(() => {});
  }

  const bbntUrl = `/api/workpackages/${id}/bbnt`;
  await run(
    `UPDATE work_packages SET bbnt_url = ?, bbnt_file_name = ?, bbnt_original_name = ? WHERE id = ?`,
    bbntUrl,
    fileName,
    file.name || null,
    id,
  );

  return NextResponse.json({ bbntUrl, fileName }, { status: 201 });
}

// DELETE /api/workpackages/:id/bbnt → xoá biên bản đã upload.
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

  const wp = await queryOne<{ bbntFileName: string | null }>(
    `SELECT bbnt_file_name AS "bbntFileName" FROM work_packages WHERE id = ?`,
    id,
  );

  await run(
    `UPDATE work_packages SET bbnt_url = NULL, bbnt_file_name = NULL, bbnt_original_name = NULL WHERE id = ?`,
    id,
  );

  if (wp?.bbntFileName) {
    const oldPath = photoPath(wp.bbntFileName);
    if (oldPath) await unlink(oldPath).catch(() => {});
  }

  return NextResponse.json({ deleted: true });
}
