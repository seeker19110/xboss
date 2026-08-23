import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  generateCncGCodeForDuct,
  generatePipeSpoolCutList,
} from "@/lib/ky-thuat/engineering-god-tier";

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
      if (!Array.isArray(spoolDemands) || spoolDemands.length === 0) {
        return NextResponse.json(
          { error: "Vui lòng cung cấp danh sách nhu cầu cắt phân đoạn ống (spoolDemands)" },
          { status: 400 },
        );
      }
      const spoolResult = generatePipeSpoolCutList(spoolDemands, 6000);
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
