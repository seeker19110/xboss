import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";
import crypto from "crypto";

export type HseHazardType =
  | "NO_HELMET"
  | "NO_VEST"
  | "NO_HARNESS"
  | "BLOCKED_FIRE_EXIT"
  | "UNGUARDED_EDGE"
  | "ELECTRICAL_HAZARD";

export type HseSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DetectedHazardItem {
  hazardType: HseHazardType;
  severity: HseSeverity;
  confidence: number;
  boundingBox: [number, number, number, number];
  description: string;
  standardViolation: string;
  fineAmountVnd: number;
}

export interface HseScanResult {
  scanId: string;
  scanName: string;
  imageUrl: string;
  totalHazards: number;
  siteSafetyScore: number;
  riskTier: "SAFE" | "WARNING" | "DANGER" | "CRITICAL";
  hazards: DetectedHazardItem[];
}

export function calculateHseSafetyScore(hazards: DetectedHazardItem[]): {
  score: number;
  riskTier: "SAFE" | "WARNING" | "DANGER" | "CRITICAL";
} {
  if (hazards.length === 0) {
    return { score: 100, riskTier: "SAFE" };
  }

  let penalty = 0;
  for (const h of hazards) {
    switch (h.severity) {
      case "CRITICAL":
        penalty += 35;
        break;
      case "HIGH":
        penalty += 20;
        break;
      case "MEDIUM":
        penalty += 10;
        break;
      case "LOW":
        penalty += 5;
        break;
    }
  }

  const score = Math.max(0, 100 - penalty);
  let riskTier: "SAFE" | "WARNING" | "DANGER" | "CRITICAL" = "SAFE";

  if (score < 40) riskTier = "CRITICAL";
  else if (score < 70) riskTier = "DANGER";
  else if (score < 85) riskTier = "WARNING";

  return { score, riskTier };
}

export function analyzeSiteSafetyImageEngine(params: {
  scanName: string;
  imageUrl: string;
  mockHazards?: DetectedHazardItem[];
}): HseScanResult {
  const { scanName, imageUrl, mockHazards } = params;

  const hazards: DetectedHazardItem[] = mockHazards || [
    {
      hazardType: "NO_HELMET",
      severity: "HIGH",
      confidence: 96.5,
      boundingBox: [120, 80, 60, 60],
      description: "Công nhân không đội mũ bảo hộ lao động tại khu vực lắp dựng giàn giáo.",
      standardViolation: "QCVN 18:2021/BXD Điều 2.1.3 (An toàn trong thi công xây dựng)",
      fineAmountVnd: 500000,
    },
    {
      hazardType: "UNGUARDED_EDGE",
      severity: "CRITICAL",
      confidence: 94.0,
      boundingBox: [300, 200, 180, 100],
      description: "Mép sàn tầng 8 không có lan can chắn tạm thời và lưới an toàn.",
      standardViolation: "TCVN 5308:1991 (Quy chuẩn kỹ thuật an toàn trong xây dựng)",
      fineAmountVnd: 2000000,
    },
  ];

  const evaluation = calculateHseSafetyScore(hazards);

  return {
    scanId: crypto.randomUUID(),
    scanName,
    imageUrl,
    totalHazards: hazards.length,
    siteSafetyScore: evaluation.score,
    riskTier: evaluation.riskTier,
    hazards,
  };
}

export async function runAndSaveHseVisionScan(params: {
  projectId: number;
  scanName: string;
  imageUrl: string;
  assignedSubcon?: string;
  customHazards?: DetectedHazardItem[];
}) {
  const {
    projectId,
    scanName,
    imageUrl,
    assignedSubcon = "Đội Cơ Điện Tháp A",
    customHazards,
  } = params;

  const result = analyzeSiteSafetyImageEngine({
    scanName,
    imageUrl,
    mockHazards: customHazards,
  });

  const imageHash = crypto
    .createHash("sha256")
    .update(imageUrl + scanName)
    .digest("hex");

  return withProjectScope(projectId, async () => {
    return withTransaction(async () => {
      const scanRows = await query<any>(
        `INSERT INTO engineering_hse_vision_scans
           (project_id, scan_name, image_url, image_hash, total_hazards_found, site_safety_score, risk_tier)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id, project_id AS "projectId", scan_name AS "scanName", image_url AS "imageUrl",
                   total_hazards_found AS "totalHazardsFound", site_safety_score AS "siteSafetyScore",
                   risk_tier AS "riskTier", analyzed_at AS "analyzedAt"`,
        projectId,
        scanName,
        imageUrl,
        imageHash,
        result.totalHazards,
        result.siteSafetyScore,
        result.riskTier,
      );

      const scan = scanRows[0];

      for (let i = 0; i < result.hazards.length; i++) {
        const h = result.hazards[i];
        const hazardRows = await query<any>(
          `INSERT INTO engineering_hse_detected_hazards
             (scan_id, project_id, hazard_type, severity, confidence, bounding_box, description, standard_violation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
          scan.id,
          projectId,
          h.hazardType,
          h.severity,
          h.confidence,
          JSON.stringify(h.boundingBox),
          h.description,
          h.standardViolation,
        );

        const hazardId = hazardRows[0].id;
        const ticketCode = `TICKET-HSE-${Date.now().toString().slice(-6)}-${i + 1}`;

        await query(
          `INSERT INTO engineering_hse_action_tickets
             (scan_id, hazard_id, project_id, ticket_code, assigned_subcon, fine_amount, deadline_hours, status)
           VALUES (?, ?, ?, ?, ?, ?, 4, 'OPEN')`,
          scan.id,
          hazardId,
          projectId,
          ticketCode,
          assignedSubcon,
          h.fineAmountVnd,
        );
      }

      return {
        scan,
        hazards: result.hazards,
      };
    });
  });
}

export async function listHseVisionScans(projectId: number) {
  return withProjectScope(projectId, async () => {
    return query<any>(
      `SELECT s.id, s.project_id AS "projectId", s.scan_name AS "scanName", s.image_url AS "imageUrl",
              s.total_hazards_found AS "totalHazardsFound", s.site_safety_score AS "siteSafetyScore",
              s.risk_tier AS "riskTier", s.analyzed_at AS "analyzedAt"
       FROM engineering_hse_vision_scans s
       WHERE s.project_id = ?
       ORDER BY s.analyzed_at DESC`,
      projectId,
    );
  });
}
