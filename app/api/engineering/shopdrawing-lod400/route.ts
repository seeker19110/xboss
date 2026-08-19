import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
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
} from "@/lib/engineering-shopdrawing-omnipotent";

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
      const drawingName = body.drawingName || "MB-SHOP-T05-ZONE-A.DWG";
      const runCode = body.runCode || `LOD400-${Date.now().toString(36).toUpperCase()}`;
      const segments: PreliminarySegment[] = body.segments || [
        {
          id: "SEG-FP-01",
          discipline: "firefighting",
          systemCode: "FP",
          nominalSpec: "DN100",
          outerDiameterMm: 114.3,
          startPoint: [1000, 2000, 2800],
          endPoint: [12500, 2000, 2800],
          lengthM: 11.5,
        },
        {
          id: "SEG-PL-02",
          discipline: "plumbing",
          systemCode: "DRAIN",
          nominalSpec: "DN150",
          outerDiameterMm: 168.3,
          startPoint: [500, 3000, 2700],
          endPoint: [8500, 3000, 2700],
          lengthM: 8.0,
        },
      ];

      const beams: StructuralBeam[] = body.beams || [
        {
          id: "BEAM-B1",
          beamCode: "D400x600-T5-01",
          widthMm: 400,
          heightMm: 600,
          spanLengthMm: 8000,
          minPoint: [4000, 1000, 2400],
          maxPoint: [4400, 5000, 3000],
        },
      ];

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
