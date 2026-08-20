import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { diagnoseCadBimDefects, generateAutoLispTrapeze } from "@/lib/engineering-local-ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { action, drawingData, trapezeParams } = body;

    if (action === "generate_autolisp_trapeze") {
      const { widthMm, dropMm, rodSize, strutSize } = trapezeParams || {};
      const script = generateAutoLispTrapeze(
        parseInt(widthMm, 10) || 600,
        parseInt(dropMm, 10) || 800,
        rodSize || "M10",
        strutSize || "41x41",
      );
      return NextResponse.json({ success: true, script });
    }

    // Mặc định: Chẩn đoán 12 dị tật bản vẽ
    const defaultData = drawingData || {
      fileName: "SHOP-MEPF-T5-AVIO.dwg",
      layers: ["0", "layer1", "mep_ong_gio", "A-WALL", "M-HVAC-DUCT"],
      texts: ["MÆt b»ng cÊp giã TÇng 5", "T-01 AHU-01", "Cao ®é +2800mm"],
      elementsSummary: { ducts: 120, pipes: 85, clashes: 3 },
    };

    const report = await diagnoseCadBimDefects(defaultData);
    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi AI chẩn đoán bản vẽ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
