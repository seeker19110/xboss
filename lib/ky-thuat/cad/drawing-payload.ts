/**
 * Hợp đồng dữ liệu bản vẽ (drawing payload) — cầu nối giữa app (TypeScript)
 * và worker Python (`export_dxf_r2000` dùng ezdxf) theo M98 PR2.
 *
 * Payload là JSON thuần, dựng từ kết quả parse DXF sẵn có nên app không phải
 * đổi mô hình dữ liệu (FR1).
 */
import type { DxfLayerInfo, DxfEntityRaw, DxfParseResult } from "@/lib/ky-thuat/cad/dxf-parser";

export const DRAWING_PAYLOAD_VERSION = 1 as const;

export interface DrawingPayloadV1 {
  version: 1;
  title: string;
  units: "mm";
  layers: DxfLayerInfo[];
  entities: DxfEntityRaw[];
}

/** Các loại thực thể hợp lệ — bám đúng union `DxfEntityRaw["type"]`. */
const ENTITY_TYPES: ReadonlyArray<DxfEntityRaw["type"]> = [
  "LINE",
  "LWPOLYLINE",
  "POLYLINE",
  "CIRCLE",
  "ARC",
  "TEXT",
  "MTEXT",
  "INSERT",
  "DIMENSION",
  "SPLINE",
  "ELLIPSE",
  "SOLID",
  "3DFACE",
  "HATCH",
  "LEADER",
  "MULTILEADER",
];

/** Chuyển kết quả parse (hoặc dữ liệu bản vẽ đang chỉnh trong UI) thành hợp đồng wire gửi cho worker. */
export function buildDrawingPayload(result: DxfParseResult, title: string): DrawingPayloadV1 {
  return {
    version: DRAWING_PAYLOAD_VERSION,
    title,
    units: "mm",
    layers: result.layers ?? [],
    entities: result.entities ?? [],
  };
}

/** Kiểm hợp lệ tối thiểu trước khi gửi worker — không kiểm hình học sâu (worker/ezdxf lo phần đó). */
export function validateDrawingPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload phải là một đối tượng JSON."] };
  }
  const p = payload as Record<string, unknown>;

  if (p.version !== 1) {
    errors.push("Phiên bản hợp đồng không hợp lệ: chỉ chấp nhận version = 1.");
  }
  if (typeof p.title !== "string" || p.title.trim() === "") {
    errors.push("Thiếu tên bản vẽ (title) hoặc tên rỗng.");
  }
  if (p.units !== "mm") {
    errors.push('Đơn vị bản vẽ không hợp lệ: chỉ chấp nhận units = "mm".');
  }

  if (!Array.isArray(p.layers)) {
    errors.push("Trường layers phải là một mảng.");
  } else {
    p.layers.forEach((layer, i) => {
      if (typeof layer !== "object" || layer === null || Array.isArray(layer)) {
        errors.push(`Layer thứ ${i + 1}: phải là một đối tượng.`);
        return;
      }
      const name = (layer as Record<string, unknown>).name;
      if (typeof name !== "string" || name.trim() === "") {
        errors.push(`Layer thứ ${i + 1}: thiếu tên layer (name) hoặc tên rỗng.`);
      }
    });
  }

  if (!Array.isArray(p.entities)) {
    errors.push("Trường entities phải là một mảng.");
  } else {
    p.entities.forEach((entity, i) => {
      if (typeof entity !== "object" || entity === null || Array.isArray(entity)) {
        errors.push(`Thực thể thứ ${i + 1}: phải là một đối tượng.`);
        return;
      }
      const e = entity as Record<string, unknown>;
      if (typeof e.type !== "string" || !ENTITY_TYPES.includes(e.type as DxfEntityRaw["type"])) {
        errors.push(`Thực thể thứ ${i + 1}: loại thực thể (type) không hợp lệ.`);
      }
      if (typeof e.layer !== "string") {
        errors.push(`Thực thể thứ ${i + 1}: trường layer phải là chuỗi.`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
