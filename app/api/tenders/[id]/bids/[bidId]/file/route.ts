import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { newTenderBidFileName, MAX_DOC_BYTES, parseUploadedFile } from "@/lib/nen/photos";
import { storagePut, storageGet, storageDelete } from "@/lib/nen/storage";

export const dynamic = "force-dynamic";

type BidFileRow = { fileName: string | null; mimeType: string | null; originalName: string | null };

// GET /api/tenders/:id/bids/:bidId/file — tải file chào thầu gốc. Kiểm gói thầu
// cha thuộc đúng dự án đang chọn (M22) — tender_bids không có project_id riêng.
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

  const projectId = await getCurrentProjectId(user);
  const bid =
    projectId != null
      ? await withProjectScope(projectId, () =>
          queryOne<BidFileRow>(
            `SELECT tb.file_name AS "fileName", tb.mime_type AS "mimeType", tb.original_name AS "originalName"
               FROM tender_bids tb JOIN tender_packages tp ON tp.id = tb.tender_id
              WHERE tb.id = ? AND tp.project_id = ?`,
            bidId,
            projectId,
          ),
        )
      : undefined;
  if (!bid?.fileName) return NextResponse.json({ error: "Chưa có file đính kèm" }, { status: 404 });

  const buf = await storageGet(user.orgId, bid.fileName);
  if (!buf) return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": bid.mimeType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(bid.originalName ?? bid.fileName)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// POST /api/tenders/:id/bids/:bidId/file — upload file chào thầu gốc (PDF/ảnh, max
// 20MB). Kiểm gói thầu cha thuộc đúng dự án đang chọn (M22).
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

  const projectId = await getCurrentProjectId(user);
  const bid =
    projectId != null
      ? await queryOne<BidFileRow & { id: number }>(
          `SELECT tb.id, tb.file_name AS "fileName"
             FROM tender_bids tb JOIN tender_packages tp ON tp.id = tb.tender_id
            WHERE tb.id = ? AND tp.project_id = ?`,
          bidId,
          projectId,
        )
      : undefined;
  if (!bid) return NextResponse.json({ error: "Không tìm thấy báo giá" }, { status: 404 });

  const up = await parseUploadedFile(req, { accept: "document", maxBytes: MAX_DOC_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { file, buf: fileBuf } = up;

  // Xoá file cũ nếu có (mỗi báo giá chỉ giữ 1 file chào thầu gốc).
  if (bid.fileName) await storageDelete(user.orgId, bid.fileName);

  const fileName = newTenderBidFileName(bidId, file.type);
  await storagePut(user.orgId, fileName, fileBuf);

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
