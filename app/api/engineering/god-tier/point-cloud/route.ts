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
    const rawPoints: PointCloudPoint[] = body.points || [];

    // Nếu không truyền điểm, sinh 200 điểm giả lập quét 3D LiDAR thực địa
    const points: PointCloudPoint[] =
      rawPoints.length > 0
        ? rawPoints
        : Array.from({ length: 150 }, (_, i) => {
            const isDefect = i % 15 === 0;
            const noise = (Math.random() - 0.5) * (isDefect ? 80 : 10);
            return {
              x: Math.round(-100 + (i % 10) * 20 + noise),
              y: Math.round(-50 + Math.floor(i / 10) * 30 + noise),
              z: Math.round(50 + noise),
              intensity: Math.round(Math.random() * 255),
            };
          });

    const elements: GodTierElementData[] = body.elements || [
      {
        id: "elem-1",
        guid: "GUID-DUCT-SUPP-101",
        elementType: "DUCT_STRAIGHT",
        systemType: "HVAC_SUPPLY",
        name: "Ống gió cấp AHU-01 (800x500)",
        position: { x: -100, y: -50, z: 50 },
        dimensions: { width: 800, height: 500, length: 6000 },
        boundingBox: { min: [-400, -200, 0], max: [400, 6000, 300] },
      },
    ];

    const result = analyzePointCloudDeviation(points, elements);
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi xử lý Point Cloud";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
