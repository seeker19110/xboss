/**
 * Core Engine cho Module M80: 3D BIM/IFC Web Viewer & 4D Construction Simulation Studio
 * Xử lý hình học tham số 3D MEPF, mô phỏng dòng thời gian 4D kết nối WBS, và cắt mặt phẳng 3D Section Box.
 * M89: Thêm DB Persistence (save/load 4D simulation, list models/elements).
 */
import { query, queryOne, run } from "@/lib/db";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox3D {
  min: [number, number, number];
  max: [number, number, number];
}

export interface MeshGeometry3D {
  vertices: number[]; // Flattened [x1, y1, z1, x2, y2, z2, ...]
  indices: number[]; // Triangle indices
  normals?: number[]; // Surface normal vectors
  color?: string; // Hex default
  dimensions: {
    width?: number; // mm
    height?: number; // mm
    length?: number; // mm
    diameter?: number; // mm
  };
  path?: Point3D[]; // Centerline route
}

export interface BimElementProperties {
  pset?: {
    airflow?: number; // m3/h
    velocity?: number; // m/s
    pressureDrop?: number; // Pa
    material?: string; // Tôn mạ kẽm Z80, Inox 304, PVC-U, PPR, Thép đen
    insulation?: string; // Aeroflex 19mm, Bông thủy tinh 50mm
    elevation?: number; // mm so với FFL sàn
    supplier?: string;
    specification?: string;
  };
  customFields?: Record<string, unknown>;
}

export interface BimElement {
  id: string;
  modelId: string;
  projectId: number;
  guid: string;
  elementType: string; // DUCT_STRAIGHT | DUCT_ELBOW | DUCT_TEE | PIPE_STRAIGHT | PIPE_VALVE | CABLE_TRAY | AIR_TERMINAL | EQUIPMENT | SLAB | BEAM
  systemType: string; // HVAC_SUPPLY | HVAC_RETURN | PLUMBING_WATER | PLUMBING_DRAINAGE | ELECTRICAL_POWER | FIRE_SPRINKLER
  name: string;
  geometryData: MeshGeometry3D;
  properties: BimElementProperties;
  wbsTaskId?: number | null;
  createdAt?: string;
}

export interface BimModel {
  id: string;
  projectId: number;
  name: string;
  discipline: "hvac" | "plumbing" | "electrical" | "firefighting" | "structure" | "combined";
  floorId?: number | null;
  format: "ifc" | "gltf" | "json_mesh";
  fileUrl?: string | null;
  fileHash?: string | null;
  elementCount: number;
  boundingBox: BoundingBox3D;
  metadata: Record<string, unknown>;
  createdBy?: number | null;
  createdAt?: string;
}

export type Element4DVisualStatus =
  "not_started" | "in_progress" | "completed" | "approved" | "delayed";

export interface Element4DState {
  elementId: string;
  guid: string;
  wbsTaskId?: number | null;
  status: Element4DVisualStatus;
  progressPercent: number;
  colorHex: string;
  opacity: number;
  visible: boolean;
  highlightAlert?: boolean;
}

export interface SimulationTimeStepResult {
  targetDate: string;
  totalElements: number;
  countsByStatus: Record<Element4DVisualStatus, number>;
  overallProgressPercent: number;
  elements: Element4DState[];
}

export const SYSTEM_DEFAULT_COLORS: Record<string, string> = {
  HVAC_SUPPLY: "#0284c7", // Sky blue
  HVAC_RETURN: "#f59e0b", // Amber
  PLUMBING_WATER: "#06b6d4", // Cyan
  PLUMBING_DRAINAGE: "#84cc16", // Lime green
  ELECTRICAL_POWER: "#eab308", // Yellow
  FIRE_SPRINKLER: "#ef4444", // Red
  STRUCTURE: "#64748b", // Slate gray
};

export const STATUS_4D_COLORS: Record<Element4DVisualStatus, string> = {
  not_started: "#3f3f46", // Dark Zinc ghost
  in_progress: "#38bdf8", // Glowing Sky Blue
  completed: "#34d399", // Solid Emerald Green
  approved: "#10b981", // Deep Verified Green
  delayed: "#f43f5e", // Flashing Rose/Red Alert
};

// ============================================================================
// 1. THUẬT TOÁN SINH HÌNH HỌC THAM SỐ 3D MEPF (PARAMETRIC MESH GENERATOR)
// ============================================================================

export function generateParametricMepfMesh(
  elementType: string,
  dimensions: {
    width?: number;
    height?: number;
    length?: number;
    diameter?: number;
  },
  startPoint: Point3D = { x: 0, y: 0, z: 0 },
  endPoint?: Point3D,
): MeshGeometry3D {
  const isPipe = elementType.includes("PIPE");
  const isDuctOrTray =
    elementType.includes("DUCT") || elementType.includes("TRAY") || elementType.includes("BEAM");

  const length =
    dimensions.length ||
    (endPoint
      ? Math.sqrt(
          (endPoint.x - startPoint.x) ** 2 +
            (endPoint.y - startPoint.y) ** 2 +
            (endPoint.z - startPoint.z) ** 2,
        )
      : 1000);

  const l = length / 1000;
  const sx = startPoint.x / 1000;
  const sy = startPoint.y / 1000;
  const sz = startPoint.z / 1000;

  if (isPipe) {
    const d = (dimensions.diameter || 100) / 1000;
    const r = d / 2;
    const segments = 8;
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const vy = Math.cos(theta) * r;
      const vz = Math.sin(theta) * r;
      vertices.push(sx, sy + vy, sz + vz);
    }
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const vy = Math.cos(theta) * r;
      const vz = Math.sin(theta) * r;
      vertices.push(sx + l, sy + vy, sz + vz);
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const p1 = i;
      const p2 = next;
      const p3 = i + segments;
      const p4 = next + segments;

      indices.push(p1, p2, p3);
      indices.push(p2, p4, p3);
    }

    return {
      vertices,
      indices,
      dimensions,
      color: SYSTEM_DEFAULT_COLORS.PLUMBING_WATER,
    };
  }

  if (isDuctOrTray) {
    const w = (dimensions.width || 600) / 1000;
    const h = (dimensions.height || 400) / 1000;

    const hw = w / 2;
    const hh = h / 2;

    const vertices = [
      sx,
      sy - hw,
      sz - hh,
      sx,
      sy + hw,
      sz - hh,
      sx,
      sy + hw,
      sz + hh,
      sx,
      sy - hw,
      sz + hh,
      sx + l,
      sy - hw,
      sz - hh,
      sx + l,
      sy + hw,
      sz - hh,
      sx + l,
      sy + hw,
      sz + hh,
      sx + l,
      sy - hw,
      sz + hh,
    ];

    const indices = [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3,
      7, 4, 3, 4, 0,
    ];

    return {
      vertices,
      indices,
      dimensions,
      color: SYSTEM_DEFAULT_COLORS.HVAC_SUPPLY,
    };
  }

  const s = (dimensions.width || 500) / 1000;
  return {
    vertices: [
      sx,
      sy,
      sz,
      sx + s,
      sy,
      sz,
      sx + s,
      sy + s,
      sz,
      sx,
      sy + s,
      sz,
      sx,
      sy,
      sz + s,
      sx + s,
      sy,
      sz + s,
      sx + s,
      sy + s,
      sz + s,
      sx,
      sy + s,
      sz + s,
    ],
    indices: [
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3,
      7, 4, 3, 4, 0,
    ],
    dimensions,
    color: SYSTEM_DEFAULT_COLORS.ELECTRICAL_POWER,
  };
}

// ============================================================================
// 2. ĐỘNG CƠ MÔ PHỎNG DÒNG THỜI GIAN 4D (4D TIME-LAPSE SIMULATION ENGINE)
// ============================================================================

export interface WbsTaskSnapshot {
  id: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  progress: number; // 0..1
  status: string;
  approvedDate?: string | null;
}

export function compute4DSimulationState(
  elements: BimElement[],
  targetDateISO: string,
  wbsMap: Map<number, WbsTaskSnapshot>,
  options: {
    ghostOpacity?: number;
    completedOpacity?: number;
    inProgressBlink?: boolean;
    showGhostNotStarted?: boolean;
  } = {},
): SimulationTimeStepResult {
  const targetTime = new Date(targetDateISO).getTime();
  const ghostOpacity = options.ghostOpacity ?? 0.15;
  const completedOpacity = options.completedOpacity ?? 0.95;

  const counts: Record<Element4DVisualStatus, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
    approved: 0,
    delayed: 0,
  };

  let totalWeightedProgress = 0;
  let linkedElementCount = 0;

  const states: Element4DState[] = elements.map((elem) => {
    if (!elem.wbsTaskId || !wbsMap.has(elem.wbsTaskId)) {
      counts.not_started++;
      return {
        elementId: elem.id,
        guid: elem.guid,
        wbsTaskId: elem.wbsTaskId,
        status: "not_started",
        progressPercent: 0,
        colorHex: STATUS_4D_COLORS.not_started,
        opacity: ghostOpacity,
        visible: true,
      };
    }

    linkedElementCount++;
    const task = wbsMap.get(elem.wbsTaskId)!;
    const startTime = new Date(task.startDate).getTime();
    const endTime = new Date(task.endDate).getTime();
    const isApproved = Boolean(
      task.approvedDate && new Date(task.approvedDate).getTime() <= targetTime,
    );

    let status: Element4DVisualStatus = "not_started";
    let progressPercent = 0;
    let colorHex = STATUS_4D_COLORS.not_started;
    let opacity = ghostOpacity;
    let highlightAlert = false;

    if (isApproved) {
      status = "approved";
      progressPercent = 100;
      colorHex = STATUS_4D_COLORS.approved;
      opacity = completedOpacity;
    } else if (targetTime < startTime) {
      status = "not_started";
      progressPercent = 0;
      colorHex = STATUS_4D_COLORS.not_started;
      opacity = ghostOpacity;
    } else if (targetTime >= startTime && targetTime <= endTime) {
      const plannedDuration = Math.max(1, endTime - startTime);
      const elapsed = targetTime - startTime;
      const expectedLinearProgress = Math.min(100, Math.round((elapsed / plannedDuration) * 100));

      progressPercent = Math.round(task.progress * 100);
      status = "in_progress";
      colorHex = STATUS_4D_COLORS.in_progress;
      opacity = 0.85;

      if (progressPercent < expectedLinearProgress - 15) {
        status = "delayed";
        colorHex = STATUS_4D_COLORS.delayed;
        highlightAlert = true;
      }
    } else if (targetTime > endTime) {
      if (task.progress >= 1) {
        status = "completed";
        progressPercent = 100;
        colorHex = STATUS_4D_COLORS.completed;
        opacity = completedOpacity;
      } else {
        status = "delayed";
        progressPercent = Math.round(task.progress * 100);
        colorHex = STATUS_4D_COLORS.delayed;
        opacity = 0.9;
        highlightAlert = true;
      }
    }

    counts[status]++;
    totalWeightedProgress += progressPercent;

    return {
      elementId: elem.id,
      guid: elem.guid,
      wbsTaskId: elem.wbsTaskId,
      status,
      progressPercent,
      colorHex,
      opacity,
      visible: true,
      highlightAlert,
    };
  });

  const overallProgress =
    linkedElementCount > 0 ? Math.round(totalWeightedProgress / linkedElementCount) : 0;

  return {
    targetDate: targetDateISO,
    totalElements: elements.length,
    countsByStatus: counts,
    overallProgressPercent: overallProgress,
    elements: states,
  };
}

// ============================================================================
// 3. MẶT PHẲNG CẮT 3D SECTION BOX CLIPPING
// ============================================================================

export interface SectionPlane {
  axis: "x" | "y" | "z";
  positionMm?: number;
  offset?: number;
  direction?: "positive" | "negative";
}

export function compute3DSectionCut(
  elements: BimElement[],
  sectionPlane: SectionPlane,
): {
  visibleElements: BimElement[];
  clippedCount: number;
} {
  const posMm = sectionPlane.positionMm ?? sectionPlane.offset ?? 0;
  const planePosM = posMm / 1000;
  const dir = sectionPlane.direction ?? "positive";
  const axisIdx = sectionPlane.axis === "x" ? 0 : sectionPlane.axis === "y" ? 1 : 2;

  let clipped = 0;
  const visible = elements.filter((elem) => {
    const verts = elem.geometryData.vertices;
    if (!verts || verts.length === 0) return true;

    let centerVal = 0;
    const vertexCount = verts.length / 3;
    for (let i = 0; i < verts.length; i += 3) {
      centerVal += verts[i + axisIdx];
    }
    centerVal /= vertexCount;

    const isVisible = dir === "positive" ? centerVal >= planePosM : centerVal <= planePosM;

    if (!isVisible) clipped++;
    return isVisible;
  });

  return {
    visibleElements: visible,
    clippedCount: clipped,
  };
}

// ============================================================================
// 4. TIỆN ÍCH HÌNH HỌC VÀ THUỘC TÍNH PROPERTY SET (PSETS)
// ============================================================================

export function calculateModelBoundingBox(elements: BimElement[]): BoundingBox3D {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const elem of elements) {
    const verts = elem.geometryData.vertices;
    if (!verts) continue;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i] * 1000;
      const y = verts[i + 1] * 1000;
      const z = verts[i + 2] * 1000;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }

  return {
    min: [
      Number.isFinite(minX) ? Math.round(minX) : 0,
      Number.isFinite(minY) ? Math.round(minY) : 0,
      Number.isFinite(minZ) ? Math.round(minZ) : 0,
    ],
    max: [
      Number.isFinite(maxX) ? Math.round(maxX) : 100,
      Number.isFinite(maxY) ? Math.round(maxY) : 100,
      Number.isFinite(maxZ) ? Math.round(maxZ) : 30,
    ],
  };
}

export function filterElementsPropertySet(
  elements: BimElement[],
  filters: {
    systemType?: string;
    minAirflow?: number;
    maxPressureDrop?: number;
    material?: string;
    hasWbsTask?: boolean;
  },
): BimElement[] {
  return elements.filter((elem) => {
    if (filters.systemType && elem.systemType !== filters.systemType) {
      return false;
    }
    if (filters.hasWbsTask !== undefined) {
      const hasTask = Boolean(elem.wbsTaskId);
      if (hasTask !== filters.hasWbsTask) return false;
    }
    if (filters.minAirflow !== undefined) {
      const airflow = elem.properties.pset?.airflow ?? 0;
      if (airflow < filters.minAirflow) return false;
    }
    if (filters.maxPressureDrop !== undefined) {
      const pressure = elem.properties.pset?.pressureDrop ?? Infinity;
      if (pressure > filters.maxPressureDrop) return false;
    }
    if (filters.material && elem.properties.pset?.material) {
      if (!elem.properties.pset.material.toLowerCase().includes(filters.material.toLowerCase())) {
        return false;
      }
    }
    return true;
  });
}

// ============================================================================
// 5. DATABASE PERSISTENCE & CRUD (B10 Fix)
// ============================================================================

export interface BimSimulationRecord {
  id: string;
  project_id: number;
  model_id: string;
  title: string;
  start_date: string;
  end_date: string;
  current_time_step: number;
  settings: Record<string, unknown>;
  created_by: number | null;
  created_at: string;
}

export async function save4dSimulation(
  projectId: number,
  modelId: string,
  title: string,
  startDate: string,
  endDate: string,
  settings: Record<string, unknown> = {},
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_bim_4d_simulations (
      project_id, model_id, title, start_date, end_date, settings, created_by
    ) VALUES (
      ?, ?, ?, ?, ?, ?::jsonb, ?
    ) RETURNING id`,
    [projectId, modelId, title, startDate, endDate, JSON.stringify(settings), userId ?? null],
  );

  if (!row) throw new Error("Failed to save 4D simulation");
  return row;
}

export async function load4dSimulation(
  projectId: number,
  modelId: string,
): Promise<BimSimulationRecord | null> {
  const row = await queryOne<BimSimulationRecord>(
    `SELECT * FROM engineering_bim_4d_simulations 
     WHERE project_id = ? AND model_id = ? 
     ORDER BY created_at DESC LIMIT 1`,
    [projectId, modelId],
  );
  return row ?? null;
}

export async function list4dSimulations(projectId: number): Promise<BimSimulationRecord[]> {
  return await query<BimSimulationRecord>(
    `SELECT * FROM engineering_bim_4d_simulations 
     WHERE project_id = ? 
     ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}

export async function listBimModels(projectId: number): Promise<BimModel[]> {
  return await query<BimModel>(
    `SELECT * FROM engineering_bim_models WHERE project_id = ? ORDER BY created_at DESC`,
    [projectId],
  );
}

export async function listBimElements(projectId: number, modelId: string): Promise<BimElement[]> {
  return await query<BimElement>(
    `SELECT * FROM engineering_bim_elements WHERE project_id = ? AND model_id = ?`,
    [projectId, modelId],
  );
}
