// lib/engineering-edge-vision-tracking.ts — Edge-AI 360 Video SLAM & Pre-Pour Rebar CV Engine (Module M93)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

export interface EdgeVisionDetectionInput {
  detectionCode: string;
  videoSessionId: string;
  frameTimestampSec: number;
  cameraPose: {
    x: number;
    y: number;
    z: number;
    yawDeg: number;
    pitchDeg: number;
  };
  bimElementGuid?: string;
  elementType: string;
  zoneLabel: string;
  installationStatus: "not_started" | "in_progress" | "installed_ok" | "defect_rework";
  confidenceScore: number;
  anomalyDetected?: boolean;
  anomalyDescription?: string;
  boundingBox2D?: { x: number; y: number; w: number; h: number };
}

export interface PrePourRebarAuditInput {
  auditCode: string;
  zoneLabel: string;
  slabLevel: string;
  elementName: string;
  designPitchMm: number; // e.g. 150mm
  measuredPitchMm: number; // e.g. 155mm
  designSpacerDensitySqm: number; // e.g. 4.0
  measuredSpacerDensitySqm: number; // e.g. 4.2
  photoEvidenceUris?: string[];
  auditedBy?: number;
}

export interface PrePourRebarAuditResult {
  auditCode: string;
  zoneLabel: string;
  slabLevel: string;
  elementName: string;
  designPitchMm: number;
  measuredPitchMm: number;
  pitchDeviationMm: number;
  designSpacerDensitySqm: number;
  measuredSpacerDensitySqm: number;
  circuitBreakerStatus: "PASS_PERMITTED" | "LOCKED_CIRCUIT_OPEN";
  blockingReasons: string[];
  photoEvidenceUris: string[];
  merkleLeafHash: string;
  auditedAt: string;
}

// ============================================================================
// 1. PRE-POUR REBAR & SPACER COMPUTER VISION AUDIT ENGINE
// ============================================================================

export function auditPrePourRebarGrid(input: PrePourRebarAuditInput): PrePourRebarAuditResult {
  const pitchDev = Math.round((input.measuredPitchMm - input.designPitchMm) * 10) / 10;
  const absPitchDev = Math.abs(pitchDev);
  const blockingReasons: string[] = [];

  // Quy chuẩn TCVN 5574 / TCVN 4453: Dung sai khoảng cách cốt thép <= 10mm
  if (absPitchDev > 10.0) {
    blockingReasons.push(
      `Sai lệch bước thép quá mức cho phép (${absPitchDev}mm > 10mm so với thiết kế ${input.designPitchMm}mm)`,
    );
  }

  // Quy chuẩn con kê bê tông bảo vệ: Tối thiểu 4 con/m2
  if (input.measuredSpacerDensitySqm < input.designSpacerDensitySqm) {
    blockingReasons.push(
      `Mật độ con kê bảo vệ không đạt (${input.measuredSpacerDensitySqm} con/m² < tiêu chuẩn ${input.designSpacerDensitySqm} con/m²)`,
    );
  }

  const isLocked = blockingReasons.length > 0;
  const circuitBreakerStatus: "PASS_PERMITTED" | "LOCKED_CIRCUIT_OPEN" = isLocked
    ? "LOCKED_CIRCUIT_OPEN"
    : "PASS_PERMITTED";

  const auditedAt = new Date().toISOString();
  const rawPayload = `${input.auditCode}:${input.zoneLabel}:${input.slabLevel}:${pitchDev}:${input.measuredSpacerDensitySqm}:${circuitBreakerStatus}:${auditedAt}`;
  const merkleLeafHash = createHash("sha256").update(rawPayload).digest("hex");

  return {
    auditCode: input.auditCode,
    zoneLabel: input.zoneLabel,
    slabLevel: input.slabLevel,
    elementName: input.elementName,
    designPitchMm: input.designPitchMm,
    measuredPitchMm: input.measuredPitchMm,
    pitchDeviationMm: pitchDev,
    designSpacerDensitySqm: input.designSpacerDensitySqm,
    measuredSpacerDensitySqm: input.measuredSpacerDensitySqm,
    circuitBreakerStatus,
    blockingReasons,
    photoEvidenceUris: input.photoEvidenceUris || [],
    merkleLeafHash,
    auditedAt,
  };
}

// ============================================================================
// 2. DATABASE PERSISTENCE & QUERIES
// ============================================================================

export async function saveEdgeVisionDetection(
  projectId: number,
  input: EdgeVisionDetectionInput,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_edge_vision_detections (
      project_id, detection_code, video_session_id, frame_timestamp_sec,
      camera_pose, bim_element_guid, element_type, zone_label,
      installation_status, confidence_score, anomaly_detected,
      anomaly_description, bounding_box_2d
    ) VALUES (
      ?, ?, ?, ?,
      ?::jsonb, ?, ?, ?,
      ?, ?, ?,
      ?, ?::jsonb
    )
    ON CONFLICT (project_id, detection_code) DO UPDATE SET
      installation_status = EXCLUDED.installation_status,
      confidence_score = EXCLUDED.confidence_score,
      anomaly_detected = EXCLUDED.anomaly_detected,
      anomaly_description = EXCLUDED.anomaly_description,
      updated_at = NOW()
    RETURNING id`,
    [
      projectId,
      input.detectionCode,
      input.videoSessionId,
      input.frameTimestampSec,
      JSON.stringify(input.cameraPose),
      input.bimElementGuid || null,
      input.elementType,
      input.zoneLabel,
      input.installationStatus,
      input.confidenceScore,
      input.anomalyDetected || false,
      input.anomalyDescription || null,
      JSON.stringify(input.boundingBox2D || {}),
    ],
  );

  if (!row) throw new Error("Failed to save edge vision detection");
  return row;
}

export async function listEdgeVisionDetections(
  projectId: number,
  videoSessionId?: string,
): Promise<Array<Record<string, unknown>>> {
  if (videoSessionId) {
    return query<Record<string, unknown>>(
      `SELECT * FROM engineering_edge_vision_detections
       WHERE project_id = ? AND video_session_id = ?
       ORDER BY frame_timestamp_sec ASC`,
      [projectId, videoSessionId],
    );
  }
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_edge_vision_detections
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [projectId],
  );
}

export async function savePrePourRebarAudit(
  projectId: number,
  result: PrePourRebarAuditResult,
  userId?: number,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_rebar_prepour_audits (
      project_id, audit_code, zone_label, slab_level, element_name,
      design_pitch_mm, measured_pitch_mm, design_spacer_density_sqm,
      measured_spacer_density_sqm, pitch_deviation_mm, circuit_breaker_status,
      blocking_reasons, photo_evidence_uris, merkle_leaf_hash, audited_by, audited_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?::jsonb, ?::jsonb, ?, ?, ?::timestamptz
    )
    ON CONFLICT (project_id, audit_code) DO UPDATE SET
      measured_pitch_mm = EXCLUDED.measured_pitch_mm,
      measured_spacer_density_sqm = EXCLUDED.measured_spacer_density_sqm,
      pitch_deviation_mm = EXCLUDED.pitch_deviation_mm,
      circuit_breaker_status = EXCLUDED.circuit_breaker_status,
      blocking_reasons = EXCLUDED.blocking_reasons,
      merkle_leaf_hash = EXCLUDED.merkle_leaf_hash
    RETURNING id`,
    [
      projectId,
      result.auditCode,
      result.zoneLabel,
      result.slabLevel,
      result.elementName,
      result.designPitchMm,
      result.measuredPitchMm,
      result.designSpacerDensitySqm,
      result.measuredSpacerDensitySqm,
      result.pitchDeviationMm,
      result.circuitBreakerStatus,
      JSON.stringify(result.blockingReasons),
      JSON.stringify(result.photoEvidenceUris),
      result.merkleLeafHash,
      userId || null,
      result.auditedAt,
    ],
  );

  if (!row) throw new Error("Failed to save pre-pour rebar audit");
  return row;
}

export async function listPrePourRebarAudits(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_rebar_prepour_audits
     WHERE project_id = ?
     ORDER BY audited_at DESC
     LIMIT 50`,
    [projectId],
  );
}
