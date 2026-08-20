import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { generateCncGCodeForDuct, generatePipeSpoolCutList } from "@/lib/engineering-god-tier";

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
    const { action, ductParams, spoolDemands } = body;

    if (action === "generate_pipe_spools") {
      const demands = spoolDemands || [
        { code: "SP-CHW-01", dia: 100, length: 2400 },
        { code: "SP-CHW-02", dia: 100, length: 1800 },
        { code: "SP-CHW-03", dia: 100, length: 1200 },
        { code: "SP-CHW-04", dia: 100, length: 950 },
        { code: "SP-DRN-01", dia: 110, length: 3000 },
        { code: "SP-DRN-02", dia: 110, length: 2200 },
      ];
      const spoolResult = generatePipeSpoolCutList(demands, 6000);
      return NextResponse.json({ success: true, spoolResult });
    }

    // Mặc định: Sinh G-Code cắt tôn ống gió 2D CNC Plasma/Laser
    const { widthMm, heightMm, lengthMm, sheetThicknessMm } = ductParams || {};
    const cncResult = generateCncGCodeForDuct(
      parseInt(widthMm, 10) || 600,
      parseInt(heightMm, 10) || 400,
      parseInt(lengthMm, 10) || 1200,
      parseFloat(sheetThicknessMm) || 0.75,
    );

    return NextResponse.json({ success: true, cncResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi sinh mã gia công CNC";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
