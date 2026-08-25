// lib/engineering-cad-skills.ts — Cognitive CAD Engine & Autonomous Drafting (M65 / M89)
// `engineering_cad_diff_sessions` và `engineering_cad_block_catalogs` (migration 0099) bật
// FORCE ROW LEVEL SECURITY với policy KHÔNG có nhánh "GUC rỗng thì cho qua" (khác 11 bảng của
// migrations/0069_rls.sql) — mọi truy vấn 2 bảng này ở dưới BẮT BUỘC bọc `withProjectScope`
// (đúng khuôn `lib/ky-thuat/cad/boq-map.ts`), nếu không role `xboss_app` (NOBYPASSRLS trên
// production) sẽ đọc rỗng/ghi thất bại âm thầm dù DB có dữ liệu — KHÔNG được gỡ ra.
import { query, queryOne, withProjectScope } from "@/lib/db";

export type CadEntityType =
  "line" | "polyline" | "circle" | "arc" | "text" | "insert_block" | "dimension";

export type CadDiffStatus = "added" | "removed" | "modified" | "unchanged";

export interface CadEntity {
  id: string;
  type: CadEntityType;
  layer: string;
  color?: string | number;
  coordinates: {
    start?: [number, number, number];
    end?: [number, number, number];
    points?: Array<[number, number, number]>;
    center?: [number, number, number];
    radius?: number;
  };
  textValue?: string;
  blockName?: string;
  attributes?: Record<string, string>;
}

export interface CadDiffItem {
  entityId: string;
  type: CadEntityType;
  layer: string;
  diffStatus: CadDiffStatus;
  changeDescription: string;
  location: [number, number, number];
}

export interface CadDiffResult {
  totalBase: number;
  totalCompare: number;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  differences: CadDiffItem[];
  potentialVoImpact: {
    estimatedCostVnd: number;
    riskLevel: "low" | "medium" | "high";
    reason: string;
  };
}

export interface CadBlockCatalogRecord {
  id: string;
  project_id: number;
  block_name: string;
  discipline: string;
  category: string;
  attribute_schema: Record<string, unknown>;
  mapped_boq_code: string | null;
  mapped_material_id: number | null;
  created_at: string;
}

// ============================================================================
// 1. THUẬT TOÁN SO SÁNH PHIÊN BẢN BẢN VẼ (VISUAL CAD VECTOR DIFFING)
// ============================================================================

export function computeCadVectorDiff(
  baseEntities: CadEntity[],
  compareEntities: CadEntity[],
  toleranceMm = 5,
): CadDiffResult {
  const differences: CadDiffItem[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;
  let estimatedVoVnd = 0;

  const matchedBaseIds = new Set<string>();

  for (const cmp of compareEntities) {
    const match = baseEntities.find((base) => {
      if (base.id === cmp.id) return true;
      if (base.type === cmp.type && base.layer === cmp.layer) {
        if (base.coordinates.center && cmp.coordinates.center) {
          const dist = Math.hypot(
            base.coordinates.center[0] - cmp.coordinates.center[0],
            base.coordinates.center[1] - cmp.coordinates.center[1],
          );
          return dist <= toleranceMm;
        }
        if (base.coordinates.start && cmp.coordinates.start) {
          const dist = Math.hypot(
            base.coordinates.start[0] - cmp.coordinates.start[0],
            base.coordinates.start[1] - cmp.coordinates.start[1],
          );
          return dist <= toleranceMm;
        }
      }
      return false;
    });

    const loc: [number, number, number] = cmp.coordinates.center ||
      cmp.coordinates.start ||
      (cmp.coordinates.points && cmp.coordinates.points[0]) || [0, 0, 0];

    if (!match) {
      addedCount++;
      const cost =
        cmp.type === "insert_block"
          ? 2500000
          : cmp.layer.toLowerCase().includes("duct")
            ? 1200000
            : 600000;
      estimatedVoVnd += cost;

      differences.push({
        entityId: cmp.id,
        type: cmp.type,
        layer: cmp.layer,
        diffStatus: "added",
        changeDescription: `Bổ sung mới phần tử ${cmp.blockName || cmp.type} trên layer ${cmp.layer}`,
        location: loc,
      });
    } else {
      matchedBaseIds.add(match.id);
      const isTextModified = baseTextOf(match) !== baseTextOf(cmp);
      const isLayerModified = match.layer !== cmp.layer;

      if (isTextModified || isLayerModified) {
        modifiedCount++;
        estimatedVoVnd += 400000;
        differences.push({
          entityId: cmp.id,
          type: cmp.type,
          layer: cmp.layer,
          diffStatus: "modified",
          changeDescription: isTextModified
            ? `Thay đổi ghi chú kỹ thuật từ "${baseTextOf(match)}" thành "${baseTextOf(cmp)}"`
            : `Đổi layer từ "${match.layer}" sang "${cmp.layer}"`,
          location: loc,
        });
      } else {
        unchangedCount++;
      }
    }
  }

  for (const base of baseEntities) {
    if (!matchedBaseIds.has(base.id)) {
      removedCount++;
      const loc: [number, number, number] = base.coordinates.center ||
        base.coordinates.start ||
        (base.coordinates.points && base.coordinates.points[0]) || [0, 0, 0];

      differences.push({
        entityId: base.id,
        type: base.type,
        layer: base.layer,
        diffStatus: "removed",
        changeDescription: `Xóa bỏ phần tử ${base.blockName || base.type} trên layer ${base.layer}`,
        location: loc,
      });
    }
  }

  const riskLevel =
    estimatedVoVnd > 50000000 ? "high" : estimatedVoVnd > 10000000 ? "medium" : "low";

  return {
    totalBase: baseEntities.length,
    totalCompare: compareEntities.length,
    summary: {
      added: addedCount,
      removed: removedCount,
      modified: modifiedCount,
      unchanged: unchangedCount,
    },
    differences,
    potentialVoImpact: {
      estimatedCostVnd: estimatedVoVnd,
      riskLevel,
      reason: `Phát hiện ${addedCount} đối tượng thêm mới và ${modifiedCount} đối tượng điều chỉnh thiết kế có nguy cơ phát sinh chi phí.`,
    },
  };
}

function baseTextOf(e: CadEntity): string {
  return e.textValue || (e.attributes ? JSON.stringify(e.attributes) : "");
}
// ============================================================================
// 3-4. FONT TIẾNG VIỆT & CHUẨN HÓA LAYER — nguồn chuẩn: lib/cad/dxf-parser.ts
// ============================================================================

// Hai hàm này từng được định nghĩa trùng lặp ở cả đây lẫn `lib/cad/dxf-parser.ts`;
// bản trong dxf-parser đầy đủ hơn (phân biệt gió cấp/hồi/thải, nước lạnh/cấp/thoát,
// điện động lực/chiếu sáng, ELV, kết cấu) nên được chọn làm nguồn duy nhất.
// Re-export đúng tên cũ để mọi nơi đang import từ "@/lib/ky-thuat/engineering-cad-skills"
// không phải sửa gì.
export { convertTcvn3ToUnicode, normalizeCadLayers } from "@/lib/ky-thuat/cad/dxf-parser";

// ============================================================================
// 5. 2D-TO-3D SPATIAL EXTRUSION ENGINE
// ============================================================================

export function extrude2dPolylineTo3d(polyline: {
  points: Array<[number, number]>;
  topElevationMm: number;
  bopElevationMm: number;
  widthMm: number;
}): { min: [number, number, number]; max: [number, number, number] } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of polyline.points) {
    minX = Math.min(minX, pt[0]);
    maxX = Math.max(maxX, pt[0]);
    minY = Math.min(minY, pt[1]);
    maxY = Math.max(maxY, pt[1]);
  }

  const halfW = polyline.widthMm / 2;
  return {
    min: [Math.round(minX - halfW), Math.round(minY - halfW), Math.round(polyline.bopElevationMm)],
    max: [Math.round(maxX + halfW), Math.round(maxY + halfW), Math.round(polyline.topElevationMm)],
  };
}

// ============================================================================
// 6. DATABASE CRUD OPERATIONS
// ============================================================================

export async function saveCadDiffSession(
  projectId: number,
  baseDrawingId: number | null,
  compareDrawingId: number | null,
  result: CadDiffResult,
  userId?: number | null,
): Promise<{ id: string }> {
  // readOnly: false — đây là đường GHI; withProjectScope mặc định mở transaction READ ONLY.
  const row = await withProjectScope(
    projectId,
    () =>
      queryOne<{ id: string }>(
        `INSERT INTO engineering_cad_diff_sessions (
      project_id, base_drawing_id, compare_drawing_id,
      total_entities_base, total_entities_compare,
      diff_summary, diff_details, potential_vo_impact,
      created_by
    ) VALUES (
      ?, ?, ?,
      ?, ?,
      ?::jsonb, ?::jsonb, ?::jsonb,
      ?
    ) RETURNING id`,

        projectId,
        baseDrawingId,
        compareDrawingId,
        result.totalBase,
        result.totalCompare,
        JSON.stringify(result.summary),
        JSON.stringify(result.differences),
        JSON.stringify(result.potentialVoImpact),
        userId ?? null,
      ),
    { readOnly: false },
  );

  if (!row) throw new Error("Failed to save CAD Diff session");
  return row;
}

export async function listCadDiffSessions(projectId: number) {
  return await withProjectScope(projectId, () =>
    query(
      `SELECT * FROM engineering_cad_diff_sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
      projectId,
    ),
  );
}

export async function listCadBlockCatalogs(projectId: number) {
  return await withProjectScope(projectId, () =>
    query<CadBlockCatalogRecord>(
      `SELECT * FROM engineering_cad_block_catalogs WHERE project_id = ? ORDER BY block_name ASC`,
      projectId,
    ),
  );
}
