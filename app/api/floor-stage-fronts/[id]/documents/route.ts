import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  ensureUploadDir,
  extForDocMime,
  verifyFileMime,
  newFloorStageFrontFileName,
  MAX_DOC_BYTES,
  isContentTooLarge,
} from "@/lib/photos";

export const dynamic = "force-dynamic";

const DOC_KINDS = ["handover", "completion", "debris", "other"] as const;
type DocKind = (typeof DOC_KINDS)[number];

// GET /api/floor-stage-fronts/:id/documents — biên bản bàn giao/ảnh hoàn thiện của 1 ô
// (tầng × công tác) trong trang mặt bằng bản mới.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const frontId = parseInt(params.id);
  if (isNaN(frontId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const documents = await query(
    `SELECT d.id, d.file_name AS "fileName", d.mime, d.doc_kind AS "docKind",
            d.created_at AS "createdAt", d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM floor_stage_front_documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.floor_stage_front_id = ? ORDER BY d.id DESC`,
    frontId,
  );
  return NextResponse.json({ documents });
}

// POST /api/floor-stage-fronts/:id/documents — upload biên bản/ảnh (PDF/ảnh, max 20MB).
// Form field `file` bắt buộc, `kind` tuỳ chọn (handover|completion|other, mặc định other).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền upload tài liệu mặt bằng (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const frontId = parseInt(params.id);
  if (isNaN(frontId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const front = await queryOne<{ id: number }>(
    `SELECT id FROM floor_stage_fronts WHERE id = ?`,
    frontId,
  );
  if (!front) return NextResponse.json({ error: "Không tìm thấy mặt bằng" }, { status: 404 });

  if (isContentTooLarge(req.headers.get("content-length"), MAX_DOC_BYTES))
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${MAX_DOC_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File))
    return NextResponse.json({ error: "Thiếu file (field 'file')" }, { status: 400 });

  const kindRaw = form.get("kind");
  const docKind: DocKind =
    typeof kindRaw === "string" && (DOC_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as DocKind)
      : "other";

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

  const fileBuf = Buffer.from(await file.arrayBuffer());
  if (!verifyFileMime(fileBuf, file.type))
    return NextResponse.json(
      { error: "Nội dung file không khớp định dạng khai báo (Content-Type giả mạo?)" },
      { status: 415 },
    );

  const fileName = newFloorStageFrontFileName(frontId, file.type);
  const dir = ensureUploadDir();
  await writeFile(join(dir, fileName), fileBuf);

  const id = await insertId(
    `INSERT INTO floor_stage_front_documents
       (floor_stage_front_id, file_path, file_name, mime, doc_kind, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    frontId,
    fileName,
    fileName,
    file.type,
    docKind,
    user.id,
  );

  return NextResponse.json({ id, floorStageFrontId: frontId }, { status: 201 });
}
