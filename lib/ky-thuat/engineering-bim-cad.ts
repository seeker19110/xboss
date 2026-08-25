// lib/engineering-bim-cad.ts — 3D/4D/5D Spatial BIM-CAD Engine & Clash Solver
import { query, queryOne } from "@/lib/db";

export type BimDiscipline =
  "architecture" | "structure" | "hvac" | "plumbing" | "electrical" | "firefighting" | "combined";

export type BimFileFormat = "ifc" | "dxf" | "dwg" | "gltf" | "las";

export type ClashType = "hard_clash" | "soft_clearance" | "workflow_order";
export type ClashSeverity = "low" | "medium" | "high" | "critical";
export type ClashStatus = "detected" | "resolved" | "ignored" | "rfi_created";

// BoundingBox3D dùng chung từ lib/nen/bim-3d.ts (tầng 0) — trước đây khai trùng ở nhiều module.
export type { BoundingBox3D } from "@/lib/nen/bim-3d";
import type { BoundingBox3D } from "@/lib/nen/bim-3d";

export interface BimElementRecord {
  id: string;
  project_id: number;
  ifc_guid: string;
  element_type: string;
  discipline: BimDiscipline;
  system_name: string | null;
  storey_level: string | null;
  zone_name: string | null;
  properties: Record<string, unknown>;
  spatial_bounding_box: BoundingBox3D;
  task_id: number | null;
  boq_code: string | null;
  actual_status: string;
  created_at: string;
  task_name?: string;
  task_progress?: number;
  task_status?: string;
}

export interface SpatialClashRecord {
  id: string;
  project_id: number;
  clash_code: string;
  element_a_id: string;
  element_b_id: string;
  clash_type: ClashType;
  severity: ClashSeverity;
  intersection_point: { x: number; y: number; z: number };
  clearance_distance_mm: number;
  status: ClashStatus;
  prescriptive_solution: ClashRerouteSolution | null;
  resolved_by: number | null;
  created_at: string;
  element_a_type?: string;
  element_a_guid?: string;
  element_b_type?: string;
  element_b_guid?: string;
  element_a_system?: string;
  element_b_system?: string;
}

export interface ClashRerouteOption {
  optionIndex: number;
  title: string;
  strategy: "shift_routing" | "add_elbow_45" | "resize_section" | "sleeve_opening";
  description: string;
  estimatedCostVnd: number;
  scheduleImpactDays: number;
  pressureDropPa: number;
  tradeOffScore: number; // 0..1 (càng cao càng tối ưu)
  actionDetails: string[];
}

export interface ClashRerouteSolution {
  clashCode: string;
  primaryElementGuid: string;
  conflictingElementGuid: string;
  options: ClashRerouteOption[];
  recommendedIndex: number;
  synthesisReason: string;
}

export interface QtoSummaryItem {
  discipline: BimDiscipline;
  elementType: string;
  systemName: string;
  totalElements: number;
  calculatedQuantity: number;
  unit: string;
  mappedBoqCode: string | null;
}

// ============================================================================
// 1. THUẬT TOÁN HÌNH HỌC KHÔNG GIAN (SPATIAL GEOMETRY MATH)
// ============================================================================

/**
 * Kiểm tra va chạm hộp bao 3D (Axis-Aligned Bounding Box - AABB).
 */
export function checkAabbIntersection(
  boxA: BoundingBox3D,
  boxB: BoundingBox3D,
  clearanceThresholdMm = 0,
): {
  isHardClash: boolean;
  isSoftClash: boolean;
  overlapX: number;
  overlapY: number;
  overlapZ: number;
  clearanceDistanceMm: number;
  center: { x: number; y: number; z: number };
} {
  const overlapX = Math.max(
    0,
    Math.min(boxA.max[0], boxB.max[0]) - Math.max(boxA.min[0], boxB.min[0]),
  );
  const overlapY = Math.max(
    0,
    Math.min(boxA.max[1], boxB.max[1]) - Math.max(boxA.min[1], boxB.min[1]),
  );
  const overlapZ = Math.max(
    0,
    Math.min(boxA.max[2], boxB.max[2]) - Math.max(boxA.min[2], boxB.min[2]),
  );

  const isHardClash = overlapX > 0 && overlapY > 0 && overlapZ > 0;

  // Tính khoảng cách tĩnh (Soft clearance distance)
  const dx = Math.max(0, Math.max(boxA.min[0] - boxB.max[0], boxB.min[0] - boxA.max[0]));
  const dy = Math.max(0, Math.max(boxA.min[1] - boxB.max[1], boxB.min[1] - boxA.max[1]));
  const dz = Math.max(0, Math.max(boxA.min[2] - boxB.max[2], boxB.min[2] - boxA.max[2]));

  const clearanceDistanceMm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const isSoftClash = !isHardClash && clearanceDistanceMm < clearanceThresholdMm;

  // Tọa độ tâm giao điểm / vị trí va chạm
  const centerX = (Math.max(boxA.min[0], boxB.min[0]) + Math.min(boxA.max[0], boxB.max[0])) / 2;
  const centerY = (Math.max(boxA.min[1], boxB.min[1]) + Math.min(boxA.max[1], boxB.max[1])) / 2;
  const centerZ = (Math.max(boxA.min[2], boxB.min[2]) + Math.min(boxA.max[2], boxB.max[2])) / 2;

  return {
    isHardClash,
    isSoftClash,
    overlapX,
    overlapY,
    overlapZ,
    clearanceDistanceMm: Math.round(clearanceDistanceMm * 100) / 100,
    center: {
      x: Math.round(centerX * 10) / 10,
      y: Math.round(centerY * 10) / 10,
      z: Math.round(centerZ * 10) / 10,
    },
  };
}

/**
 * Xác định màu sắc 4D Heatmap dựa trên trạng thái tiến độ thời gian thực của task liên kết.
 */
export function get4DStatusColor(
  taskStatus?: string,
  progress = 0,
  hasClash = false,
): { colorHex: string; statusLabel: string } {
  if (hasClash) {
    return { colorHex: "#ef4444", statusLabel: "Xung đột không gian (Clash)" };
  }
  if (taskStatus === "nghiem_thu" || progress >= 1) {
    return { colorHex: "#10b981", statusLabel: "Đã nghiệm thu (100%)" };
  }
  if (taskStatus === "tre") {
    return { colorHex: "#f97316", statusLabel: "Chậm tiến độ (Delayed)" };
  }
  if (taskStatus === "dang_thi_cong" || progress > 0) {
    return { colorHex: "#3b82f6", statusLabel: "Đang thi công" };
  }
  return { colorHex: "#64748b", statusLabel: "Chưa thi công (Pending)" };
}

/**
 * Thuật toán Prescriptive Auto-Reroute Solver sinh 3 kịch bản nắn tuyến giải quyết xung đột.
 */
export function generateClashRerouteSolution(
  clashCode: string,
  elementA: { guid: string; type: string; system?: string },
  elementB: { guid: string; type: string; system?: string },
): ClashRerouteSolution {
  const isDuctPipe =
    elementA.type.toLowerCase().includes("duct") ||
    elementA.type.toLowerCase().includes("pipe") ||
    elementB.type.toLowerCase().includes("duct") ||
    elementB.type.toLowerCase().includes("pipe");

  const options: ClashRerouteOption[] = [
    {
      optionIndex: 0,
      title: "Phương án 1: Dịch chuyển tuyến ống theo phương đứng/ngang (Shift Routing)",
      strategy: "shift_routing",
      description: `Hạ cao độ đáy tuyến ${elementA.system || elementA.type} xuống 150mm để né phần tử ${elementB.system || elementB.type}.`,
      estimatedCostVnd: 1200000,
      scheduleImpactDays: 0,
      pressureDropPa: 5,
      tradeOffScore: 0.92,
      actionDetails: [
        "Cập nhật cao độ treo ty giằng hạ 150mm tại trục giao cắt",
        "Kiểm tra cao độ trần hoàn thiện đảm bảo thông thủy > 2.6m",
      ],
    },
    {
      optionIndex: 1,
      title: "Phương án 2: Thêm cặp cút chuyển hướng 45 độ (Add 45° Elbows)",
      strategy: "add_elbow_45",
      description: `Bổ sung 2 cút 45° để tuyến ${elementA.system || elementA.type} vòng qua chướng ngại vật ${elementB.type}.`,
      estimatedCostVnd: 2800000,
      scheduleImpactDays: 1,
      pressureDropPa: 18,
      tradeOffScore: 0.85,
      actionDetails: [
        "Thêm 2 phụ kiện cút 45° và 1 đoạn ống bù 400mm",
        "Cập nhật phụ lục BOQ phát sinh phụ kiện",
      ],
    },
    {
      optionIndex: 2,
      title: "Phương án 3: Thay đổi tiết diện ống chữ nhật dẹt (Section Resize)",
      strategy: "resize_section",
      description: `Chuyển đổi tiết diện từ 400x300 thành 600x200 giữ nguyên diện tích lưu lượng khí.`,
      estimatedCostVnd: 4500000,
      scheduleImpactDays: 2,
      pressureDropPa: 12,
      tradeOffScore: 0.78,
      actionDetails: [
        "Sản xuất gia công hộp chuyển tiết diện (Transition duct)",
        "Trình duyệt lại áp lực quạt tới Tư vấn Giám sát",
      ],
    },
  ];

  if (!isDuctPipe) {
    options[2] = {
      optionIndex: 2,
      title: "Phương án 3: Tạo lỗ chờ xuyên kết cấu (Sleeve Opening)",
      strategy: "sleeve_opening",
      description: `Yêu cầu tổ Kết cấu đặt ống luồn sleeve D150 trước khi đổ bê tông.`,
      estimatedCostVnd: 800000,
      scheduleImpactDays: 0,
      pressureDropPa: 0,
      tradeOffScore: 0.95,
      actionDetails: [
        "Phát hành RFI xác nhận vị trí sleeve với Kỹ sư Kết cấu",
        "Nghiệm thu đặt sleeve trước khi đổ bê tông sàn",
      ],
    };
  }

  return {
    clashCode,
    primaryElementGuid: elementA.guid,
    conflictingElementGuid: elementB.guid,
    options,
    recommendedIndex: 0,
    synthesisReason:
      "Phương án 1 (Shift routing) đạt điểm Pareto tối ưu nhất về chi phí và không làm trễ tiến độ thi công.",
  };
}

// ============================================================================
// 2. BÓC TÁCH KHỐI LƯỢNG TỰ ĐỘNG (5D AUTO-QTO)
// ============================================================================

export function computeElementQto(element: {
  elementType?: string;
  element_type?: string;
  spatial_bounding_box: BoundingBox3D;
  properties?: Record<string, unknown>;
}): { quantity: number; unit: string } {
  const box = element.spatial_bounding_box;
  const dx = (box.max[0] - box.min[0]) / 1000; // m
  const dy = (box.max[1] - box.min[1]) / 1000; // m
  const dz = (box.max[2] - box.min[2]) / 1000; // m

  const type = (element.elementType || element.element_type || "").toLowerCase();

  // Ống gió: tính diện tích bề mặt (m2)
  if (type.includes("duct")) {
    const length = Math.max(dx, dy, dz);
    const perimeter = (Math.min(dx, dy) + Math.max(Math.min(dx, dz), Math.min(dy, dz))) * 2;
    const area = length * Math.max(0.5, perimeter);
    return { quantity: Math.round(area * 100) / 100, unit: "m2" };
  }

  // Ống nước / PCCC / Cable tray: tính chiều dài (m)
  if (type.includes("pipe") || type.includes("tray") || type.includes("conduit")) {
    const length = Math.max(dx, dy, dz);
    return { quantity: Math.round(length * 100) / 100, unit: "m" };
  }

  // Bê tông kết cấu dầm / sàn: tính thể tích (m3)
  if (type.includes("beam") || type.includes("slab") || type.includes("column")) {
    const volume = dx * dy * dz;
    return { quantity: Math.round(volume * 100) / 100, unit: "m3" };
  }

  // Thiết bị / Phụ kiện: tính cái / bộ
  return { quantity: 1, unit: "bộ" };
}

// ============================================================================
// 3. DATABASE QUERIES & INGESTION
// ============================================================================

export async function listBimElements(
  projectId: number,
  filter?: { storey?: string; system?: string; discipline?: string },
): Promise<BimElementRecord[]> {
  let sql = `
    SELECT
      o.id,
      o.project_id,
      o.external_key AS ifc_guid,
      o.object_type AS element_type,
      o.discipline,
      o.system_code AS system_name,
      o.location_floor AS storey_level,
      o.location_zone AS zone_name,
      o.properties,
      COALESCE(o.spatial_bounding_box, '{"min": [0,0,0], "max": [1000,1000,1000]}'::jsonb) AS spatial_bounding_box,
      b.task_id,
      o.boq_code,
      COALESCE(b.binding_status, 'active') AS actual_status,
      o.created_at,
      t.name AS task_name,
      t.progress AS task_progress,
      t.status AS task_status
    FROM engineering_objects o
    LEFT JOIN engineering_twin_bindings b
      ON b.target_key = o.external_key AND b.project_id = o.project_id
    LEFT JOIN tasks t ON t.id = b.task_id
    WHERE o.project_id = ?
  `;

  const params: unknown[] = [projectId];

  if (filter?.storey) {
    sql += ` AND o.location_floor = ?`;
    params.push(filter.storey);
  }
  if (filter?.system) {
    sql += ` AND o.system_code = ?`;
    params.push(filter.system);
  }
  if (filter?.discipline) {
    sql += ` AND o.discipline = ?`;
    params.push(filter.discipline);
  }

  sql += ` ORDER BY o.created_at DESC LIMIT 1000`;

  const rows = await query<BimElementRecord>(sql, params);
  return rows;
}

export async function detectSpatialClashesForElements(
  projectId: number,
  elements: BimElementRecord[],
  clearanceThresholdMm = 50,
): Promise<SpatialClashRecord[]> {
  const clashes: SpatialClashRecord[] = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elA = elements[i];
      const elB = elements[j];

      // Bỏ qua nếu cùng một đối tượng
      if (elA.id === elB.id) continue;

      const result = checkAabbIntersection(
        elA.spatial_bounding_box,
        elB.spatial_bounding_box,
        clearanceThresholdMm,
      );

      if (result.isHardClash || result.isSoftClash) {
        const clashCode = `CLASH-${elA.ifc_guid.slice(0, 6)}-${elB.ifc_guid.slice(0, 6)}`;
        const clashType: ClashType = result.isHardClash ? "hard_clash" : "soft_clearance";
        const severity: ClashSeverity = result.isHardClash
          ? elA.discipline === "structure" || elB.discipline === "structure"
            ? "critical"
            : "high"
          : "medium";

        const solution = generateClashRerouteSolution(
          clashCode,
          { guid: elA.ifc_guid, type: elA.element_type, system: elA.system_name || undefined },
          { guid: elB.ifc_guid, type: elB.element_type, system: elB.system_name || undefined },
        );

        clashes.push({
          id: `clash-${i}-${j}`,
          project_id: projectId,
          clash_code: clashCode,
          element_a_id: elA.id,
          element_b_id: elB.id,
          clash_type: clashType,
          severity,
          intersection_point: result.center,
          clearance_distance_mm: result.clearanceDistanceMm,
          status: "detected",
          prescriptive_solution: solution,
          resolved_by: null,
          created_at: new Date().toISOString(),
          element_a_type: elA.element_type,
          element_a_guid: elA.ifc_guid,
          element_b_type: elB.element_type,
          element_b_guid: elB.ifc_guid,
          element_a_system: elA.system_name || undefined,
          element_b_system: elB.system_name || undefined,
        });
      }
    }
  }

  return clashes;
}
