import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { runAndSaveHseVisionScan } from "@/lib/ky-thuat/engineering-hse-vision";

export const dynamic = "force-dynamic";

// POST /api/engineering/hse-vision/scan
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền phân tích hình ảnh HSE" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy
    // (xem chotProjectIdChoGhi trong lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

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
