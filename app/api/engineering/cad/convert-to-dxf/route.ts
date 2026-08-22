import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { parseDwgBinary, DxfLayerInfo, DxfEntityRaw } from "@/lib/cad/dxf-parser";

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

    // Xuất chuỗi DXF ASCII thật từ các thực thể đã trích xuất
    let dxfContent = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n`;
    parsed.layers.forEach((l) => {
      dxfContent += `0\nLAYER\n2\n${l.name}\n62\n${l.colorNumber}\n6\n${l.lineType}\n`;
    });
    dxfContent += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
    parsed.entities.forEach((ent) => {
      if (ent.type === "LINE" && ent.coordinates.start && ent.coordinates.end) {
        dxfContent += `0\nLINE\n8\n${ent.layer}\n10\n${ent.coordinates.start[0]}\n20\n${ent.coordinates.start[1]}\n30\n${ent.coordinates.start[2]}\n11\n${ent.coordinates.end[0]}\n21\n${ent.coordinates.end[1]}\n31\n${ent.coordinates.end[2]}\n`;
      } else if (ent.type === "TEXT" && ent.coordinates.center) {
        dxfContent += `0\nTEXT\n8\n${ent.layer}\n10\n${ent.coordinates.center[0]}\n20\n${ent.coordinates.center[1]}\n30\n${ent.coordinates.center[2]}\n1\n${ent.decodedText || ent.textValue || ""}\n`;
      }
    });
    dxfContent += `0\nENDSEC\n0\nEOF\n`;

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
