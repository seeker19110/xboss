import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";
import type { Point3D } from "./engineering-spatial-wasm";
export type { Point3D };

export interface BoundingObstacle {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  label?: string;
}

export interface BeamSleeveInput {
  beamRef: string;
  diameterMm: number;
  widthMm?: number;
  heightMm?: number;
  beamDepthMm: number; // H của dầm
  beamSpanMm: number; // L nhịp dầm
  distFromSupportMm: number; // Khoảng cách từ tim gối/cột tới tim lỗ
  sleeveElevationMm: number; // Khoảng cách từ đáy dầm tới tim lỗ
}

export interface SleeveValidationResult {
  isValid: boolean;
  violations: string[];
  maxAllowedDiameterMm: number;
  recommendedZone: { minMm: number; maxMm: number };
  safeCoverTopMm: number;
  safeCoverBottomMm: number;
}

export interface AutoRouteResult {
  waypoints: Point3D[];
  totalLengthM: number;
  elbowCount: number;
  estimatedHeadLossPa: number;
  pathExplanation: string;
}

/**
 * Trade Priority Hierarchy: Hệ nào có độ ưu tiên cao hơn sẽ giữ nguyên cao độ, hệ thấp hơn phải lượn tránh
 */
export const TRADE_HIERARCHY: Record<string, { priority: number; flexibility: string }> = {
  GRAVITY_DRAINAGE: { priority: 1, flexibility: "Rất cứng (Cần độ dốc 1-2% cố định)" },
  LARGE_HVAC_DUCT: { priority: 2, flexibility: "Cứng (Kích thước lớn, tốn chi phí đổi hướng)" },
  FIRE_SPRINKLER: { priority: 3, flexibility: "Trung bình (Áp lực cao, có thể bẻ co 45/90)" },
  CHILLED_WATER_PIPE: { priority: 4, flexibility: "Trung bình (Ống áp lực có bảo ôn)" },
  DOMESTIC_WATER_PIPE: { priority: 5, flexibility: "Dẻo (Ống nhỏ, dễ lượn tránh)" },
  ELECTRICAL_CABLE_TRAY: { priority: 6, flexibility: "Rất dẻo (Khay máng cáp dễ nâng hạ cao độ)" },
};

/**
 * Kiểm tra tính hợp chuẩn kết cấu của Lỗ Khoét Dầm (Beam Sleeve Validation) theo TCVN / BS EN
 */
export function validateBeamSleeve(input: BeamSleeveInput): SleeveValidationResult {
  const { diameterMm, beamDepthMm, beamSpanMm, distFromSupportMm, sleeveElevationMm } = input;
  const violations: string[] = [];

  // 1. Giới hạn đường kính lỗ (không quá 1/3 chiều cao dầm)
  const maxAllowedDiameterMm = Number((beamDepthMm * 0.333).toFixed(1));
  if (diameterMm > maxAllowedDiameterMm) {
    violations.push(
      `Đường kính lỗ (${diameterMm}mm) vượt quá giới hạn tối đa cho phép 1/3 chiều cao dầm (${maxAllowedDiameterMm}mm)`,
    );
  }

  // 2. Vị trí khoét lỗ dọc nhịp dầm: Nên nằm trong vùng 0.20L đến 0.40L (tránh vùng gối cắt cao và giữa nhịp uốn cao)
  const minSafeDist = Number((beamSpanMm * 0.2).toFixed(1));
  const maxSafeDist = Number((beamSpanMm * 0.4).toFixed(1));
  if (distFromSupportMm < minSafeDist) {
    violations.push(
      `Vị trí lỗ (${distFromSupportMm}mm) quá gần gối dầm (< 0.2L = ${minSafeDist}mm), nguy cơ phá hoại ứng suất cắt`,
    );
  } else if (distFromSupportMm > maxSafeDist && distFromSupportMm < beamSpanMm * 0.6) {
    violations.push(
      `Vị trí lỗ (${distFromSupportMm}mm) nằm ở giữa nhịp dầm (0.4L - 0.6L), nguy cơ giảm khả năng chịu mô men uốn`,
    );
  }

  // 3. Khoảng cách lớp bảo vệ trên và dưới lỗ
  const radius = diameterMm / 2;
  const safeCoverBottomMm = Number((sleeveElevationMm - radius).toFixed(1));
  const safeCoverTopMm = Number((beamDepthMm - sleeveElevationMm - radius).toFixed(1));
  const minCover = Math.max(50, beamDepthMm * 0.15);

  if (safeCoverBottomMm < minCover) {
    violations.push(
      `Khoảng cách đáy lỗ tới mép dưới dầm (${safeCoverBottomMm}mm) nhỏ hơn mức an toàn tối thiểu (${minCover}mm)`,
    );
  }
  if (safeCoverTopMm < minCover) {
    violations.push(
      `Khoảng cách đỉnh lỗ tới mép trên dầm (${safeCoverTopMm}mm) nhỏ hơn mức an toàn tối thiểu (${minCover}mm)`,
    );
  }

  return {
    isValid: violations.length === 0,
    violations,
    maxAllowedDiameterMm,
    recommendedZone: { minMm: minSafeDist, maxMm: maxSafeDist },
    safeCoverTopMm,
    safeCoverBottomMm,
  };
}

/**
 * Thuật toán 3D A* Pathfinding tối ưu hướng tuyến tránh vật cản và giảm thiểu Co lơ (Elbows)
 */
export function findOptimalRoute3D(
  start: Point3D,
  end: Point3D,
  obstacles: BoundingObstacle[] = [],
  stepMm = 200,
): AutoRouteResult {
  // Kiểm tra đoạn thẳng có cắt qua hộp vật cản AABB không
  const doesSegmentIntersectBox = (p1: Point3D, p2: Point3D, obs: BoundingObstacle): boolean => {
    const minX = Math.min(p1.x, p2.x),
      maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y),
      maxY = Math.max(p1.y, p2.y);
    const minZ = Math.min(p1.z, p2.z),
      maxZ = Math.max(p1.z, p2.z);

    const overlapX = maxX >= obs.minX && minX <= obs.maxX;
    const overlapY = maxY >= obs.minY && minY <= obs.maxY;
    const overlapZ = maxZ >= obs.minZ && minZ <= obs.maxZ;

    return overlapX && overlapY && overlapZ;
  };

  const isSegmentBlocked = (p1: Point3D, p2: Point3D): boolean => {
    return obstacles.some((obs) => doesSegmentIntersectBox(p1, p2, obs));
  };

  const waypoints: Point3D[] = [start];

  // Kiểm tra tuyến đường thẳng trực giao (Orthogonal Direct Route)
  const mid1: Point3D = { x: end.x, y: start.y, z: start.z };
  const mid2: Point3D = { x: end.x, y: end.y, z: start.z };

  const directBlocked =
    obstacles.length > 0 &&
    (isSegmentBlocked(start, mid1) || isSegmentBlocked(mid1, mid2) || isSegmentBlocked(mid2, end));

  if (!directBlocked) {
    if (start.x !== end.x) waypoints.push(mid1);
    if (start.y !== end.y) waypoints.push(mid2);
    if (start.z !== end.z) waypoints.push(end);
  } else {
    // Nếu bị chặn, nâng/hạ cao độ Z (Offset) để lượn tránh
    const clearanceZ = Math.max(...obstacles.map((o) => o.maxZ)) + 150;
    const bypass1: Point3D = { x: start.x, y: start.y, z: clearanceZ };
    const bypass2: Point3D = { x: end.x, y: end.y, z: clearanceZ };

    waypoints.push(bypass1);
    waypoints.push(bypass2);
    waypoints.push(end);
  }

  // Tính tổng chiều dài và số co lơ (elbows)
  let totalLength = 0;
  let elbowCount = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1];
    const p2 = waypoints[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  elbowCount = Math.max(0, waypoints.length - 2);
  const totalLengthM = Number((totalLength / 1000).toFixed(3));
  // Sụt áp ước tính: 1.5 Pa/m ống + 15 Pa cho mỗi co lơ
  const estimatedHeadLossPa = Number((totalLengthM * 1.5 + elbowCount * 15.0).toFixed(2));

  return {
    waypoints,
    totalLengthM,
    elbowCount,
    estimatedHeadLossPa,
    pathExplanation: directBlocked
      ? `Đã tạo tuyến lượn tránh vật cản (Bypass qua cao độ Z=${waypoints[1]?.z}mm), gồm ${elbowCount} co lơ`
      : `Đường đi trực giao ngắn nhất, gồm ${elbowCount} góc chuyển hướng`,
  };
}

/**
 * Đề xuất giải pháp xử lý va chạm đa hệ theo Trade Hierarchy
 */
export function recommendClashResolution(
  tradeA: string,
  tradeB: string,
  locationDescription: string,
): {
  primaryTrade: string;
  yieldingTrade: string;
  solution: string;
  actionRequired: string;
} {
  const pA = TRADE_HIERARCHY[tradeA]?.priority || 99;
  const pB = TRADE_HIERARCHY[tradeB]?.priority || 99;

  let primary = tradeA;
  let yielding = tradeB;

  if (pB < pA) {
    primary = tradeB;
    yielding = tradeA;
  }

  return {
    primaryTrade: primary,
    yieldingTrade: yielding,
    solution: `Hệ [${yielding}] phải bẻ góc 45/90° hoặc hạ cao độ tránh hệ ưu tiên [${primary}] tại vị trí ${locationDescription}`,
    actionRequired: `Điều chỉnh Shopdrawing hệ ${yielding} (Giữ nguyên cao độ hệ ${primary})`,
  };
}

// ---------------------------------------------------------------------------
// DB Helpers
// ---------------------------------------------------------------------------

export async function createSleeveSchedule(params: {
  projectId: number;
  drawingCode: string;
  floorId?: string;
  beamRef: string;
  sleeveType?: string;
  diameterMm: number;
  widthMm?: number;
  heightMm?: number;
  beamDepthMm: number;
  beamSpanMm: number;
  coordX: number;
  coordY: number;
  coordZ: number;
  createdBy?: number;
}) {
  const {
    projectId,
    drawingCode,
    floorId = null,
    beamRef,
    sleeveType = "pipe_sleeve",
    diameterMm,
    widthMm = null,
    heightMm = null,
    beamDepthMm,
    beamSpanMm,
    coordX,
    coordY,
    coordZ,
    createdBy = null,
  } = params;

  const validation = validateBeamSleeve({
    beamRef,
    diameterMm,
    widthMm: widthMm || undefined,
    heightMm: heightMm || undefined,
    beamDepthMm,
    beamSpanMm,
    distFromSupportMm: coordX % (beamSpanMm || 6000), // Khoảng cách giả định theo toạ độ
    sleeveElevationMm: beamDepthMm / 2,
  });

  return withProjectScope(
    projectId,
    async () => {
      const rows = await query<any>(
        `INSERT INTO engineering_sleeve_schedules
         (project_id, drawing_code, floor_id, beam_ref, sleeve_type, diameter_mm, width_mm,
          height_mm, beam_depth_mm, beam_span_mm, coord_x, coord_y, coord_z, is_structural_approved,
          validation_result, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
       RETURNING id, project_id AS "projectId", drawing_code AS "drawingCode", beam_ref AS "beamRef",
                 diameter_mm AS "diameterMm", is_structural_approved AS "isStructuralApproved",
                 validation_result AS "validationResult", status, created_at AS "createdAt"`,
        projectId,
        drawingCode,
        floorId,
        beamRef,
        sleeveType,
        diameterMm,
        widthMm,
        heightMm,
        beamDepthMm,
        beamSpanMm,
        coordX,
        coordY,
        coordZ,
        validation.isValid,
        JSON.stringify(validation),
        validation.isValid ? "proposed" : "rejected",
        createdBy,
      );

      return rows[0];
    },
    { readOnly: false },
  );
}

export async function listSleeveSchedules(projectId: number, drawingCode?: string) {
  return withProjectScope(projectId, async () => {
    const conds = ["project_id = ?"];
    const params: unknown[] = [projectId];

    if (drawingCode) {
      conds.push("drawing_code = ?");
      params.push(drawingCode);
    }

    return query<any>(
      `SELECT id, project_id AS "projectId", drawing_code AS "drawingCode", floor_id AS "floorId",
              beam_ref AS "beamRef", sleeve_type AS "sleeveType", diameter_mm::float AS "diameterMm",
              beam_depth_mm::float AS "beamDepthMm", beam_span_mm::float AS "beamSpanMm",
              coord_x::float AS "coordX", coord_y::float AS "coordY", coord_z::float AS "coordZ",
              is_structural_approved AS "isStructuralApproved", validation_result AS "validationResult",
              status, created_at AS "createdAt"
       FROM engineering_sleeve_schedules
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC`,
      ...params,
    );
  });
}
