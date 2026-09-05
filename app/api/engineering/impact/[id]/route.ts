import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { analyzeObjectImpact } from "@/lib/ky-thuat/engineering-graph";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/impact/[id]?relationTypes=&depth= — Phân tích tác động ảnh hưởng của đối tượng
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem phân tích tác động kỹ thuật" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const depth = sp.get("depth") ? parseInt(sp.get("depth")!, 10) : 3;
  const relationTypes = sp.get("relationTypes")
    ? sp
        .get("relationTypes")!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  try {
    const impact = await analyzeObjectImpact(projectId, id, { depth, relationTypes });
    return NextResponse.json(impact);
  } catch (err: unknown) {
    // Hàm lib ném LoiNghiepVu mang sẵn mã (404 khi bản ghi không tồn tại/thuộc dự án
    // khác) — không còn dò chuỗi thông điệp; lỗi hệ thống thật vẫn ra 500.
    return phanHoiLoi(err);
  }
}
