import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  computePolylineSweepVolume,
  detectAabbVoxelClashes,
  optimize2dSheetNesting,
  getOrComputeSpatial,
  Point3D,
  CrossSection,
  SpatialElementAABB,
  NestingPart,
} from "@/lib/ky-thuat/engineering-spatial-wasm";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực thi tính toán không gian" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const computeType = body.computeType || "sweep_volume";
    const cacheKey = body.cacheKey || `SPATIAL-${computeType}-${Date.now().toString(36)}`;
    const startTime = Date.now();

    let result: unknown;

    if (computeType === "sweep_volume") {
      const points: Point3D[] = body.points || [
        { x: 0, y: 0, z: 3200 },
        { x: 5000, y: 0, z: 3200 },
        { x: 5000, y: 8000, z: 3200 },
      ];
      const crossSection: CrossSection = body.crossSection || {
        shape: "rectangular",
        widthMm: 600,
        heightMm: 400,
      };

      const cached = await getOrComputeSpatial(
        projectId,
        cacheKey,
        "v1.0-sweep",
        { points, crossSection },
        () => computePolylineSweepVolume(points, crossSection),
      );

      result = { ...cached, durationMs: Date.now() - startTime };
    } else if (computeType === "voxel_clashes") {
      const elements: SpatialElementAABB[] = body.elements || [
        {
          id: "ELEM-01-DUCT",
          name: "Main Air Duct 800x400",
          system: "hvac",
          min: [1000, 2000, 3000],
          max: [6000, 2800, 3400],
        },
        {
          id: "ELEM-02-BEAM",
          name: "Structural Concrete Beam B12",
          system: "structure",
          min: [3000, 1500, 2900],
          max: [3500, 5000, 3500],
        },
      ];
      const clearanceMm = body.clearanceMm ?? 50;

      const cached = await getOrComputeSpatial(
        projectId,
        cacheKey,
        "v1.0-clash",
        { elements, clearanceMm },
        () => detectAabbVoxelClashes(elements, clearanceMm),
      );

      result = { ...cached, durationMs: Date.now() - startTime };
    } else if (computeType === "sheet_nesting") {
      const parts: NestingPart[] = body.parts || [
        { id: "PART-A", widthMm: 400, heightMm: 600, quantity: 4 },
        { id: "PART-B", widthMm: 500, heightMm: 800, quantity: 2 },
        { id: "PART-C", widthMm: 300, heightMm: 300, quantity: 6 },
      ];
      const sheetWidthMm = body.sheetWidthMm || 1200;
      const sheetLengthMm = body.sheetLengthMm || 2400;

      const cached = await getOrComputeSpatial(
        projectId,
        cacheKey,
        "v1.0-nesting",
        { parts, sheetWidthMm, sheetLengthMm },
        () => optimize2dSheetNesting(parts, sheetWidthMm, sheetLengthMm),
      );

      result = { ...cached, durationMs: Date.now() - startTime };
    } else {
      return NextResponse.json(
        { error: `Loại tính toán '${computeType}' không hợp lệ` },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      computeType,
      result,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
