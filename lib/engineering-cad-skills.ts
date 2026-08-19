// lib/engineering-cad-skills.ts — Cognitive CAD Engine & Autonomous Drafting (M65)
import { query, queryOne } from "@/lib/db";

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

export interface CadLispTemplateRecord {
  id: string;
  template_code: string;
  title: string;
  detail_category: string;
  lisp_code_template: string;
  parameter_schema: Record<string, unknown>;
  is_active: boolean;
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
    // Tìm thực thể tương ứng trong base theo ID hoặc vị trí không gian
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
      // Thực thể mới được thêm vào (Added)
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
      // Kiểm tra có bị sửa đổi thuộc tính hay text ghi chú không
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

  // Các thực thể trong base không tìm thấy trong compare -> Bị xóa (Removed)
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
// 2. BỘ SINH MÃ AUTOLISP & AUTOCAD SCRIPT (AUTONOMOUS DRAFTING)
// ============================================================================

export function generateAutoLispDetailScript(
  templateType: "hanger" | "sleeve" | "duct_transition",
  params: {
    widthMm?: number;
    heightMm?: number;
    diameterMm?: number;
    rodDiameterMm?: number;
    layerName?: string;
    tagLabel?: string;
  },
): string {
  const layer = params.layerName || "M-DETAIL-SHOP";
  const tag = params.tagLabel || "TYP-DETAIL";

  if (templateType === "hanger") {
    const w = params.widthMm || 600;
    const h = params.heightMm || 400;
    const rod = params.rodDiameterMm || 10;

    return `;; =====================================================================
;; AutoLISP Generator — XBoss Engineering CAD Engine
;; Chi tiết: Giá đỡ ty treo chữ U (Trapeze Hanger Detail)
;; Kích thước: ${w}x${h}mm | Ty giằng: D${rod}mm
;; =====================================================================
(defun c:DRAW_TRAPEZE_HANGER ( / pt p1 p2 p3 p4 oldLayer oldOsm)
  (setq oldLayer (getvar "CLAYER"))
  (setq oldOsm (getvar "OSMODE"))
  (setvar "CMDECHO" 0)
  (setvar "OSMODE" 0)

  ;; Tao layer neu chua co
  (if (not (tblsearch "LAYER" "${layer}"))
    (command "_.LAYER" "_M" "${layer}" "_C" "4" "${layer}" "")
  )
  (setvar "CLAYER" "${layer}")

  (setq pt (getpoint "\\nChon diem tam tran treo: "))
  (if pt
    (progn
      (setq p1 (list (- (car pt) ${w / 2}) (cadr pt)))
      (setq p2 (list (- (car pt) ${w / 2}) (- (cadr pt) ${h})))
      (setq p3 (list (+ (car pt) ${w / 2}) (- (cadr pt) ${h})))
      (setq p4 (list (+ (car pt) ${w / 2}) (cadr pt)))

      ;; Ve 2 thanh ty ren doc
      (command "_.LINE" p1 p2 "")
      (command "_.LINE" p4 p3 "")
      ;; Ve thanh xa ngang Unistrut
      (command "_.LINE" (list (- (car p2) 50) (cadr p2)) (list (+ (car p3) 50) (cadr p3)) "")
      ;; Ghi chu
      (command "_.TEXT" "_J" "_MC" (list (car pt) (- (cadr pt) ${h + 80})) 50 0 "TY TREO U ${w}x${h} - TY D${rod}")
      (princ "\\n[XBoss] Ve gia do ty treo thanh cong.")
    )
  )
  (setvar "CLAYER" oldLayer)
  (setvar "OSMODE" oldOsm)
  (setvar "CMDECHO" 1)
  (princ)
)
(princ "\\nLenh ve gia do: DRAW_TRAPEZE_HANGER")
(princ)`;
  }

  if (templateType === "sleeve") {
    const d = params.diameterMm || 150;
    return `;; =====================================================================
;; AutoLISP Generator — XBoss Engineering CAD Engine
;; Chi tiết: Lỗ mở sleeve xuyên sàn/dầm (Sleeve Opening Detail)
;; Đường kính: D${d}mm | Nhãn: ${tag}
;; =====================================================================
(defun c:DRAW_SLEEVE_OPENING ( / pt oldLayer oldOsm)
  (setq oldLayer (getvar "CLAYER"))
  (setq oldOsm (getvar "OSMODE"))
  (setvar "CMDECHO" 0)
  (setvar "OSMODE" 0)

  (if (not (tblsearch "LAYER" "${layer}"))
    (command "_.LAYER" "_M" "${layer}" "_C" "1" "${layer}" "")
  )
  (setvar "CLAYER" "${layer}")

  (setq pt (getpoint "\\nChon toa do tim lo mo sleeve: "))
  (if pt
    (progn
      (command "_.CIRCLE" pt ${d / 2})
      (command "_.TEXT" "_J" "_MC" pt 60 0 "${tag} (D${d})")
      (princ "\\n[XBoss] Dat sleeve thanh cong.")
    )
  )
  (setvar "CLAYER" oldLayer)
  (setvar "OSMODE" oldOsm)
  (setvar "CMDECHO" 1)
  (princ)
)
(princ "\\nLenh ve sleeve: DRAW_SLEEVE_OPENING")
(princ)`;
  }

  return `;; Default script\n(princ "\\n[XBoss CAD Script]")`;
}

// ============================================================================
// 3. BỘ SỬA LỖI FONT TIẾNG VIỆT (CAD FONT DOCTOR: VNI / TCVN3 -> UNICODE)
// ============================================================================

const TCVN3_MAP: Record<string, string> = {
  "¸": "á",
  µ: "à",
  "¶": "ả",
  "·": "ã",
  "¹": "ạ",
  "¨": "ă",
  "¾": "ắ",
  "»": "ằ",
  "¼": "ẳ",
  "½": "ẵ",
  Æ: "ặ",
  "©": "â",
  Ê: "ấ",
  Ç: "ầ",
  È: "ẩ",
  É: "ẫ",
  Ë: "ậ",
  Ð: "đ",
  "®": "đ",
  Ì: "í",
  Í: "ì",
  Î: "ỉ",
  Ï: "ĩ",
  Ñ: "ị",
  Õ: "ế",
  Ò: "ề",
  Ó: "ể",
  Ö: "ệ",
  Ô: "ễ",
  ã: "ó",
  ß: "ò",
  á: "ỏ",
  â: "õ",
  ä: "ọ",
  "«": "ô",
  è: "ố",
  å: "ồ",
  æ: "ổ",
  ç: "ỗ",
  é: "ộ",
  "¬": "ơ",
  í: "ớ",
  ì: "ờ",
  î: "ở",
  ï: "ỡ",
  ñ: "ợ",
  ó: "ú",
  ò: "ù",
  ỏ: "ủ",
  õ: "ũ",
  ô: "ụ",
  "­": "ư",
  ø: "ứ",
  ö: "ừ",
  "÷": "ử",
  ù: "ữ",
  ú: "ự",
  Ý: "ý",
  ỳ: "ỳ",
  ỷ: "ỷ",
  ỹ: "ỹ",
  ỵ: "ỵ",
};

export function convertTcvn3ToUnicode(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    result += TCVN3_MAP[ch] || ch;
  }
  return result;
}

// ============================================================================
// 4. CHUẨN HÓA LAYER THEO TIÊU CHUẨN AIA / QUY CHUẨN MEPF
// ============================================================================

export function normalizeCadLayers(layers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const layer of layers) {
    const l = layer.toUpperCase();
    if (l.includes("DUCT") || l.includes("GIO") || l.includes("SA") || l.includes("RA")) {
      mapping[layer] = "M-DUCT-SUPP";
    } else if (l.includes("PIPE") || l.includes("NUOC") || l.includes("SAN")) {
      mapping[layer] = "P-PIPE-SANR";
    } else if (l.includes("ELEC") || l.includes("TRAY") || l.includes("DIEN")) {
      mapping[layer] = "E-TRAY-PWRR";
    } else if (l.includes("FIRE") || l.includes("PCCC") || l.includes("SPK")) {
      mapping[layer] = "F-SPRN-PIPE";
    } else if (l.includes("TEXT") || l.includes("DIM") || l.includes("GHI")) {
      mapping[layer] = "G-ANNO-TEXT";
    } else {
      mapping[layer] = layer; // Giữ nguyên nếu không khớp
    }
  }

  return mapping;
}

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

  // Mở rộng bán kính tiết diện theo width
  const halfW = polyline.widthMm / 2;
  return {
    min: [Math.round(minX - halfW), Math.round(minY - halfW), Math.round(polyline.bopElevationMm)],
    max: [Math.round(maxX + halfW), Math.round(maxY + halfW), Math.round(polyline.topElevationMm)],
  };
}

// ============================================================================
// 6. DATABASE CRUD OPERATIONS
// ============================================================================

export async function listCadDiffSessions(projectId: number) {
  return await query(
    `SELECT * FROM engineering_cad_diff_sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}

export async function listCadBlockCatalogs(projectId: number) {
  return await query<CadBlockCatalogRecord>(
    `SELECT * FROM engineering_cad_block_catalogs WHERE project_id = ? ORDER BY block_name ASC`,
    [projectId],
  );
}

export async function listCadLispTemplates() {
  return await query<CadLispTemplateRecord>(
    `SELECT * FROM engineering_cad_lisp_templates WHERE is_active = true ORDER BY template_code ASC`,
  );
}
