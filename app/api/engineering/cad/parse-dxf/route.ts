import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { parseDxf, generateStandardizedAutocadScript } from "@/lib/cad/dxf-parser";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

// Sample DXF generator for design drawing preview when drawing has no raw file uploaded yet
function generateSampleDxfForDrawing(
  code: string,
  name: string,
  systemGroup?: string | null,
): string {
  const isHvac =
    !systemGroup ||
    systemGroup.includes("M") ||
    systemGroup.includes("GIÓ") ||
    systemGroup.includes("HVAC");
  const isPlumb = systemGroup?.includes("P") || systemGroup?.includes("NƯỚC");
  const isElec = systemGroup?.includes("E") || systemGroup?.includes("ĐIỆN");
  const isFire = systemGroup?.includes("F") || systemGroup?.includes("PCCC");

  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n`;

  // Layers
  dxf += `0\nLAYER\n2\n01_ONG_GIO_CAP\n62\n140\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n02_ONG_GIO_HOI\n62\n150\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nDIEN_MANG_CAP_DONG_LUC\n62\n40\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nNUOC_LANH_PPR\n62\n70\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nCAP_THOAT_NUOC_THAI\n62\n170\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nPCCC_ONG_CHUA_CHAY\n62\n10\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\nTRUC_LUOI_DANG_THEP\n62\n8\n6\nCENTER\n`;
  dxf += `0\nLAYER\n2\nTEXT_GHI_CHU\n62\n7\n6\nCONTINUOUS\n`;
  dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // HVAC Routes
  dxf += `0\nLINE\n8\n01_ONG_GIO_CAP\n10\n1200\n20\n2400\n30\n3100\n11\n15400\n21\n2400\n31\n3100\n`;
  dxf += `0\nLINE\n8\n02_ONG_GIO_HOI\n10\n1200\n1600\n30\n3100\n11\n15400\n21\n1600\n31\n3100\n`;
  dxf += `0\nTEXT\n8\nTEXT_GHI_CHU\n10\n4000\n20\n2450\n30\n3100\n1\nèng giã cÊp l¹nh AHU-01 800x500 BOP=+2.85m\n`;

  // Electrical Tray
  dxf += `0\nLINE\n8\nDIEN_MANG_CAP_DONG_LUC\n10\n1200\n3200\n30\n2900\n11\n15400\n21\n3200\n31\n2900\n`;
  dxf += `0\nTEXT\n8\nTEXT_GHI_CHU\n10\n5000\n20\n3250\n30\n2900\n1\nM¸ng c¸p 400x100 ®éng lùc h¹ thÕ\n`;

  // Chiller Pipes & Drainage
  dxf += `0\nLINE\n8\nNUOC_LANH_PPR\n10\n1200\n3800\n30\n2600\n11\n15400\n21\n3800\n31\n2600\n`;
  dxf += `0\nTEXT\n8\nTEXT_GHI_CHU\n10\n6000\n20\n3850\n30\n2600\n1\nèng n−íc l¹nh Chiller Supply DN150 %%c168\n`;
  dxf += `0\nLINE\n8\nCAP_THOAT_NUOC_THAI\n10\n1200\n4200\n30\n2550\n11\n15400\n21\n4200\n31\n2337\n`;
  dxf += `0\nTEXT\n8\nTEXT_GHI_CHU\n10\n7000\n20\n4250\n30\n2450\n1\nèng thãt n−íc D114 dèc i=1.5% BOP=+2250\n`;

  // Firefighting
  dxf += `0\nLINE\n8\nPCCC_ONG_CHUA_CHAY\n10\n1200\n4600\n30\n2700\n11\n15400\n21\n4600\n31\n2700\n`;
  dxf += `0\nINSERT\n8\nPCCC_ONG_CHUA_CHAY\n2\nBLK_SPRINKLER_PENDENT\n10\n3000\n20\n4600\n30\n2700\n`;
  dxf += `0\nINSERT\n8\nPCCC_ONG_CHUA_CHAY\n2\nBLK_SPRINKLER_PENDENT\n10\n6000\n20\n4600\n30\n2700\n`;
  dxf += `0\nINSERT\n8\n01_ONG_GIO_CAP\n2\nBLK_DIFFUSER_600\n10\n3500\n20\n2400\n30\n2800\n`;

  // Grid
  dxf += `0\nLINE\n8\nTRUC_LUOI_DANG_THEP\n10\n1000\n1000\n30\n0\n11\n1000\n5000\n31\n0\n`;
  dxf += `0\nLINE\n8\nTRUC_LUOI_DANG_THEP\n10\n16000\n1000\n30\n0\n11\n16000\n5000\n31\n0\n`;
  dxf += `0\nTEXT\n8\nTRUC_LUOI_DANG_THEP\n10\n1000\n800\n30\n0\n1\nTrôc A cao ®é %%p0.000\n`;

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

// POST /api/engineering/cad/parse-dxf — Phân tích tệp DXF và sinh chuẩn hóa
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập module CAD/BIM" }, { status: 403 });
  }

  try {
    const body = await req.json();
    let dxfContent: string = body.dxfContent || "";
    let fileName = body.fileName || "drawing_model.dxf";

    // Nếu chọn từ bản vẽ thiết kế sẵn có
    if (!dxfContent && body.drawingId) {
      const drawing = await queryOne<{ code: string; name: string; system_group: string | null }>(
        `SELECT code, name, system_group FROM drawings WHERE id = ?`,
        [Number(body.drawingId)],
      );
      if (drawing) {
        fileName = `${drawing.code}.dxf`;
        dxfContent = generateSampleDxfForDrawing(drawing.code, drawing.name, drawing.system_group);
      }
    }

    if (!dxfContent) {
      // Fallback to default full AVIO Tower A sample drawing
      dxfContent = generateSampleDxfForDrawing(
        "AVIO-DWG-M-FL04-01",
        "Bản vẽ HVAC & Cấp Thoát Nước Tầng 4 Tháp A",
      );
    }

    const result = parseDxf(dxfContent, fileName);
    const scrScript = generateStandardizedAutocadScript(result.layers);

    return NextResponse.json({
      success: true,
      data: result,
      scrScript,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
