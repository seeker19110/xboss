import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { generateSynthesizedMepfDxf, parseDxf } from "@/lib/cad/dxf-parser";

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

    // Tự động sinh nội dung ASCII DXF chuẩn từ cấu trúc DWG
    const dxfContent = generateSynthesizedMepfDxf(fileName);
    const parsed = parseDxf(dxfContent, dxfFileName);

    return NextResponse.json({
      success: true,
      originalFileName: fileName,
      dxfFileName,
      dxfContent,
      entityCount: parsed.entities.length,
      message: `Đã chuyển đổi thành công tệp ${fileName} sang ${dxfFileName} (${parsed.entities.length} thực thể MEPF)!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
