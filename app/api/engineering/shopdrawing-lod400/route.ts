import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  convertToLod400Dfma,
  detectStructuralSleevePenetrations,
  resolveZeroEntanglementHierarchy,
  generateIsometricSpoolSheet,
  analyzeCeilingPlenumClearance,
  saveLod400Run,
  listLod400Runs,
  PreliminarySegment,
  StructuralBeam,
} from "@/lib/ky-thuat/engineering-shopdrawing-omnipotent";

export const dynamic = "force-dynamic";

// GET /api/engineering/shopdrawing-lod400 — Lịch sử các phiên xử lý Shopdrawing LOD 400
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu Shopdrawing" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const list = await listLod400Runs(projectId);
    return NextResponse.json({ runs: list, totalCount: list.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/shopdrawing-lod400 — Chạy các Siêu Kỹ Năng Shopdrawing Toàn Năng
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực thi Shopdrawing LOD400" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "convert_lod400";

    if (action === "convert_lod400") {
      const drawingName = body.drawingName || "Bản vẽ Shopdrawing";
      const runCode = body.runCode || `LOD400-${Date.now().toString(36).toUpperCase()}`;
      const segments: PreliminarySegment[] = body.segments || [];
      if (!Array.isArray(segments) || segments.length === 0) {
        return NextResponse.json(
          {
            error:
              "Vui lòng cung cấp danh mục phân đoạn tuyến ống/ống gió thực tế từ bản vẽ (segments)",
          },
          { status: 400 },
        );
      }

      const beams: StructuralBeam[] = Array.isArray(body.beams) ? body.beams : [];

      const lod400 = convertToLod400Dfma(runCode, drawingName, segments, 5.8, 2.0, 25.0);
      const sleeves = detectStructuralSleevePenetrations(segments, beams, 25.0);
      lod400.sleevesCount = sleeves.length;
      lod400.sleeveDetails = sleeves;

      const saved = await saveLod400Run(projectId, lod400);

      // Sinh mẫu 1 bản vẽ Isometric Spool Sheet
      const sampleSpool = lod400.spools[0];
      const sampleIsoSheet = sampleSpool
        ? generateIsometricSpoolSheet(sampleSpool, "DN100 SCH40")
        : null;

      return NextResponse.json({
        success: true,
        runId: saved.id,
        lod400,
        sampleIsoSheet,
      });
    }

    if (action === "plenum_clearance") {
      const beamBottom = parseFloat(body.beamBottomElevationMm) || 2800;
      const ceiling = parseFloat(body.ceilingElevationMm) || 2350;
      const duct = body.originalDuct || { widthMm: 600, heightMm: 400 };

      const analysis = analyzeCeilingPlenumClearance(beamBottom, ceiling, duct);
      return NextResponse.json({ success: true, analysis });
    }

    if (action === "spatial_hierarchy") {
      const discipline = body.discipline || "hvac";
      const slabElevation = parseFloat(body.slabBottomElevationMm) || 3200;
      const hierarchy = resolveZeroEntanglementHierarchy(discipline, slabElevation);
      return NextResponse.json({ success: true, hierarchy });
    }

    return NextResponse.json({ error: `Hành động ${action} không hợp lệ` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
