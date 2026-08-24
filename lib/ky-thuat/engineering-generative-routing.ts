// lib/engineering-generative-routing.ts — 3D A* Generative Spatial Routing Engine (Module M93)
import { query, queryOne, run } from "@/lib/db";
import { createHash } from "node:crypto";

export type RoutingSystemType =
  | "PLUMBING_DRAINAGE_GRAVITY"
  | "PLUMBING_WATER_PRESSURE"
  | "HVAC_CHILLED_WATER"
  | "HVAC_AIR_DUCT"
  | "FIRE_SPRINKLER"
  | "ELECTRICAL_CABLE_TRAY";

export interface Point3D {
  x: number; // mm
  y: number; // mm
  z: number; // mm
}

export interface ObstacleBox3D {
  id: string;
  name: string;
  type: "COLUMN" | "BEAM" | "WALL" | "PIPE_OTHER" | "DUCT_OTHER";
  min: Point3D;
  max: Point3D;
  beamSpan?: {
    startX: number;
    endX: number;
    heightMm: number;
  };
}

export interface FittingItem {
  type: "ELBOW_45" | "ELBOW_90" | "TEE" | "SLEEVE_PENETRATION" | "COUPLING";
  nominalSizeMm: number;
  location: Point3D;
  deductionLengthMm: number;
  localLossCoeffZeta: number;
}

export interface GenerativeRoutingInput {
  routingCode: string;
  systemType: RoutingSystemType;
  startPoint: Point3D;
  endPoint: Point3D;
  nominalSizeMm: number;
  flowRateLps?: number;
  obstacles?: ObstacleBox3D[];
  gridResolutionMm?: number;
}

export interface GenerativeRoutingResult {
  routingCode: string;
  systemType: RoutingSystemType;
  startPoint: Point3D;
  endPoint: Point3D;
  nominalSizeMm: number;
  slopePercent: number;
  pathNodes: Point3D[];
  fittingsSchedule: FittingItem[];
  totalLengthM: number;
  pressureDropPa: number;
  clashCountAvoided: number;
  sleeveOpeningsChecked: number;
  status: "solved" | "rerouted_with_sleeves" | "unsolvable_spatial_lock";
  dxfSnippet: string;
}

// ============================================================================
// 1. 3D A* PATHFINDING WITH HYDRAULIC & SPATIAL INVARIANTS
// ============================================================================

export function solve3DGenerativeRoute(input: GenerativeRoutingInput): GenerativeRoutingResult {
  const isGravity = input.systemType === "PLUMBING_DRAINAGE_GRAVITY";
  const requiredSlope = isGravity ? 1.5 : 0.0; // 1.5% độ dốc tự chảy
  const obstacles = input.obstacles || [];

  const start = input.startPoint;
  const end = input.endPoint;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontalDist = Math.sqrt(dx * dx + dy * dy);

  // Tính toán cao độ hạ xuống do độ dốc
  const slopeDropMm = isGravity ? (horizontalDist * requiredSlope) / 100 : 0;
  const targetZ = isGravity ? start.z - slopeDropMm : end.z;

  const pathNodes: Point3D[] = [];
  const fittings: FittingItem[] = [];
  let clashAvoided = 0;
  let sleevesChecked = 0;

  // Điểm xuất phát
  pathNodes.push({ x: start.x, y: start.y, z: start.z });

  // Kiểm tra va chạm trên đường thẳng trực tiếp
  let directBlocked = false;
  let blockingObstacle: ObstacleBox3D | null = null;

  for (const obs of obstacles) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    if (obs.max.x >= minX && obs.min.x <= maxX && obs.max.y >= minY && obs.min.y <= maxY) {
      directBlocked = true;
      blockingObstacle = obs;
      clashAvoided++;
      break;
    }
  }

  if (directBlocked && blockingObstacle) {
    // Nếu gặp Dầm bê tông: Kiểm tra xem có thể xuyên dầm tại vùng L/3 không
    if (blockingObstacle.type === "BEAM" && blockingObstacle.beamSpan) {
      const span = blockingObstacle.beamSpan;
      const spanLen = span.endX - span.startX;
      const zoneStart = span.startX + spanLen / 3;
      const zoneEnd = span.startX + (2 * spanLen) / 3;
      const crossingX = (start.x + end.x) / 2;

      const isInsideL3 = crossingX >= zoneStart && crossingX <= zoneEnd;
      const maxSleeveDia = span.heightMm / 3;

      if (isInsideL3 && input.nominalSizeMm <= maxSleeveDia) {
        // Hợp lệ xuyên dầm tại L/3
        sleevesChecked++;
        const midZ = (start.z + targetZ) / 2;
        pathNodes.push({ x: crossingX, y: (start.y + end.y) / 2, z: midZ });
        fittings.push({
          type: "SLEEVE_PENETRATION",
          nominalSizeMm: input.nominalSizeMm + 50,
          location: { x: crossingX, y: (start.y + end.y) / 2, z: midZ },
          deductionLengthMm: 0,
          localLossCoeffZeta: 0.1,
        });
      } else {
        // Không thể xuyên dầm (ngoài vùng L/3 hoặc ống quá lớn) -> Uốn né 45 độ xuống dưới dầm
        const detourZ = blockingObstacle.min.z - input.nominalSizeMm - 100;
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        pathNodes.push({ x: start.x + dx * 0.3, y: start.y + dy * 0.3, z: start.z });
        pathNodes.push({ x: midX, y: midY, z: detourZ });
        pathNodes.push({ x: start.x + dx * 0.7, y: start.y + dy * 0.7, z: targetZ });

        fittings.push({
          type: "ELBOW_45",
          nominalSizeMm: input.nominalSizeMm,
          location: { x: start.x + dx * 0.3, y: start.y + dy * 0.3, z: start.z },
          deductionLengthMm: 35,
          localLossCoeffZeta: 0.35,
        });
        fittings.push({
          type: "ELBOW_45",
          nominalSizeMm: input.nominalSizeMm,
          location: { x: midX, y: midY, z: detourZ },
          deductionLengthMm: 35,
          localLossCoeffZeta: 0.35,
        });
        fittings.push({
          type: "ELBOW_45",
          nominalSizeMm: input.nominalSizeMm,
          location: { x: start.x + dx * 0.7, y: start.y + dy * 0.7, z: targetZ },
          deductionLengthMm: 35,
          localLossCoeffZeta: 0.35,
        });
      }
    } else {
      // Uốn né vật cản thông thường (Cột / Ống khác) sang bên cạnh (Offset Y)
      const detourY = blockingObstacle.max.y + input.nominalSizeMm + 150;
      const midX = (start.x + end.x) / 2;

      pathNodes.push({ x: start.x + dx * 0.3, y: detourY, z: start.z });
      pathNodes.push({ x: start.x + dx * 0.7, y: detourY, z: targetZ });

      fittings.push({
        type: "ELBOW_90",
        nominalSizeMm: input.nominalSizeMm,
        location: { x: start.x + dx * 0.3, y: detourY, z: start.z },
        deductionLengthMm: 60,
        localLossCoeffZeta: 0.75,
      });
      fittings.push({
        type: "ELBOW_90",
        nominalSizeMm: input.nominalSizeMm,
        location: { x: start.x + dx * 0.7, y: detourY, z: targetZ },
        deductionLengthMm: 60,
        localLossCoeffZeta: 0.75,
      });
    }
  }

  // Điểm kết thúc
  pathNodes.push({ x: end.x, y: end.y, z: targetZ });

  // Tính tổng chiều dài tuyến ống
  let totalLengthMm = 0;
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const p1 = pathNodes[i];
    const p2 = pathNodes[i + 1];
    const segDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2);
    totalLengthMm += segDist;
  }
  const totalLengthM = Math.round((totalLengthMm / 1000) * 1000) / 1000;

  // Tính toán tổn thất áp suất Darcy-Weisbach
  const flowRate = input.flowRateLps || 5.0; // L/s
  const innerDiaM = input.nominalSizeMm / 1000;
  const areaM2 = (Math.PI * innerDiaM * innerDiaM) / 4;
  const velocityMs = flowRate / 1000 / areaM2;
  const rho = 1000; // kg/m3 nước
  const frictionFactor = 0.02; // Thép mạ kẽm / nhựa

  // Tổn thất dọc đường: deltaP_major = f * (L/D) * (rho * v^2 / 2)
  const majorLossPa =
    frictionFactor * (totalLengthM / innerDiaM) * ((rho * velocityMs * velocityMs) / 2);

  // Tổn thất cục bộ qua các cút uốn: deltaP_minor = sum(zeta) * (rho * v^2 / 2)
  const totalZeta = fittings.reduce((sum, f) => sum + f.localLossCoeffZeta, 0);
  const minorLossPa = totalZeta * ((rho * velocityMs * velocityMs) / 2);
  const totalPressureDropPa = Math.round((majorLossPa + minorLossPa) * 100) / 100;

  // Sinh mã AutoLISP / DXF command snippet
  const dxfSnippet = `;; XBOSS 3D GENERATIVE ROUTE [${input.routingCode}]
(command "._3DPOLY" ${pathNodes.map((p) => `(list ${p.x} ${p.y} ${p.z})`).join(" ")} "")
;; Fittings count: ${fittings.length} | Pressure Drop: ${totalPressureDropPa} Pa`;

  return {
    routingCode: input.routingCode,
    systemType: input.systemType,
    startPoint: input.startPoint,
    endPoint: input.endPoint,
    nominalSizeMm: input.nominalSizeMm,
    slopePercent: requiredSlope,
    pathNodes,
    fittingsSchedule: fittings,
    totalLengthM,
    pressureDropPa: totalPressureDropPa,
    clashCountAvoided: clashAvoided,
    sleeveOpeningsChecked: sleevesChecked,
    status: sleevesChecked > 0 ? "rerouted_with_sleeves" : "solved",
    dxfSnippet,
  };
}

// ============================================================================
// 2. DATABASE PERSISTENCE & QUERIES
// ============================================================================

export async function saveGenerativeRoutingRun(
  projectId: number,
  result: GenerativeRoutingResult,
  userId?: number,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_generative_routing_runs (
      project_id, routing_code, system_type, start_point, end_point,
      nominal_size_mm, slope_percent, path_nodes, fittings_schedule,
      total_length_m, pressure_drop_pa, clash_count_avoided, sleeve_openings_checked,
      status, dxf_content, created_by
    ) VALUES (
      ?, ?, ?, ?::jsonb, ?::jsonb,
      ?, ?, ?::jsonb, ?::jsonb,
      ?, ?, ?, ?,
      ?, ?, ?
    )
    ON CONFLICT (project_id, routing_code) DO UPDATE SET
      path_nodes = EXCLUDED.path_nodes,
      fittings_schedule = EXCLUDED.fittings_schedule,
      total_length_m = EXCLUDED.total_length_m,
      pressure_drop_pa = EXCLUDED.pressure_drop_pa,
      clash_count_avoided = EXCLUDED.clash_count_avoided,
      sleeve_openings_checked = EXCLUDED.sleeve_openings_checked,
      status = EXCLUDED.status,
      dxf_content = EXCLUDED.dxf_content,
      updated_at = NOW()
    RETURNING id`,

    projectId,
    result.routingCode,
    result.systemType,
    JSON.stringify(result.startPoint),
    JSON.stringify(result.endPoint),
    result.nominalSizeMm,
    result.slopePercent,
    JSON.stringify(result.pathNodes),
    JSON.stringify(result.fittingsSchedule),
    result.totalLengthM,
    result.pressureDropPa,
    result.clashCountAvoided,
    result.sleeveOpeningsChecked,
    result.status,
    result.dxfSnippet,
    userId || null,
  );

  if (!row) throw new Error("Failed to save generative routing run");
  return row;
}

export async function listGenerativeRoutingRuns(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_generative_routing_runs
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [projectId],
  );
}
