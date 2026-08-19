import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";

export type AnnotationType =
  "progress_pin" | "ncr_issue" | "bbnt_request" | "rfi_markup" | "general_note";

export type AnnotationSeverity = "low" | "normal" | "medium" | "high" | "critical";
export type AnnotationStatus = "open" | "in_progress" | "resolved" | "closed" | "cancelled";

export interface SpatialPoint {
  x: number;
  y: number;
  z?: number;
}

export interface SpatialAnnotationRecord {
  id: string;
  projectId: number;
  drawingCode: string;
  floorId: string | null;
  annotType: AnnotationType;
  coordX: number;
  coordY: number;
  coordZ: number;
  geomPayload: Record<string, unknown>;
  entityRefType: string | null;
  entityRefId: string | null;
  title: string;
  description: string | null;
  severity: AnnotationSeverity;
  status: AnnotationStatus;
  metadata: Record<string, unknown>;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnotationParams {
  projectId: number;
  drawingCode: string;
  floorId?: string;
  annotType: AnnotationType;
  coordX: number;
  coordY: number;
  coordZ?: number;
  geomPayload?: Record<string, unknown>;
  entityRefType?: string;
  entityRefId?: string;
  title: string;
  description?: string;
  severity?: AnnotationSeverity;
  metadata?: Record<string, unknown>;
  createdBy?: number;
}

/**
 * Tạo mới một điểm ghim hoặc markup không gian trên bản vẽ
 */
export async function createSpatialAnnotation(
  params: CreateAnnotationParams,
): Promise<SpatialAnnotationRecord> {
  const {
    projectId,
    drawingCode,
    floorId = null,
    annotType,
    coordX,
    coordY,
    coordZ = 0,
    geomPayload = {},
    entityRefType = null,
    entityRefId = null,
    title,
    description = null,
    severity = "normal",
    metadata = {},
    createdBy = null,
  } = params;

  return withProjectScope(projectId, async () => {
    const rows = await query<any>(
      `INSERT INTO engineering_spatial_annotations
         (project_id, drawing_code, floor_id, annot_type, coord_x, coord_y, coord_z,
          geom_payload, entity_ref_type, entity_ref_id, title, description, severity,
          status, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, 'open', ?::jsonb, ?)
       RETURNING id, project_id AS "projectId", drawing_code AS "drawingCode", floor_id AS "floorId",
                 annot_type AS "annotType", coord_x::float AS "coordX", coord_y::float AS "coordY",
                 coord_z::float AS "coordZ", geom_payload AS "geomPayload", entity_ref_type AS "entityRefType",
                 entity_ref_id AS "entityRefId", title, description, severity, status, metadata,
                 created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
      projectId,
      drawingCode,
      floorId,
      annotType,
      coordX,
      coordY,
      coordZ,
      JSON.stringify(geomPayload),
      entityRefType,
      entityRefId,
      title,
      description,
      severity,
      JSON.stringify(metadata),
      createdBy,
    );

    return rows[0] as SpatialAnnotationRecord;
  });
}

/**
 * Lấy danh sách annotation theo bản vẽ hoặc tầng
 */
export async function listSpatialAnnotations(
  projectId: number,
  opts?: {
    drawingCode?: string;
    floorId?: string;
    annotType?: AnnotationType;
    status?: AnnotationStatus;
    limit?: number;
  },
): Promise<SpatialAnnotationRecord[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

  return withProjectScope(projectId, async () => {
    const conds = ["project_id = ?"];
    const params: unknown[] = [projectId];

    if (opts?.drawingCode) {
      conds.push("drawing_code = ?");
      params.push(opts.drawingCode);
    }
    if (opts?.floorId) {
      conds.push("floor_id = ?");
      params.push(opts.floorId);
    }
    if (opts?.annotType) {
      conds.push("annot_type = ?");
      params.push(opts.annotType);
    }
    if (opts?.status) {
      conds.push("status = ?");
      params.push(opts.status);
    }

    params.push(limit);

    return query<SpatialAnnotationRecord>(
      `SELECT id, project_id AS "projectId", drawing_code AS "drawingCode", floor_id AS "floorId",
              annot_type AS "annotType", coord_x::float AS "coordX", coord_y::float AS "coordY",
              coord_z::float AS "coordZ", geom_payload AS "geomPayload", entity_ref_type AS "entityRefType",
              entity_ref_id AS "entityRefId", title, description, severity, status, metadata,
              created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM engineering_spatial_annotations
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`,
      ...params,
    );
  });
}

/**
 * Cập nhật trạng thái của một điểm ghim / markup
 */
export async function updateAnnotationStatus(
  projectId: number,
  annotationId: string,
  status: AnnotationStatus,
  resolutionNote?: string,
): Promise<boolean> {
  return withProjectScope(projectId, async () => {
    return withTransaction(async () => {
      const existing = await queryOne<{ id: string; metadata: Record<string, unknown> }>(
        `SELECT id, metadata FROM engineering_spatial_annotations WHERE id = ? AND project_id = ?`,
        annotationId,
        projectId,
      );
      if (!existing) return false;

      const newMetadata = {
        ...(existing.metadata || {}),
        resolvedAt: status === "resolved" || status === "closed" ? new Date().toISOString() : null,
        resolutionNote: resolutionNote || null,
      };

      await query(
        `UPDATE engineering_spatial_annotations
         SET status = ?, metadata = ?::jsonb, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        status,
        JSON.stringify(newMetadata),
        annotationId,
      );

      return true;
    });
  });
}

/**
 * Liên kết một điểm ghim với Thực thể Nghiệp vụ (WBS Task, NCR, BBNT)
 */
export async function linkAnnotationToEntity(
  projectId: number,
  annotationId: string,
  entityRefType: string,
  entityRefId: string,
): Promise<boolean> {
  return withProjectScope(projectId, async () => {
    const res = await query(
      `UPDATE engineering_spatial_annotations
       SET entity_ref_type = ?, entity_ref_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ?
       RETURNING id`,
      entityRefType,
      entityRefId,
      annotationId,
      projectId,
    );
    return res.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Spatial Computation & Geometry Utilities for WebGL / 2D Canvas
// ---------------------------------------------------------------------------

/**
 * Tính toán hộp bao (AABB Bounding Box) từ tập hợp các điểm tọa độ
 */
export function computeBoundingBoxFromPoints(points: SpatialPoint[]): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
} {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, width: 0, height: 0, depth: 0 };
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    const z = pt.z ?? 0;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}

/**
 * Thuật toán Ray-Casting kiểm tra một điểm tọa độ (X, Y) có nằm trong đa giác Polyline hay không
 */
export function isPointInPolygon(point: SpatialPoint, polygon: SpatialPoint[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const { x, y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Tính tổng chiều dài tuyến ống / tuyến cáp từ danh sách các điểm định vị
 */
export function calculatePolylineLength(points: SpatialPoint[]): number {
  if (!points || points.length < 2) return 0;

  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = (p2.z ?? 0) - (p1.z ?? 0);
    totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return Number(totalLength.toFixed(3));
}

/**
 * Tóm tắt chỉ số điểm ghim theo trạng thái và mức độ nghiêm trọng
 */
export function generateSpatialPinSummary(annotations: SpatialAnnotationRecord[]): {
  total: number;
  openIssues: number;
  resolvedIssues: number;
  criticalIssues: number;
  progressPins: number;
  bbntRequests: number;
} {
  let openIssues = 0;
  let resolvedIssues = 0;
  let criticalIssues = 0;
  let progressPins = 0;
  let bbntRequests = 0;

  for (const a of annotations) {
    if (a.status === "open" || a.status === "in_progress") {
      openIssues++;
    }
    if (a.status === "resolved" || a.status === "closed") {
      resolvedIssues++;
    }
    if (a.severity === "critical" || a.severity === "high") {
      criticalIssues++;
    }
    if (a.annotType === "progress_pin") {
      progressPins++;
    }
    if (a.annotType === "bbnt_request") {
      bbntRequests++;
    }
  }

  return {
    total: annotations.length,
    openIssues,
    resolvedIssues,
    criticalIssues,
    progressPins,
    bbntRequests,
  };
}
