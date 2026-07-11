import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { parseBoqWorkbook, previewBoqImport, commitBoqImport } from "@/lib/boq-import";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, khớp /api/import/excel

// POST /api/boq/import  (formData: file, systemId)  ?commit=1 mới ghi DB.
// Không commit → chỉ phân tích + preview (mã sẽ sinh, dòng lỗi trùng mã nếu có).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.import(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền import (chỉ Admin/PM)" },
      { status: 403 },
    );

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Không tìm thấy file" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      {
        error: `File quá lớn (tối đa 20 MB, file hiện tại ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      },
      { status: 413 },
    );

  const systemId = Number(formData?.get("systemId"));
  if (!Number.isInteger(systemId))
    return NextResponse.json({ error: "Thiếu hệ (system) để gán cho dòng BOQ" }, { status: 422 });
  const system = await queryOne<{ code: string }>(
    `SELECT code FROM systems WHERE id = ?`,
    systemId,
  );
  if (!system) return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    return NextResponse.json(
      { error: "Không đọc được file — vui lòng kiểm tra định dạng Excel" },
      { status: 400 },
    );
  }

  const parsed = parseBoqWorkbook(workbook);
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: parsed.warnings[0] ?? "Không tìm thấy dòng hạng mục hợp lệ nào" },
      { status: 400 },
    );
  }

  const commit = req.nextUrl.searchParams.get("commit") === "1";

  if (!commit) {
    const preview = await previewBoqImport(parsed.rows, system.code);
    return NextResponse.json({
      preview,
      detectedSystemCode: parsed.detectedSystemCode,
      warnings: parsed.warnings,
      skippedTowerBOnly: parsed.skippedTowerBOnly,
    });
  }

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để import BOQ" }, { status: 422 });

  const result = await commitBoqImport(parsed.rows, systemId, system.code, projectId);
  return NextResponse.json(result);
}
