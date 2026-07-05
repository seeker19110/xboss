import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  ensureUploadDir,
  extForDocMime,
  newTenderBidFileName,
  photoPath,
  MAX_DOC_BYTES,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

type BidFileRow = { fileName: string | null; mimeType: string | null; originalName: string | null };

// GET /api/tenders/:id/bids/:bidId/file — tải file chào thầu gốc.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; bidId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewTenders(user.role))
    return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });

  const bidId = parseInt(params.bidId);
  if (isNaN(bidId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const bid = await queryOne<BidFileRow>(
    `SELECT file_name AS "fileName", mime_type AS "mimeType", original_name AS "originalName"
       FROM tender_bids WHERE id = ?`,
    bidId,
  );
  if (!bid?.fileName) return NextResponse.json({ error: "Chưa có file đính kèm" }, { status: 404 });

  const path = photoPath(bid.fileName);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": bid.mimeType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(bid.originalName ?? bid.fileName)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// POST /api/tenders/:id/bids/:bidId/file — upload file chào thầu gốc (PDF/ảnh, max 20MB).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string; bidId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageTenders(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload file (chỉ Admin/PM)" },
      { status: 403 },
    );

  const bidId = parseInt(params.bidId);
  if (isNaN(bidId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const bid = await queryOne<BidFileRow & { id: number }>(
    `SELECT id, file_name AS "fileName" FROM tender_bids WHERE id = ?`,
    bidId,
  );
  if (!bid) return NextResponse.json({ error: "Không tìm thấy báo giá" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

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

  // Xoá file cũ nếu có (mỗi báo giá chỉ giữ 1 file chào thầu gốc).
  if (bid.fileName) {
    const oldPath = photoPath(bid.fileName);
    if (oldPath)
      await unlink(oldPath).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  const fileName = newTenderBidFileName(bidId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  await run(
    `UPDATE tender_bids SET file_name = ?, original_name = ?, mime_type = ?, size_bytes = ? WHERE id = ?`,
    fileName,
    file.name || null,
    file.type,
    file.size,
    bidId,
  );

  return NextResponse.json({ fileName, sizeBytes: file.size }, { status: 201 });
}
