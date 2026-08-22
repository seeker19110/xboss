import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { parseDwgBinary, exportDxf } from "@/lib/cad/dxf-parser";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/convert-to-dxf — Chuyển đổi tệp CAD DWG sang DXF chuẩn trước khi xử lý
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập module CAD/BIM" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const fileName = body.fileName || "drawing.dwg";
    const dxfFileName = fileName.replace(/\.dwg$/i, ".dxf");
    const fileBase64 = body.fileBase64;

    if (!fileBase64) {
      return NextResponse.json(
        { error: "Cần cung cấp dữ liệu tệp DWG (fileBase64) để thực hiện chuyển đổi." },
        { status: 422 },
      );
    }

    const buffer = Buffer.from(fileBase64, "base64");
    const parsed = parseDwgBinary(buffer, fileName);

    // Xuất chuỗi DXF ASCII hoàn chỉnh theo chuẩn AutoCAD
    const dxfContent = exportDxf(parsed, { applyStandardLayers: true });

    return NextResponse.json({
      success: true,
      originalFileName: fileName,
      dxfFileName,
      dxfContent,
      entityCount: parsed.entities.length,
      message: `Đã chuyển đổi thành công tệp thật ${fileName} sang ${dxfFileName} (${parsed.entities.length} thực thể)!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
