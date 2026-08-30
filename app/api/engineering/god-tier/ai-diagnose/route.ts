import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  diagnoseCadBimDefects,
  generateAutoLispTrapeze,
} from "@/lib/ky-thuat/engineering-local-ai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringGodTier(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thao tác chẩn đoán AI mô hình" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-god-tier-studio", projectId);
  if (blocked) return blocked;
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

    if (!drawingData || (!drawingData.layers?.length && !drawingData.texts?.length)) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp dữ liệu thực thể bản vẽ CAD/BIM cần chẩn đoán (drawingData)" },
        { status: 400 },
      );
    }

    const report = await diagnoseCadBimDefects(drawingData);
    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi AI chẩn đoán bản vẽ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
