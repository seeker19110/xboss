// app/api/systems/[code]/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { getCurrentProjectId } from "@/lib/projects";
import { parsePlanUpload, parseTrackingUpload } from "@/lib/system-upload";
import { isContentTooLarge, newSystemUploadFileName } from "@/lib/photos";
import { storagePut } from "@/lib/storage";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_EXCEL_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ code: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Kiểm quyền Admin
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Chỉ Admin được upload kế hoạch/tracking theo hệ" },
      { status: 403 },
    );
  }

  const { code } = await paramsP;
  const systemId = await resolveSystemId(code);
  if (!systemId || systemId === -1) {
    return NextResponse.json({ error: "Không tìm thấy hệ" }, { status: 404 });
  }

  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "ke_hoach" && kind !== "tracking") {
    return NextResponse.json({ error: "Tham số kind không hợp lệ" }, { status: 400 });
  }

  // Kiểm tra kích thước sớm qua header
  if (isContentTooLarge(req.headers.get("content-length"), MAX_EXCEL_BYTES)) {
    return NextResponse.json({ error: "File quá lớn (tối đa 20MB)" }, { status: 413 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Không tìm thấy file upload" }, { status: 400 });
  }

  if (file.size > MAX_EXCEL_BYTES) {
    return NextResponse.json({ error: "File quá lớn (tối đa 20MB)" }, { status: 413 });
  }

  const allowedMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (file.type !== allowedMime && !file.name.endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Định dạng file không hợp lệ (chỉ nhận file .xlsx)" },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const projectId = await getCurrentProjectId(user);

  try {
    let result;
    if (kind === "ke_hoach") {
      result = await parsePlanUpload(systemId, projectId, buffer, user.name);
    } else {
      result = await parseTrackingUpload(systemId, projectId, buffer, user.name);
    }

    // Lưu file gốc
    const fileName = newSystemUploadFileName(systemId, kind, allowedMime);
    await storagePut(user.orgId, fileName, buffer);

    // Ghi nhận lịch sử upload
    const insertRes = await query<{ id: number }>(
      `INSERT INTO system_uploads (system_id, project_id, kind, file_name, original_name, uploaded_by, row_count, matched_count, unmatched_count, warnings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
       RETURNING id`,
      [
        systemId,
        projectId,
        kind,
        fileName,
        file.name,
        user.id,
        result.rowCount,
        result.matched,
        result.unmatched,
        JSON.stringify(result.warnings),
      ],
    );

    return NextResponse.json({
      rowCount: result.rowCount,
      matched: result.matched,
      unmatched: result.unmatched,
      warnings: result.warnings,
      uploadId: insertRes[0]?.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Lỗi xử lý file upload" }, { status: 400 });
  }
}
