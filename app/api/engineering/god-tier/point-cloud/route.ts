import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  analyzePointCloudDeviation,
  PointCloudPoint,
  GodTierElementData,
} from "@/lib/engineering-god-tier";

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
    const points: PointCloudPoint[] = body.points || [];
    if (!Array.isArray(points) || points.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp danh sách toạ độ điểm quét LiDAR thực tế (points)" },
        { status: 400 },
      );
    }

    const elements: GodTierElementData[] = body.elements || [];
    if (!Array.isArray(elements) || elements.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp danh sách cấu kiện BIM cần so khớp sai lệch (elements)" },
        { status: 400 },
      );
    }

    const result = analyzePointCloudDeviation(points, elements);
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi xử lý Point Cloud";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
