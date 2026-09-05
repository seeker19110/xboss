import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { scanAllElementsCompliance } from "@/lib/ky-thuat/engineering-prescriptive";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/compliance/scan-all — Quét tự động toàn bộ đối tượng dự án và sinh NCR
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringCompliance(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực hiện quét tự động quy chuẩn" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const result = await scanAllElementsCompliance(projectId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
