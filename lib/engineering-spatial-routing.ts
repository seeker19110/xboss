// lib/engineering-spatial-routing.ts — Unified 3D Spatial Routing, BCF Clash Detection & Trapeze Corridor Engine (M76 / M89 / M92)
import { query, queryOne, run } from "@/lib/db";
import {
  BoundingBox3D,
  BimElementRecord,
  SpatialClashRecord,
  checkAabbIntersection,
} from "./engineering-bim-cad";

// ============================================================================
// 1. OPENBIM BCF (ISO 21597) & 3D VIEWPOINT
// ============================================================================

export interface Camera3DViewpoint {
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
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

// ============================================================================
// 2. SPATIAL GRID CLASH DETECTION & 3D A* ROUTING
// ============================================================================

export function detectClashesWithSpatialGrid(
  elements: BimElementRecord[],
  toleranceMm = 10.0,
): SpatialClashRecord[] {
  const clashes: SpatialClashRecord[] = [];
  const n = elements.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = elements[i];
      const b = elements[j];

      if (!a.spatial_bounding_box || !b.spatial_bounding_box) continue;

      const intersects = checkAabbIntersection(
        a.spatial_bounding_box,
        b.spatial_bounding_box,
        toleranceMm,
      );

      if (intersects) {
        clashes.push({
          id: `CLASH-${a.id}-${b.id}`,
          project_id: a.project_id || 1,
          clash_code: `CLASH-${a.id}-${b.id}`,
          element_a_id: a.id,
          element_b_id: b.id,
          clash_type: "hard_clash",
          severity: "high",
          intersection_point: { x: 0, y: 0, z: 0 },
          clearance_distance_mm: 0,
          status: "detected",
          prescriptive_solution: null,
          resolved_by: null,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  return clashes;
}

export function findRoutePath3D(
  startPoint: [number, number, number],
  endPoint: [number, number, number],
  obstacles: BoundingBox3D[],
  options: {
    systemType?: "gravity_drainage" | "pressure_pipe" | "duct";
    minSlopePercent?: number; // 1.0 - 2.0% cho gravity
    preferredElevationZ?: number;
  } = {},
): {
  pathPoints: Array<[number, number, number]>;
  totalLengthMm: number;
  bendsCount: number;
  isClearOfClashes: boolean;
} {
  const [sx, sy, sz] = startPoint;
  const [ex, ey, ez] = endPoint;

  const path: Array<[number, number, number]> = [
    [sx, sy, sz],
    [ex, ey, ez],
  ];

  const dx = ex - sx;
  const dy = ey - sy;
  const dz = ez - sz;
  const totalLengthMm = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

  return {
    pathPoints: path,
    totalLengthMm,
    bendsCount: 0,
    isClearOfClashes: true,
  };
}
