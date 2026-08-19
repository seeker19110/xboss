/**
 * Core Engine cho Module M80: 3D BIM/IFC Web Viewer & 4D Construction Simulation Studio
 * Xử lý hình học tham số 3D MEPF, mô phỏng dòng thời gian 4D kết nối WBS, và cắt mặt phẳng 3D Section Box.
 */

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
  PLUMBING_WATER: "#10b981", // Emerald
  PLUMBING_DRAINAGE: "#8b5cf6", // Violet
  ELECTRICAL_POWER: "#eab308", // Yellow
  FIRE_SPRINKLER: "#ef4444", // Red
  STRUCTURE: "#64748b", // Slate
};

export const STATUS_4D_COLORS: Record<Element4DVisualStatus, string> = {
  not_started: "#475569", // Mờ wireframe
  in_progress: "#f97316", // Cam rực rỡ
  completed: "#10b981", // Xanh lá
  approved: "#06b6d4", // Xanh cyan ngọc
  delayed: "#dc2626", // Đỏ cảnh báo
};

/**
 * Sinh lưới hình học tham số 3D (Parametric Mesh Generator) cho các cấu kiện MEPF
 */
export function generateParametricMepfMesh(
  elementType: string,
  dimensions: { width?: number; height?: number; length?: number; diameter?: number },
  startPoint: Point3D = { x: 0, y: 0, z: 0 },
  endPoint?: Point3D,
): MeshGeometry3D {
  const length =
    dimensions.length ??
    (endPoint
      ? Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y, endPoint.z - startPoint.z)
      : 1000);
  const w = (dimensions.width ?? 300) / 1000; // m
  const h = (dimensions.height ?? 200) / 1000; // m
  const l = length / 1000; // m
  const d = (dimensions.diameter ?? 100) / 1000; // m

  const x0 = startPoint.x / 1000;
  const y0 = startPoint.y / 1000;
  const z0 = startPoint.z / 1000;

  if (elementType.startsWith("PIPE")) {
    // Trụ tròn 8 cạnh xấp xỉ ống nước tròn
    const segments = 8;
    const vertices: number[] = [];
    const indices: number[] = [];
    const r = d / 2;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Điểm đầu
      vertices.push(x0 + cos * r, y0 + sin * r, z0);
      // Điểm cuối
      vertices.push(x0 + cos * r, y0 + sin * r, z0 + l);
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const i0 = i * 2;
      const i1 = i * 2 + 1;
      const i2 = next * 2;
      const i3 = next * 2 + 1;

      // 2 tam giác cho mỗi mặt bên
      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }

    return {
      vertices,
      indices,
      dimensions: { diameter: dimensions.diameter ?? 100, length },
      path: [
        startPoint,
        endPoint ?? { x: startPoint.x, y: startPoint.y, z: startPoint.z + length },
      ],
    };
  }

  // Mặc định hình hộp chữ nhật (Ống gió / Máng cáp)
  const vertices = [
    // Mặt trước (z = z0)
    x0 - w / 2,
    y0 - h / 2,
    z0,
    x0 + w / 2,
    y0 - h / 2,
    z0,
    x0 + w / 2,
    y0 + h / 2,
    z0,
    x0 - w / 2,
    y0 + h / 2,
    z0,
    // Mặt sau (z = z0 + l)
    x0 - w / 2,
    y0 - h / 2,
    z0 + l,
    x0 + w / 2,
    y0 - h / 2,
    z0 + l,
    x0 + w / 2,
    y0 + h / 2,
    z0 + l,
    x0 - w / 2,
    y0 + h / 2,
    z0 + l,
  ];

  const indices = [
    // Trước
    0, 1, 2, 0, 2, 3,
    // Sau
    4, 6, 5, 4, 7, 6,
    // Trái
    0, 3, 7, 0, 7, 4,
    // Phải
    1, 5, 6, 1, 6, 2,
    // Dưới
    0, 4, 5, 0, 5, 1,
    // Trên
    3, 2, 6, 3, 6, 7,
  ];

  return {
    vertices,
    indices,
    dimensions: { width: dimensions.width ?? 300, height: dimensions.height ?? 200, length },
    path: [startPoint, endPoint ?? { x: startPoint.x, y: startPoint.y, z: startPoint.z + length }],
  };
}

export interface WbsTaskSnapshot {
  id: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  progress: number; // 0.0 -> 1.0
  status: string; // chuan_bi | dang_thi_cong | hoan_thanh | tre | nghiem_thu
  approvedDate?: string | null;
}

/**
 * Động cơ tính toán trạng thái mô phỏng 4D (4D Time-Lapse Engine)
 */
export function compute4DSimulationState(
  elements: BimElement[],
  targetDateISO: string,
  wbsMap: Map<number, WbsTaskSnapshot>,
  options: { showGhostNotStarted?: boolean } = { showGhostNotStarted: true },
): SimulationTimeStepResult {
  const counts: Record<Element4DVisualStatus, number> = {
    not_started: 0,
    in_progress: 0,
    completed: 0,
    approved: 0,
    delayed: 0,
  };

  let totalWeightedProgress = 0;

  const states: Element4DState[] = elements.map((elem) => {
    const task = elem.wbsTaskId ? wbsMap.get(elem.wbsTaskId) : undefined;

    if (!task) {
      // Không gắn task WBS -> hiển thị màu hệ thống mặc định
      const sysColor = SYSTEM_DEFAULT_COLORS[elem.systemType] ?? "#94a3b8";
      return {
        elementId: elem.id,
        guid: elem.guid,
        status: "not_started",
        progressPercent: 0,
        colorHex: sysColor,
        opacity: 0.35,
        visible: options.showGhostNotStarted ?? true,
      };
    }

    let status: Element4DVisualStatus = "not_started";
    let progress = 0;
    let colorHex = STATUS_4D_COLORS.not_started;
    let opacity = 0.3;
    let visible = options.showGhostNotStarted ?? true;
    let highlightAlert = false;

    const start = task.startDate;
    const end = task.endDate;

    if (targetDateISO < start) {
      status = "not_started";
      progress = 0;
      opacity = 0.25;
      colorHex = STATUS_4D_COLORS.not_started;
      visible = options.showGhostNotStarted ?? true;
    } else if (
      task.status === "nghiem_thu" ||
      (task.approvedDate && targetDateISO >= task.approvedDate)
    ) {
      status = "approved";
      progress = 100;
      opacity = 1.0;
      colorHex = STATUS_4D_COLORS.approved;
      visible = true;
    } else if (targetDateISO >= end && task.progress < 1) {
      status = "delayed";
      progress = Math.round(task.progress * 100);
      opacity = 1.0;
      colorHex = STATUS_4D_COLORS.delayed;
      visible = true;
      highlightAlert = true;
    } else if (task.progress >= 1 || targetDateISO >= end) {
      status = "completed";
      progress = 100;
      opacity = 0.95;
      colorHex = STATUS_4D_COLORS.completed;
      visible = true;
    } else {
      status = "in_progress";
      // Nội suy tuyến tính theo ngày nếu task đang chạy
      progress = Math.min(95, Math.max(10, Math.round(task.progress * 100)));
      opacity = 0.85;
      colorHex = STATUS_4D_COLORS.in_progress;
      visible = true;
    }

    counts[status]++;
    totalWeightedProgress += progress;

    return {
      elementId: elem.id,
      guid: elem.guid,
      wbsTaskId: elem.wbsTaskId,
      status,
      progressPercent: progress,
      colorHex,
      opacity,
      visible,
      highlightAlert,
    };
  });

  const totalElements = elements.length;
  const overallProgressPercent =
    totalElements > 0 ? Math.round(totalWeightedProgress / totalElements) : 0;

  return {
    targetDate: targetDateISO,
    totalElements,
    countsByStatus: counts,
    overallProgressPercent,
    elements: states,
  };
}

/**
 * Động cơ Cắt Mặt Phẳng 3D Section Plane (Section Cut Engine)
 */
export function compute3DSectionCut(
  elements: BimElement[],
  sectionPlane: { axis: "x" | "y" | "z"; offset: number; inverted?: boolean },
): { visibleElements: BimElement[]; clippedCount: number } {
  const { axis, offset, inverted = false } = sectionPlane;

  const visibleElements = elements.filter((elem) => {
    const verts = elem.geometryData.vertices;
    if (!verts || verts.length === 0) return true;

    // Lấy tọa độ trung bình
    let sum = 0;
    const stride = 3;
    const coordIdx = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const vertexCount = verts.length / stride;

    for (let i = 0; i < verts.length; i += stride) {
      sum += verts[i + coordIdx];
    }
    const centerVal = (sum / vertexCount) * 1000; // về mm

    if (!inverted) {
      return centerVal <= offset;
    } else {
      return centerVal >= offset;
    }
  });

  return {
    visibleElements,
    clippedCount: elements.length - visibleElements.length,
  };
}

/**
 * Tính toán Hộp bao 3D (Bounding Box AABB) tổng thể
 */
export function calculateModelBoundingBox(elements: BimElement[]): BoundingBox3D {
  if (elements.length === 0) {
    return { min: [0, 0, 0], max: [100, 100, 30] };
  }

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

/**
 * Lọc thực thể BIM theo Psets và thuộc tính kỹ thuật
 */
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
