import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getObjectLineage } from "@/lib/ky-thuat/engineering-graph";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/lineage/[id] — Phả hệ đầy đủ của đối tượng kỹ thuật
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem phả hệ kỹ thuật" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const lineage = await getObjectLineage(projectId, id);
    return NextResponse.json(lineage);
  } catch (err: unknown) {
    // Hàm lib ném LoiNghiepVu mang sẵn mã (404 khi bản ghi không tồn tại/thuộc dự án
    // khác) — không còn dò chuỗi thông điệp; lỗi hệ thống thật vẫn ra 500.
    return phanHoiLoi(err);
  }
}
