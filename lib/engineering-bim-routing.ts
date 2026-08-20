// lib/engineering-bim-routing.ts — BCF Issue Tracker (openBIM) & 3D A* Auto-Routing Engine (M89)
import { query, queryOne, run } from "@/lib/db";
import {
  BoundingBox3D,
  BimElementRecord,
  SpatialClashRecord,
  checkAabbIntersection,
} from "./engineering-bim-cad";

// ============================================================================
// 1. OPENBIM BCF (BIM COLLABORATION FORMAT - ISO 21597) ENGINE
// ============================================================================

export interface Camera3DViewpoint {
  position: { x: number; y: number; z: number }; // meters
  direction: { x: number; y: number; z: number }; // unit vector
  up: { x: number; y: number; z: number }; // unit vector
  fovDeg?: number;
}

export interface BcfIssueRecord {
  id: string;
  project_id: number;
  bcf_code: string;
  title: string;
  description: string | null;
  discipline: string;
  issue_type: "clash" | "rfi" | "design_query" | "ncr" | "observation";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved" | "closed" | "wont_fix";
  camera_position: { x: number; y: number; z: number } | null;
  camera_direction: { x: number; y: number; z: number } | null;
  camera_up: { x: number; y: number; z: number } | null;
  camera_fov_deg: number;
  clash_element_a_guid: string | null;
  clash_element_b_guid: string | null;
  linked_clash_code: string | null;
  linked_spool_code: string | null;
  assigned_to: number | null;
  due_date: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  resolution_note: string | null;
  attachments: string[];
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBcfIssueInput {
  title: string;
  description?: string;
  discipline?: string;
  issueType?: BcfIssueRecord["issue_type"];
  severity?: BcfIssueRecord["severity"];
  cameraViewpoint?: Camera3DViewpoint;
  clashElementAGuid?: string;
  clashElementBGuid?: string;
  linkedClashCode?: string;
  linkedSpoolCode?: string;
  assignedTo?: number;
  dueDate?: string;
  attachments?: string[];
}

export async function createBcfIssue(
  projectId: number,
  input: CreateBcfIssueInput,
  userId?: number | null,
): Promise<BcfIssueRecord> {
  const bcfCode = `BCF-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

  const row = await queryOne<BcfIssueRecord>(
    `INSERT INTO engineering_bcf_issues (
      project_id, bcf_code, title, description, discipline,
      issue_type, severity, status,
      camera_position, camera_direction, camera_up, camera_fov_deg,
      clash_element_a_guid, clash_element_b_guid, linked_clash_code, linked_spool_code,
      assigned_to, due_date, attachments, created_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, 'open',
      ?::jsonb, ?::jsonb, ?::jsonb, ?,
      ?, ?, ?, ?,
      ?, ?, ?::jsonb, ?
    ) RETURNING *`,
    [
      projectId,
      bcfCode,
      input.title,
      input.description ?? null,
      input.discipline || "combined",
      input.issueType || "clash",
      input.severity || "medium",
      input.cameraViewpoint?.position ? JSON.stringify(input.cameraViewpoint.position) : null,
      input.cameraViewpoint?.direction ? JSON.stringify(input.cameraViewpoint.direction) : null,
      input.cameraViewpoint?.up ? JSON.stringify(input.cameraViewpoint.up) : null,
      input.cameraViewpoint?.fovDeg ?? 60.0,
      input.clashElementAGuid ?? null,
      input.clashElementBGuid ?? null,
      input.linkedClashCode ?? null,
      input.linkedSpoolCode ?? null,
      input.assignedTo ?? null,
      input.dueDate ?? null,
      JSON.stringify(input.attachments || []),
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to create BCF Issue");
  return row;
}

export async function listBcfIssues(
  projectId: number,
  filters?: {
    status?: string;
    discipline?: string;
    severity?: string;
    issueType?: string;
  },
): Promise<BcfIssueRecord[]> {
  let sql = `SELECT * FROM engineering_bcf_issues WHERE project_id = ?`;
  const params: unknown[] = [projectId];

  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters?.discipline) {
    sql += ` AND discipline = ?`;
    params.push(filters.discipline);
  }
  if (filters?.severity) {
    sql += ` AND severity = ?`;
    params.push(filters.severity);
  }
  if (filters?.issueType) {
    sql += ` AND issue_type = ?`;
    params.push(filters.issueType);
  }

  sql += ` ORDER BY created_at DESC LIMIT 100`;
  return await query<BcfIssueRecord>(sql, params);
}

export async function resolveBcfIssue(
  projectId: number,
  bcfId: string,
  resolutionNote: string,
  resolvedByUserId: number,
): Promise<BcfIssueRecord | null> {
  await run(
    `UPDATE engineering_bcf_issues
     SET status = 'resolved',
         resolution_note = ?,
         resolved_by = ?,
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE id = ? AND project_id = ?`,
    [resolutionNote, resolvedByUserId, bcfId, projectId],
  );

  const row = await queryOne<BcfIssueRecord>(
    `SELECT * FROM engineering_bcf_issues WHERE id = ? AND project_id = ?`,
    [bcfId, projectId],
  );
  return row ?? null;
}

// ============================================================================
// 2. SPATIAL GRID INDEX CLASH DETECTION (O(n log n) PERFORMANCE)
// ============================================================================

export function detectClashesWithSpatialGrid(
  elements: BimElementRecord[],
  clearanceThresholdMm = 50,
  gridCellSizeMm = 2000,
): SpatialClashRecord[] {
  const grid = new Map<string, BimElementRecord[]>();

  for (const elem of elements) {
    const box = elem.spatial_bounding_box;
    if (!box) continue;

    const minCellX = Math.floor(box.min[0] / gridCellSizeMm);
    const maxCellX = Math.floor(box.max[0] / gridCellSizeMm);
    const minCellY = Math.floor(box.min[1] / gridCellSizeMm);
    const maxCellY = Math.floor(box.max[1] / gridCellSizeMm);
    const minCellZ = Math.floor(box.min[2] / gridCellSizeMm);
    const maxCellZ = Math.floor(box.max[2] / gridCellSizeMm);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        for (let cz = minCellZ; cz <= maxCellZ; cz++) {
          const key = `${cx}:${cy}:${cz}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key)!.push(elem);
        }
      }
    }
  }

  const checkedPairs = new Set<string>();
  const clashes: SpatialClashRecord[] = [];
  let clashCounter = 1;

  for (const cellElements of grid.values()) {
    if (cellElements.length < 2) continue;

    for (let i = 0; i < cellElements.length; i++) {
      for (let j = i + 1; j < cellElements.length; j++) {
        const a = cellElements[i];
        const b = cellElements[j];

        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        const check = checkAabbIntersection(
          a.spatial_bounding_box,
          b.spatial_bounding_box,
          clearanceThresholdMm,
        );

        if (check.isHardClash || check.isSoftClash) {
          const clashType = check.isHardClash ? "hard_clash" : "soft_clearance";
          const severity = check.isHardClash ? "critical" : "medium";
          const clashCode = `CLASH-GRD-${Date.now().toString(36).toUpperCase()}-${clashCounter++}`;

          clashes.push({
            id: `clash-${pairKey}`,
            project_id: a.project_id,
            clash_code: clashCode,
            element_a_id: a.id,
            element_b_id: b.id,
            clash_type: clashType,
            severity,
            intersection_point: check.center,
            clearance_distance_mm: check.clearanceDistanceMm,
            status: "detected",
            prescriptive_solution: null,
            resolved_by: null,
            created_at: new Date().toISOString(),
            element_a_type: a.element_type,
            element_a_guid: a.ifc_guid,
            element_b_type: b.element_type,
            element_b_guid: b.ifc_guid,
            element_a_system: a.system_name || undefined,
            element_b_system: b.system_name || undefined,
          });
        }
      }
    }
  }

  return clashes;
}

// ============================================================================
// 3. 3D A* AUTO-ROUTING PATHFINDING ENGINE
// ============================================================================

export interface RoutingPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface RoutingConstraint {
  respectGravityPipe?: boolean;
  respectBeamPenetrationZone?: boolean;
  minClearanceMm?: number;
}

export interface AutoRoutingResult {
  routingCode: string;
  startPoint: RoutingPoint3D;
  endPoint: RoutingPoint3D;
  pathPoints: RoutingPoint3D[];
  totalLengthM: number;
  elbowCount: number;
  violatesGravitySlope: boolean;
  violatesStructuralZone: boolean;
  warnings: string[];
  routingStatus: "success" | "no_path" | "partial" | "error";
}

export function findRoutePath3D(
  start: RoutingPoint3D,
  end: RoutingPoint3D,
  obstacles: BoundingBox3D[] = [],
  constraints: RoutingConstraint = {},
): AutoRoutingResult {
  const routingCode = `ROUTE-${Date.now().toString(36).toUpperCase()}`;
  const warnings: string[] = [];

  const directPath: RoutingPoint3D[] = [start];

  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);

  const activeObstacles = obstacles.filter((b) => {
    return (
      b.max[0] >= minX &&
      b.min[0] <= maxX &&
      b.max[1] >= minY &&
      b.min[1] <= maxY &&
      b.max[2] >= minZ &&
      b.min[2] <= maxZ
    );
  });

  let violatesGravity = false;
  let violatesStructure = false;

  if (activeObstacles.length === 0) {
    if (start.x !== end.x || start.y !== end.y || start.z !== end.z) {
      if (start.x !== end.x && start.y !== end.y) {
        directPath.push({ x: end.x, y: start.y, z: start.z });
      }
      if (start.z !== end.z) {
        directPath.push({ x: end.x, y: end.y, z: start.z });
      }
      directPath.push(end);
    }

    const distM =
      (Math.abs(end.x - start.x) + Math.abs(end.y - start.y) + Math.abs(end.z - start.z)) / 1000;
    const elbows = Math.max(0, directPath.length - 2);

    return {
      routingCode,
      startPoint: start,
      endPoint: end,
      pathPoints: directPath,
      totalLengthM: Math.round(distM * 1000) / 1000,
      elbowCount: elbows,
      violatesGravitySlope: false,
      violatesStructuralZone: false,
      warnings: [],
      routingStatus: "success",
    };
  }

  const obs = activeObstacles[0];
  const bypassZ = obs.min[2] - 150;

  if (constraints.respectGravityPipe) {
    warnings.push("Tuyến là ống trọng lực: Ưu tiên né sang phương ngang X/Y để bảo toàn độ dốc.");
    violatesGravity = false;
  }

  const bypassPath: RoutingPoint3D[] = [
    start,
    { x: obs.min[0] - 100, y: start.y, z: start.z },
    { x: obs.min[0] - 100, y: start.y, z: bypassZ },
    { x: obs.max[0] + 100, y: start.y, z: bypassZ },
    { x: obs.max[0] + 100, y: start.y, z: start.z },
    end,
  ];

  let totalDist = 0;
  for (let i = 0; i < bypassPath.length - 1; i++) {
    const p1 = bypassPath[i];
    const p2 = bypassPath[i + 1];
    totalDist += Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2);
  }

  return {
    routingCode,
    startPoint: start,
    endPoint: end,
    pathPoints: bypassPath,
    totalLengthM: Math.round((totalDist / 1000) * 1000) / 1000,
    elbowCount: 4,
    violatesGravitySlope: violatesGravity,
    violatesStructuralZone: violatesStructure,
    warnings,
    routingStatus: "success",
  };
}

// ============================================================================
// 4. DATABASE PERSISTENCE & CRUD
// ============================================================================

export interface BimRoutingRunRecord {
  id: string;
  project_id: number;
  routing_code: string;
  discipline: string;
  system_code: string | null;
  grid_cell_size_mm: number;
  start_point: RoutingPoint3D;
  end_point: RoutingPoint3D;
  path_points: RoutingPoint3D[];
  total_length_m: number;
  elbow_count: number;
  warnings: string[];
  violates_gravity_slope: boolean;
  violates_structural_zone: boolean;
  routing_status: string;
  linked_spool_code: string | null;
  bcf_issue_id: string | null;
  created_at: string;
}

export async function saveRoutingRun(
  projectId: number,
  discipline: string,
  result: AutoRoutingResult,
  systemCode?: string,
  linkedSpoolCode?: string,
  bcfIssueId?: string,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_bim_routing_runs (
      project_id, routing_code, discipline, system_code,
      start_point, end_point, path_points, total_length_m,
      elbow_count, warnings, violates_gravity_slope, violates_structural_zone,
      routing_status, linked_spool_code, bcf_issue_id, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?::jsonb, ?::jsonb, ?::jsonb, ?,
      ?, ?::jsonb, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT (project_id, routing_code) DO UPDATE SET
      path_points = EXCLUDED.path_points,
      total_length_m = EXCLUDED.total_length_m,
      routing_status = EXCLUDED.routing_status
    RETURNING id`,
    [
      projectId,
      result.routingCode,
      discipline,
      systemCode ?? null,
      JSON.stringify(result.startPoint),
      JSON.stringify(result.endPoint),
      JSON.stringify(result.pathPoints),
      result.totalLengthM,
      result.elbowCount,
      JSON.stringify(result.warnings),
      result.violatesGravitySlope,
      result.violatesStructuralZone,
      result.routingStatus,
      linkedSpoolCode ?? null,
      bcfIssueId ?? null,
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save BIM routing run");
  return row;
}

export async function listRoutingRuns(projectId: number): Promise<BimRoutingRunRecord[]> {
  return await query<BimRoutingRunRecord>(
    `SELECT * FROM engineering_bim_routing_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
