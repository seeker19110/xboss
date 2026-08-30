import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  auditPrePourRebarGrid,
  savePrePourRebarAudit,
  listPrePourRebarAudits,
  saveEdgeVisionDetection,
  listEdgeVisionDetections,
  PrePourRebarAuditInput,
  EdgeVisionDetectionInput,
} from "@/lib/ky-thuat/engineering-edge-vision-tracking";

export const dynamic = "force-dynamic";

// GET /api/engineering/edge-vision-tracking — Lấy danh sách detections & audits
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringWorkflows(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu Edge Vision" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-nextgen-apex", projectId);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "rebar";

  try {
    if (type === "rebar") {
      const rebarAudits = await listPrePourRebarAudits(projectId);
      return NextResponse.json({ rebarAudits, totalCount: rebarAudits.length });
    } else {
      const videoSessionId = url.searchParams.get("session");
      const detections = await listEdgeVisionDetections(projectId, videoSessionId || undefined);
      return NextResponse.json({ detections, totalCount: detections.length });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/edge-vision-tracking — Ghi nhận audit cốt thép hoặc detection 360
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thực thi Edge Vision Audit" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-nextgen-apex", projectId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const action = body.action || "audit_rebar";

    if (action === "audit_rebar") {
      const input: PrePourRebarAuditInput = {
        auditCode: body.auditCode || `REBAR-${Date.now().toString(36).toUpperCase()}`,
        zoneLabel: body.zoneLabel || "Zone-01",
        slabLevel: body.slabLevel || "FL-02",
        elementName: body.elementName || "Sàn S02-ZoneA (Thép D10a150)",
        designPitchMm: parseFloat(body.designPitchMm) || 150.0,
        measuredPitchMm: parseFloat(body.measuredPitchMm) || 150.0,
        designSpacerDensitySqm: parseFloat(body.designSpacerDensitySqm) || 4.0,
        measuredSpacerDensitySqm: parseFloat(body.measuredSpacerDensitySqm) || 4.0,
        photoEvidenceUris: body.photoEvidenceUris || [
          "https://storage.xboss.io/rebar/photo_01.jpg",
        ],
        auditedBy: user.id,
      };

      const result = auditPrePourRebarGrid(input);
      const saved = await savePrePourRebarAudit(projectId, result, user.id);

      return NextResponse.json({
        success: true,
        auditId: saved.id,
        result,
      });
    } else {
      const input: EdgeVisionDetectionInput = {
        detectionCode: body.detectionCode || `DET-${Date.now().toString(36).toUpperCase()}`,
        videoSessionId: body.videoSessionId || "SESSION-360-01",
        frameTimestampSec: parseFloat(body.frameTimestampSec) || 12.5,
        cameraPose: body.cameraPose || { x: 12000, y: 4500, z: 1600, yawDeg: 45, pitchDeg: 0 },
        bimElementGuid: body.bimElementGuid || "GUID-DUCT-SUPP-101",
        elementType: body.elementType || "DUCT_SUPPLY",
        zoneLabel: body.zoneLabel || "Zone-01",
        installationStatus: body.installationStatus || "installed_ok",
        confidenceScore: parseFloat(body.confidenceScore) || 0.94,
        anomalyDetected: body.anomalyDetected || false,
        anomalyDescription: body.anomalyDescription || null,
        boundingBox2D: body.boundingBox2D || { x: 120, y: 80, w: 300, h: 180 },
      };

      const saved = await saveEdgeVisionDetection(projectId, input);

      return NextResponse.json({
        success: true,
        detectionId: saved.id,
        detection: input,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
