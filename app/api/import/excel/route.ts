import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { importWorkbook } from "@/lib/import";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const role = getCurrentUser()?.role;
    if (!CAN.import(role)) return NextResponse.json({ error: "Bạn không có quyền import (chỉ Admin/PM)" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Không tìm thấy file" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const stats = await importWorkbook(workbook);

    return NextResponse.json({
      ...stats,
      message: `✅ Import hoàn tất! ${stats.packages} nhóm, ${stats.tasks} tasks đã lưu.`,
    });
  } catch (error) {
    console.error("Import Error:", error);
    return NextResponse.json({ error: (error as Error).message || "Lỗi server" }, { status: 500 });
  }
}
