import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { runAndSaveHseVisionScan } from "@/lib/ky-thuat/engineering-hse-vision";

export const dynamic = "force-dynamic";

// POST /api/engineering/hse-vision/scan
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền phân tích hình ảnh HSE" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (!body.scanName || !body.imageUrl) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (scanName, imageUrl)" },
        { status: 422 },
      );
    }

    const result = await runAndSaveHseVisionScan({
      projectId,
      scanName: body.scanName,
      imageUrl: body.imageUrl,
      assignedSubcon: body.assignedSubcon || "Đội Cơ Điện Tháp A",
      customHazards: body.customHazards,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
