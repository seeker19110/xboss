import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { importWorkbook, analyzeWorkbook } from "@/lib/tien-do/import";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { log } from "@/lib/nen/log";
import { isContentTooLarge } from "@/lib/nen/photos";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// POST /api/import/excel  (formData: file, mode?)
// mode = "preview" → chỉ phân tích, KHÔNG ghi DB. Mặc định → import thật.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    if (!CAN.import(user.role))
      return NextResponse.json(
        { error: "Bạn không có quyền import (chỉ Admin/PM)" },
        { status: 403 },
      );

    if (isContentTooLarge(request.headers.get("content-length"), MAX_BYTES))
      return NextResponse.json(
        { error: `File quá lớn (tối đa ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      );

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Không tìm thấy file" }, { status: 400 });

    if (file.size > MAX_BYTES)
      return NextResponse.json(
        {
          error: `File quá lớn (tối đa 20 MB, file hiện tại ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        },
        { status: 413 },
      );

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

    if (formData.get("mode") === "preview") {
      const preview = analyzeWorkbook(workbook);
      if (preview.sheets.length === 0) {
        return NextResponse.json(
          { error: "File không chứa sheet TRACKING nào nhận diện được" },
          { status: 400 },
        );
      }
      return NextResponse.json({ preview });
    }

    // Mẫu số quy lưới checkbox → % (xem ImportOptions trong lib/import.ts). Mặc định
    // "columns" = hành vi cũ; chỉ đổi khi người dùng chủ động chọn, vì chọn sai chiều nào
    // cũng làm lệch % theo chiều ngược lại.
    const denominator = formData.get("denominator");
    const dimDenominator = denominator === "row-nonempty" ? "row-nonempty" : "columns";
    // Ghi sổ import (C3 §5): băm NỘI DUNG file để nhiều năm sau còn đối chiếu được đúng
    // file gốc, kể cả khi tên file đã đổi.
    const stats = await importWorkbook(workbook, {
      dimDenominator,
      source: {
        name: file.name,
        sha256: createHash("sha256").update(Buffer.from(buffer)).digest("hex"),
        bytes: file.size,
        importedBy: user.id,
      },
    });

    return NextResponse.json({
      ...stats,
      message: `✅ Import hoàn tất! ${stats.packages} nhóm, ${stats.tasks} tasks đã lưu.`,
    });
  } catch (error) {
    log.error("POST /api/import/excel lỗi", {
      route: "POST /api/import/excel",
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Lỗi xử lý file — vui lòng kiểm tra định dạng Excel" },
      { status: 500 },
    );
  }
}
