// lib/cad/dxf-parser.ts — Pure TypeScript DXF Parser & 2D-to-3D Spatial Extrusion Engine
/**
 * @file High-performance, lightweight ASCII DXF Parser and 3D Extrusion Engine.
 * Supports:
 * - Parsing AutoCAD DXF sections: HEADER, TABLES (LAYER), BLOCKS, ENTITIES.
 * - Supported entities: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT, MTEXT, INSERT.
 * - Legacy Vietnamese Font & CAD code decoding (TCVN3, VNI, %%c -> Ø, %%p -> ±, %%d -> °).
 * - Layer classification according to AIA/BS1192 standard for MEPF.
 * - 2D-to-3D Spatial Route generation with Multi-Tier Corridor allocation.
 * - Standardized DXF exporter & AutoCAD .SCR script generation.
 */

// Complete Vietnamese TCVN3 / ABC to Unicode character mapping (Upper & Lowercase)
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
  "¡": "Ă",
  "¢": "Â",
  "£": "Ê",
  "¤": "Ô",
  "¥": "Ơ",
  "¦": "Ư",
  "§": "Đ",
};

// Complete VNI-Times / VNI-Helve dual-character tone and mark mapping
const VNI_PAIRS: Array<[RegExp, string]> = [
  // Vowels with tone 1 (sắc / acute)
  [/a1/g, "á"],
  [/A1/g, "Á"],
  [/e1/g, "é"],
  [/E1/g, "É"],
  [/i1/g, "í"],
  [/I1/g, "Í"],
  [/o1/g, "ó"],
  [/O1/g, "Ó"],
  [/u1/g, "ú"],
  [/U1/g, "Ú"],
  [/y1/g, "ý"],
  [/Y1/g, "Ý"],

  // Vowels with tone 2 (huyền / grave)
  [/a2/g, "à"],
  [/A2/g, "À"],
  [/e2/g, "è"],
  [/E2/g, "È"],
  [/i2/g, "ì"],
  [/I2/g, "Ì"],
  [/o2/g, "ò"],
  [/O2/g, "Ò"],
  [/u2/g, "ù"],
  [/U2/g, "Ù"],
  [/y2/g, "ỳ"],
  [/Y2/g, "Ỳ"],

  // Vowels with tone 3 (hỏi / hook)
  [/a3/g, "ả"],
  [/A3/g, "Ả"],
  [/e3/g, "ẻ"],
  [/E3/g, "Ẻ"],
  [/i3/g, "ỉ"],
  [/I3/g, "Ỉ"],
  [/o3/g, "ỏ"],
  [/O3/g, "Ỏ"],
  [/u3/g, "ủ"],
  [/U3/g, "Ủ"],
  [/y3/g, "ỷ"],
  [/Y3/g, "Ỷ"],

  // Vowels with tone 4 (ngã / tilde)
  [/a4/g, "ã"],
  [/A4/g, "Ã"],
  [/e4/g, "ẽ"],
  [/E4/g, "Ẽ"],
  [/i4/g, "ĩ"],
  [/I4/g, "Ĩ"],
  [/o4/g, "õ"],
  [/O4/g, "Õ"],
  [/u4/g, "ũ"],
  [/U4/g, "Ũ"],
  [/y4/g, "ỹ"],
  [/Y4/g, "Ỹ"],

  // Vowels with tone 5 (nặng / dot below)
  [/a5/g, "ạ"],
  [/A5/g, "Ạ"],
  [/e5/g, "ẹ"],
  [/E5/g, "Ẹ"],
  [/i5/g, "ị"],
  [/I5/g, "Ị"],
  [/o5/g, "ọ"],
  [/O5/g, "Ọ"],
  [/u5/g, "ụ"],
  [/U5/g, "Ụ"],
  [/y5/g, "ỵ"],
  [/Y5/g, "Ỵ"],

  // Circumflex vowels (â, ê, ô)
  [/a61/g, "ấ"],
  [/A61/g, "Ấ"],
  [/a62/g, "ầ"],
  [/A62/g, "Ầ"],
  [/a63/g, "ẩ"],
  [/A63/g, "Ẩ"],
  [/a64/g, "ẫ"],
  [/A64/g, "Ẫ"],
  [/a65/g, "ậ"],
  [/A65/g, "Ậ"],
  [/a6/g, "â"],
  [/A6/g, "Â"],

  [/e61/g, "ế"],
  [/E61/g, "Ế"],
  [/e62/g, "ề"],
  [/E62/g, "Ề"],
  [/e63/g, "ể"],
  [/E63/g, "Ể"],
  [/e64/g, "ễ"],
  [/E64/g, "Ễ"],
  [/e65/g, "ệ"],
  [/E65/g, "Ệ"],
  [/e6/g, "ê"],
  [/E6/g, "Ê"],

  [/o61/g, "ố"],
  [/O61/g, "Ố"],
  [/o62/g, "ồ"],
  [/O62/g, "Ồ"],
  [/o63/g, "ổ"],
  [/O63/g, "Ổ"],
  [/o64/g, "ỗ"],
  [/O64/g, "Ỗ"],
  [/o65/g, "ộ"],
  [/O65/g, "Ộ"],
  [/o6/g, "ô"],
  [/O6/g, "Ô"],

  // Breve vowel (ă)
  [/a81/g, "ắ"],
  [/A81/g, "Ắ"],
  [/a82/g, "ằ"],
  [/A82/g, "Ằ"],
  [/a83/g, "ẳ"],
  [/A83/g, "Ẳ"],
  [/a84/g, "ẵ"],
  [/A84/g, "Ẵ"],
  [/a85/g, "ặ"],
  [/A85/g, "Ặ"],
  [/a8/g, "ă"],
  [/A8/g, "Ă"],

  // Horn vowels (ơ, ư)
  [/o71/g, "ớ"],
  [/O71/g, "Ớ"],
  [/o72/g, "ờ"],
  [/O72/g, "Ờ"],
  [/o73/g, "ở"],
  [/O73/g, "Ở"],
  [/o74/g, "ỡ"],
  [/O74/g, "Ỡ"],
  [/o75/g, "ợ"],
  [/O75/g, "Ợ"],
  [/o7/g, "ơ"],
  [/O7/g, "Ơ"],

  [/u71/g, "ứ"],
  [/U71/g, "Ứ"],
  [/u72/g, "ừ"],
  [/U72/g, "Ừ"],
  [/u73/g, "ử"],
  [/U73/g, "Ử"],
  [/u74/g, "ữ"],
  [/U74/g, "Ữ"],
  [/u75/g, "ự"],
  [/U75/g, "Ự"],
  [/u7/g, "ư"],
  [/U7/g, "Ư"],

  // Consonant đ / Đ
  [/d9/g, "đ"],
  [/D9/g, "Đ"],
];

/**
 * Ký tự "chữ ký" của bảng mã TCVN3/ABC: các vị trí U+00A1–U+00B9, U+00BE, U+00BF vốn là dấu thanh
 * và nguyên âm có dấu của TCVN3, gần như không xuất hiện trong văn bản Unicode bình thường.
 *
 * Dùng để quyết định CÓ giải mã TCVN3 hay không. Cần thiết vì bảng TCVN3 ánh xạ chồng lên cả các
 * chữ Latin-1 hợp lệ (vd `ó` → `ú`, `ã` → `ó`): giải mã một chuỗi đã là Unicode sẽ làm hỏng nó.
 * Không có chốt này thì chuỗi chuẩn hoá → xuất tệp → nạp lại sẽ bị giải mã lần hai và sai chữ.
 */
const TCVN3_SIGNATURE = /[\u00a1-\u00b9\u00be\u00bf]/;

/**
 * Chuyển đổi mã TCVN3 / ABC sang chuẩn Unicode UTF-8 hoàn chỉnh.
 */
export function convertTcvn3ToUnicode(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    result += TCVN3_MAP[ch] || ch;
  }
  return result;
}

/**
 * Chuyển đổi mã VNI sang chuẩn Unicode UTF-8 hoàn chỉnh.
 */
export function convertVniToUnicode(text: string): string {
  let result = text;
  for (const [pattern, replacement] of VNI_PAIRS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Ký tự cấu thành một "từ" trong tên layer CAD; mọi ký tự khác (`_`, `-`, khoảng trắng, dấu chấm…)
 *  đều được coi là ranh giới token. */
const LAYER_WORD_CHAR = /[A-Z0-9]/;

/**
 * Khớp từ khóa theo ranh giới token thay vì `includes()` thô: từ khóa phải đứng riêng (ở đầu/cuối
 * tên layer hoặc kẹp giữa ký tự phân tách). Tránh bắt nhầm chuỗi con nằm giữa một từ khác nghĩa —
 * vd `"OA"` (outside air) là chuỗi con của `"THOAT"` (ống thoát).
 * Tên layer truyền vào phải đã upper-case.
 */
function hasToken(l: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = l.indexOf(token, from);
    if (at < 0) return false;
    const before = at > 0 ? (l[at - 1] ?? "") : "";
    const after = l[at + token.length] ?? "";
    if (!LAYER_WORD_CHAR.test(before) && !LAYER_WORD_CHAR.test(after)) return true;
    from = at + 1;
  }
}

/** Đúng khi tên layer chứa ít nhất một trong các từ khóa (theo ranh giới token). */
function hasAnyToken(l: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => hasToken(l, token));
}

/**
 * Chuẩn hóa tên layer AutoCAD về chuẩn AIA / BS1192 / ISO 13567 cho 5 phân hệ MEPF.
 *
 * Thứ tự nhánh: gió → điện nặng → ELV → ống nước → PCCC → kết cấu → ghi chú. Điện/ELV phải kiểm
 * TRƯỚC ống nước vì `"CAP"` (ý định: nước cấp) cũng là một token hợp lệ trong `"MANG_CAP_DIEN"` /
 * `"MANG_CAP_ELV"`, nơi nó mang nghĩa "cáp" chứ không phải "cấp".
 */
export function normalizeCadLayers(layers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const layer of layers) {
    const l = layer.toUpperCase();
    if (hasAnyToken(l, ["DUCT", "GIO", "AHU", "FCU", "SA", "RA", "EA", "OA"])) {
      if (hasAnyToken(l, ["RETN", "HOI", "RA"])) {
        mapping[layer] = "M-DUCT-RETN";
      } else if (hasAnyToken(l, ["EXHAUST", "THAI", "EA"])) {
        mapping[layer] = "M-DUCT-EXHT";
      } else {
        mapping[layer] = "M-DUCT-SUPP";
      }
    } else if (hasAnyToken(l, ["ELEC", "TRAY", "DIEN", "PWR", "LTG"])) {
      if (hasAnyToken(l, ["LTG", "CHIEU", "SANG"])) {
        mapping[layer] = "E-LTNG-CKTS";
      } else {
        mapping[layer] = "E-TRAY-PWRR";
      }
    } else if (hasAnyToken(l, ["ELV", "TEL", "DATA", "LAN", "CCTV", "BMS"])) {
      mapping[layer] = "ELV-CABL-TRAY";
    } else if (hasAnyToken(l, ["PIPE", "NUOC", "SAN", "CAP", "THOAT", "CHILLER", "CW"])) {
      if (hasAnyToken(l, ["DRAIN", "THOAT", "SAN"])) {
        mapping[layer] = "P-PIPE-SANR";
      } else if (hasAnyToken(l, ["CHILL", "CHW", "LANH"])) {
        mapping[layer] = "M-CHW-PIPE";
      } else {
        mapping[layer] = "P-PIPE-DOMW";
      }
    } else if (hasAnyToken(l, ["FIRE", "PCCC", "SPK", "HYDRANT"])) {
      mapping[layer] = "F-SPRN-PIPE";
    } else if (hasAnyToken(l, ["GRID", "TRUC", "DAM", "COT", "BEAM", "COL"])) {
      mapping[layer] = "S-GRID-COLS";
    } else if (hasAnyToken(l, ["TEXT", "DIM", "GHI", "ANNO"])) {
      mapping[layer] = "G-ANNO-TEXT";
    } else {
      mapping[layer] = layer;
    }
  }

  return mapping;
}

export interface DxfLayerInfo {
  name: string;
  colorNumber: number;
  colorHex: string;
  lineType: string;
  isStandardized: boolean;
  standardName: string;
  discipline: "M" | "E" | "P" | "F" | "ELV" | "S" | "A" | "OTHER";
  entityCount: number;
  /** Layer bị đóng băng (cờ 70 bit 1) — thực thể vẫn còn nhưng không hiện, không in */
  isFrozen?: boolean;
  /** Layer đang tắt (mã 62 mang giá trị âm) */
  isOff?: boolean;
  /** Layer bị khoá (cờ 70 bit 4) — hiện nhưng không sửa được */
  isLocked?: boolean;
  /** Bề rộng nét theo mã 370 (đơn vị 1/100 mm; -3 = mặc định, -2 = theo khối, -1 = theo layer) */
  lineWeight?: number;
}

export interface DxfEntityRaw {
  id: string;
  type:
    | "LINE"
    | "LWPOLYLINE"
    | "POLYLINE"
    | "CIRCLE"
    | "ARC"
    | "TEXT"
    | "MTEXT"
    | "INSERT"
    | "DIMENSION"
    | "SPLINE"
    | "ELLIPSE"
    | "SOLID"
    | "3DFACE"
    | "HATCH"
    | "LEADER"
    | "MULTILEADER"
    | "POINT"
    | "ATTDEF"
    | "XLINE"
    | "RAY"
    | "MLINE"
    | "TRACE"
    | "WIPEOUT"
    | "IMAGE"
    | "SHAPE"
    | "TOLERANCE";
  layer: string;
  color?: number;
  coordinates: {
    start?: [number, number, number];
    end?: [number, number, number];
    points?: Array<[number, number, number]>;
    center?: [number, number, number];
    radius?: number;
    startAngle?: number; // độ, dùng cho ARC
    endAngle?: number; // độ, dùng cho ARC
    /** Độ cong từng đoạn polyline (mã 42) — 0 là đoạn thẳng */
    bulges?: number[];
    /** Cao độ mặt phẳng của LWPOLYLINE (mã 38) */
    elevation?: number;
    /** Polyline khép kín (cờ 70 bit 1) */
    closed?: boolean;
    /** Điểm canh chữ thứ hai của TEXT (mã 11/21/31) */
    alignPoint?: [number, number, number];
    /** Điểm đặt chữ kích thước của DIMENSION (mã 11/21/31) */
    textMidPoint?: [number, number, number];
    /** Hai đầu đo thật của DIMENSION (mã 13/23/33 và 14/24/34) */
    measurePoints?: [[number, number, number], [number, number, number]];
    /** Điểm cuối bán trục lớn của ELLIPSE (mã 11/21/31, tương đối so với tâm) */
    majorAxis?: [number, number, number];
    /** Tỷ lệ bán trục nhỏ / bán trục lớn của ELLIPSE (mã 40) */
    axisRatio?: number;
    /** Các đỉnh của SOLID / 3DFACE / TRACE (mã 10..13) */
    corners?: Array<[number, number, number]>;
    /** Vector hướng đơn vị của đường dựng hình XLINE / RAY (mã 11/21/31) */
    direction?: [number, number, number];
    /** Các đường bao vùng tô của HATCH (mã 91/92/93) */
    boundaryPaths?: Array<{
      points: Array<[number, number, number]>;
      bulges: number[];
      closed: boolean;
    }>;
  };
  textValue?: string;
  decodedText?: string;
  blockName?: string;
  attributes?: Record<string, string>;
  /** Kiểu đường nét riêng của thực thể (mã 6) — không có thì theo layer */
  lineType?: string;
  /** Chiều cao chữ TEXT/MTEXT (mã 40) */
  textHeight?: number;
  /** Hệ số bề rộng chữ TEXT (mã 41) */
  widthFactor?: number;
  /** Kiểu chữ (mã 7) */
  textStyle?: string;
  /** Góc xoay, đơn vị độ (mã 50) */
  rotation?: number;
  /** Tỷ lệ chèn khối INSERT theo X/Y/Z (mã 41/42/43) */
  scale?: [number, number, number];
  /** Số đo thật của DIMENSION do AutoCAD ghi sẵn (mã 42) */
  measurement?: number;
  /** Tên mẫu tô của HATCH (mã 2) */
  patternName?: string;
  /** HATCH tô đặc (cờ 70 bit 1) */
  isSolidFill?: boolean;
  /** Thực thể nằm ở không gian giấy — khung tên, khung in (mã 67 = 1) */
  isPaperSpace?: boolean;
  /** Bề dày đùn của thực thể 2D (mã 39) */
  thickness?: number;
  /** Tỷ lệ nét đứt riêng của thực thể (mã 48) */
  lineTypeScale?: number;
  /** Thực thể bị ẩn (mã 60 = 1) */
  isInvisible?: boolean;
  /** Hướng đùn — (0,0,-1) nghĩa là thực thể bị lật gương so với mặt phẳng vẽ (mã 210/220/230) */
  extrusion?: [number, number, number];
  /** Tên thẻ thuộc tính của ATTDEF/ATTRIB (mã 2) */
  attributeTag?: string;
  /** Câu nhắc của ATTDEF (mã 3) */
  attributePrompt?: string;
  /** Canh lề chữ: ngang (mã 72) và dọc (mã 73). Khác 0 thì điểm đặt thật là mã 11, không phải 10 */
  textAlign?: { horizontal: number; vertical: number };
  /** Số cột × số hàng và bước lặp của khối chèn theo lưới — MINSERT (mã 70/71/44/45) */
  insertArray?: { columns: number; rows: number; columnSpacing: number; rowSpacing: number };
}

export interface DxfDiagnosticReport {
  healthScore: number; // 0 - 100
  totalEntities: number;
  totalLayers: number;
  standardLayersCount: number;
  nonStandardLayersCount: number;
  corruptedTextCount: number;
  unmappedBlocksCount: number;
  boundingDimensions: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    widthMm: number;
    lengthMm: number;
  };
  disciplineBreakdown: {
    hvac: number;
    electrical: number;
    plumbing: number;
    firefighting: number;
    elv: number;
    structural: number;
  };
  recommendations: string[];
}

export interface Extruded3dRoute {
  id: string;
  system: "HVAC" | "WATER" | "ELECTRICAL" | "FIRE" | "ELV" | "OTHER";
  name: string;
  layer: string;
  startPoint: [number, number, number];
  endPoint: [number, number, number];
  lengthMm: number;
  sectionDimensions: string;
  widthMm: number;
  heightOrDiaMm: number;
  insulationMm: number;
  elevationBopMm: number;
  corridorTier: "Tier 1 (Gió)" | "Tier 2 (Điện)" | "Tier 3 (Nước)";
  combineStatus: "clean" | "clash_risk" | "verified";
  soffitClearanceMm: number;
  boundingBox3d: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface DxfXrefInfo {
  id: string;
  name: string;
  originalPath: string;
  path?: string;
  fileName: string;
  type: "Attach" | "Overlay";
  status: "resolved" | "missing" | "unloaded";
  resolvedFileName?: string;
  entityCount: number;
  layerCount: number;
  description: string;
  isBound?: boolean;
}

export interface DxfParseResult {
  fileName?: string;
  sourcePath?: string;
  fileFormat?: string;
  fileSizeBytes?: number;
  isRealDrawing?: boolean;
  extractedMetadata?: Record<string, string>;
  layers: DxfLayerInfo[];
  entities: DxfEntityRaw[];
  /** Biến hệ thống đọc từ section HEADER của chính tệp (không suy diễn khi tệp không khai) */
  header?: {
    acadVer?: string;
    /** $INSUNITS — mã đơn vị vẽ */
    insUnits?: number;
    /** Nhãn tiếng Việt của $INSUNITS */
    insUnitsLabel?: string;
    /** $MEASUREMENT — 0 = hệ Anh, 1 = hệ mét */
    measurement?: number;
    /** $LTSCALE — tỷ lệ nét đứt toàn cục */
    ltScale?: number;
    /** $EXTMIN / $EXTMAX — khung bao do AutoCAD ghi trong tệp */
    extMin?: [number, number, number];
    extMax?: [number, number, number];
  };
  blocks: Array<{
    name: string;
    count: number;
    attributes: Record<string, string>;
    mappedBoqCode?: string;
    /** Điểm gốc chèn khối (mã 10/20/30 của BLOCK) */
    basePoint?: [number, number, number];
    /** Hình học bên trong định nghĩa khối, đọc từ section BLOCKS */
    entities?: DxfEntityRaw[];
  }>;
  xrefs: DxfXrefInfo[];
  diagnostic: DxfDiagnosticReport;
  spatialRoutes: Extruded3dRoute[];
}

// AutoCAD Color Index (ACI) to Hex mapping (Standard 1-7 + essentials)
export const ACI_TO_HEX: Record<number, string> = {
  1: "#ef4444", // Red
  2: "#eab308", // Yellow
  3: "#22c55e", // Green
  4: "#06b6d4", // Cyan
  5: "#3b82f6", // Blue
  6: "#ec4899", // Magenta
  7: "#f4f4f5", // White / Zinc
  8: "#71717a", // Dark Gray
  9: "#a1a1aa", // Light Gray
  140: "#38bdf8", // Sky Blue
  150: "#0284c7", // Dark Blue
  40: "#fbbf24", // Amber Yellow
  30: "#f59e0b", // Orange
  170: "#818cf8", // Indigo
  70: "#34d399", // Emerald
  10: "#f87171", // Coral Red
  210: "#c084fc", // Purple
};

/**
 * Clean & decode CAD text strings:
 * - Replace %%c, \U+00D8 with Ø (Diameter symbol)
 * - Replace %%p, \U+00B1 with ± (Tolerance symbol)
 * - Replace %%d, \U+00B0 with ° (Degree symbol)
 * - Strip MTEXT font tags (\f...;), color tags (\C...;), height tags (\H...;), alignment tags (\A...;)
 * - Format stacked fractions (\S...^...;) to readable "a/b"
 * - Apply comprehensive TCVN3 / ABC & VNI decoding to standard Unicode UTF-8
 */
export function decodeCadText(rawText: string): string {
  if (!rawText) return "";
  let clean = rawText
    // Control symbols
    .replace(/%%c/gi, "Ø")
    .replace(/\\U\+00D8/gi, "Ø")
    .replace(/\\U\+00F8/gi, "Ø")
    .replace(/%%p/gi, "±")
    .replace(/\\U\+00B1/gi, "±")
    .replace(/%%d/gi, "°")
    .replace(/\\U\+00B0/gi, "°")
    .replace(/øC/gi, "°C")
    .replace(/%%[uUoOkK]/g, "") // formatting toggles
    // MTEXT formatting codes
    .replace(/\\f[^;]+;/gi, "")
    .replace(/\\C[0-9]+;/gi, "")
    .replace(/\\H[0-9.]+x?;/gi, "")
    .replace(/\\W[0-9.]+;/gi, "")
    .replace(/\\Q[0-9.]+;/gi, "")
    .replace(/\\A[0-9];/gi, "")
    .replace(/\\P/g, " ")
    .replace(/\\~/g, " ")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/\\S([^;^]+)\^([^;]+);/g, "$1/$2")
    .replace(/\\S([^;]+);/g, "$1");

  // Giải mã TCVN3/ABC — chỉ khi chuỗi còn mang ký tự chữ ký của bảng mã cũ. Chuỗi đã là Unicode
  // thì để nguyên, nếu không hàm này không idempotent và vòng "chuẩn hoá → xuất DXF → nạp lại"
  // sẽ giải mã chồng lần hai (vd `gió` hoá `giú`).
  if (TCVN3_SIGNATURE.test(clean)) {
    clean = convertTcvn3ToUnicode(clean);
  }

  // Giải mã VNI — văn bản VNI luôn là ASCII thuần (dấu viết bằng chữ số), nên chuỗi đã có ký tự
  // có dấu chắc chắn không phải VNI và không được đụng vào.
  if (/^[\u0000-\u007f]*$/.test(clean)) {
    clean = decodeVniTokens(clean);
  }

  // Normalize Unicode NFC canonical composition
  try {
    clean = clean.normalize("NFC");
  } catch {
    // fallback if environment doesn't support normalize
  }

  return clean.trim();
}

/**
 * Từ có dạng **mã hiệu** chứ không phải chữ tiếng Việt gõ kiểu VNI: toàn bộ chữ số nằm ở CUỐI từ
 * (`A3`, `Zone1`, `AHU01`, `DN150`, `P2`). Chữ VNI luôn có chữ số nằm GIỮA từ vì chữ số chính là
 * dấu thanh gắn vào nguyên âm (`gio1ng`, `nhie65t`, `la1nh`).
 */
function laMaHieu(token: string): boolean {
  return /^[A-Za-z]+[0-9]+$/.test(token);
}

/**
 * Giải mã VNI theo TỪNG TỪ, bỏ qua các từ có dạng mã hiệu.
 *
 * Cần thiết vì bảng VNI biến mọi cặp "nguyên âm + chữ số" thành chữ có dấu, mà bản vẽ MEPF đầy
 * những mã hiệu đúng dạng đó: trục định vị `A3`, khổ giấy `A3`, `Zone1`, `AHU01`… Giải mã cả chuỗi
 * như trước làm `KHUNG TEN A3` hoá `KHUNG TEN Ả` ngay trên khung tên bản vẽ.
 */
function decodeVniTokens(text: string): string {
  return text.replace(/[A-Za-z0-9]+/g, (token) =>
    laMaHieu(token) ? token : convertVniToUnicode(token),
  );
}

/**
 * Kiểm tra xem chuỗi văn bản có bị lỗi mã font TCVN3 / VNI / CAD encoding không.
 */
export function isCorruptedEncoding(text: string): boolean {
  if (!text) return false;
  if (/%%[cpd0-9]/i.test(text)) return true;
  if (/[\u00b8\u00b5\u00b6\u00b7\u00b9\u00be\u00bf\u00a1-\u00a9]/i.test(text)) return true;
  const decoded = decodeCadText(text);
  return decoded !== text;
}

/**
 * Thông điệp chuẩn khi người dùng nạp tệp DWG nhị phân.
 *
 * XBoss **không đọc DWG bằng TypeScript** (ADR-0006): định dạng DWG là nhị phân
 * độc quyền, không có bộ đọc đáng tin trên nền JS. Bản cũ của `parseDwgBinary`
 * quét chuỗi rồi **bịa toạ độ/layer** cho các thực thể — bản vẽ trả về trông
 * "có dữ liệu" nhưng hình học hoàn toàn không có thật. Nay fail-fast thay vì
 * sinh dữ liệu sai (M99 PR0 / FR11).
 */
export const DWG_UNSUPPORTED_MESSAGE =
  "XBoss không đọc trực tiếp tệp DWG. Hãy mở bản vẽ trong AutoCAD và lưu sang DXF " +
  "(Lưu thành → AutoCAD 2000/LT2000 DXF), rồi nạp lại tệp .dxf đó. " +
  "Việc chuẩn hóa trực tiếp trên DWG sẽ do plugin AutoCAD của XBoss đảm nhiệm.";

/** Lỗi phát ra khi nhận tệp DWG nhị phân — route API ánh xạ thành HTTP 422. */
export class DwgUnsupportedError extends Error {
  readonly fileName: string;

  constructor(fileName: string) {
    super(DWG_UNSUPPORTED_MESSAGE);
    this.name = "DwgUnsupportedError";
    this.fileName = fileName;
  }
}

/**
 * Trước đây trích xuất "thực thể" từ tệp DWG nhị phân bằng cách quét chuỗi và
 * bịa toạ độ. Nay luôn ném `DwgUnsupportedError` — xem `DWG_UNSUPPORTED_MESSAGE`.
 */
export function parseDwgBinary(
  _rawBuffer: Buffer | ArrayBuffer | Uint8Array,
  fileName = "model.dwg",
): never {
  throw new DwgUnsupportedError(fileName);
}

/** Nhãn tiếng Việt cho biến HEADER `$INSUNITS` (đơn vị vẽ của bản vẽ). */
export const INSUNITS_LABELS: Record<number, string> = {
  0: "Không quy định",
  1: "Inch",
  2: "Foot",
  3: "Dặm",
  4: "Milimét",
  5: "Xentimét",
  6: "Mét",
  7: "Kilômét",
  8: "Microinch",
  9: "Mil",
  10: "Yard",
  11: "Angstrom",
  12: "Nanomét",
  13: "Micron",
  14: "Decimét",
  15: "Decamét",
  16: "Hectomét",
  17: "Gigamét",
  18: "Đơn vị thiên văn",
  19: "Năm ánh sáng",
  20: "Parsec",
};

/** Một cặp (mã nhóm, giá trị) của tệp DXF. */
interface DxfPair {
  code: number;
  value: string;
}

/** Chuỗi nhận dạng 22 byte mở đầu tệp DXF nhị phân của AutoCAD. */
const BINARY_DXF_SENTINEL = "AutoCAD Binary DXF\r\n\u001a\u0000";

/** Đúng khi buffer là tệp DXF **nhị phân** (khác hoàn toàn DWG — vẫn là DXF, vẫn đọc được). */
function isBinaryDxf(buf: Buffer): boolean {
  return (
    buf.length > BINARY_DXF_SENTINEL.length &&
    buf.subarray(0, 22).toString("binary") === BINARY_DXF_SENTINEL
  );
}

/** Đúng khi buffer mang chữ ký của tệp DWG nhị phân (AC1006…AC1032). */
function isDwgBuffer(buf: Buffer): boolean {
  return buf.subarray(0, 4).toString("ascii") === "AC10";
}

/**
 * Giải mã byte của tệp DXF ASCII thành chuỗi.
 *
 * Bản vẽ Việt Nam đời cũ ghi bằng bảng mã 8 bit (TCVN3/ABC, VNI, CP1258) — đọc bằng UTF-8 thì mọi
 * ký tự có dấu hoá ký tự thay thế `\uFFFD` và **Bác Sĩ Font hết đường cứu**, vì thông tin gốc đã
 * mất ngay từ bước đọc tệp. Nên: thử UTF-8 nghiêm ngặt trước (tệp do AutoCAD đời mới ghi), hỏng
 * thì rơi về Latin-1 — mỗi byte thành đúng một ký tự U+00xx, đúng dạng đầu vào mà bảng TCVN3 chờ.
 */
export function decodeDxfBytes(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

/**
 * Kiểu giá trị của từng mã nhóm trong tệp DXF nhị phân (đặc tả DXF của Autodesk, mục
 * "Binary DXF Files"). Khác tệp ASCII ở chỗ giá trị là byte thật chứ không phải chữ số.
 */
type BinaryValueKind = "string" | "double" | "int16" | "int32" | "int64" | "bool";

function binaryValueKind(code: number): BinaryValueKind {
  if (code <= 9) return "string";
  if (code <= 59) return "double";
  if (code <= 79) return "int16";
  if (code <= 89) return "int32";
  if (code <= 99) return "int32";
  if (code <= 109) return "string";
  if (code <= 149) return "double";
  if (code <= 169) return "int64";
  if (code <= 179) return "int16";
  if (code >= 210 && code <= 239) return "double";
  if (code >= 270 && code <= 289) return "int16";
  if (code === 290) return "bool";
  if (code >= 300 && code <= 369) return "string";
  if (code >= 370 && code <= 389) return "int16";
  if (code >= 390 && code <= 399) return "string";
  if (code >= 400 && code <= 409) return "int16";
  if (code >= 410 && code <= 419) return "string";
  if (code >= 420 && code <= 429) return "int32";
  if (code >= 430 && code <= 439) return "string";
  if (code >= 440 && code <= 449) return "int32";
  if (code >= 450 && code <= 459) return "int32";
  if (code >= 460 && code <= 469) return "double";
  if (code >= 470 && code <= 479) return "string";
  if (code >= 1010 && code <= 1059) return "double";
  if (code >= 1060 && code <= 1070) return "int16";
  if (code === 1071) return "int32";
  return "string";
}

/**
 * Đọc tệp DXF **nhị phân** thành dãy cặp (mã nhóm, giá trị) — cùng cấu trúc logic với tệp ASCII
 * nên toàn bộ phần phân tích phía sau dùng chung.
 *
 * Trước đây mọi buffer đều bị coi là DWG và bị từ chối kèm thông báo "XBoss không đọc DWG" — sai
 * cả chẩn đoán lẫn hướng dẫn, vì "Save As → DXF nhị phân" trong AutoCAD ra đúng loại tệp này.
 */
function readBinaryDxfPairs(buf: Buffer): DxfPair[] {
  const pairs: DxfPair[] = [];
  let i = BINARY_DXF_SENTINEL.length;

  while (i < buf.length) {
    let code = buf.readUInt8(i);
    i += 1;
    // Mã nhóm ≥ 255 ghi bằng 2 byte little-endian sau byte đánh dấu 255 (R2000 trở lên)
    if (code === 255) {
      if (i + 2 > buf.length) break;
      code = buf.readUInt16LE(i);
      i += 2;
    }

    const kind = binaryValueKind(code);
    if (kind === "string") {
      let end = i;
      while (end < buf.length && buf[end] !== 0) end += 1;
      pairs.push({ code, value: decodeDxfBytes(buf.subarray(i, end)) });
      i = end + 1;
      continue;
    }

    const size =
      kind === "double" || kind === "int64" ? 8 : kind === "int32" ? 4 : kind === "int16" ? 2 : 1;
    if (i + size > buf.length) break;
    let value: number | bigint;
    if (kind === "double") value = buf.readDoubleLE(i);
    else if (kind === "int64") value = buf.readBigInt64LE(i);
    else if (kind === "int32") value = buf.readInt32LE(i);
    else if (kind === "int16") value = buf.readInt16LE(i);
    else value = buf.readUInt8(i);
    pairs.push({ code, value: String(value) });
    i += size;
  }

  return pairs;
}

/**
 * Tách nội dung DXF ASCII thành dãy cặp (mã nhóm, giá trị).
 *
 * Giá trị **không** bị trim: mã nhóm 1/3 là nội dung chữ trên bản vẽ, khoảng trắng đầu/cuối là
 * dữ liệu thật của người vẽ. Gặp dòng lệch nhịp (không phải số ở vị trí mã nhóm) thì lùi 1 dòng
 * để bắt lại nhịp thay vì đọc sai toàn bộ phần còn lại — `validateDxf` mới là nơi báo lỗi cấu trúc.
 */
function readDxfPairs(content: string): DxfPair[] {
  const lines = content.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const pairs: DxfPair[] = [];

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeRaw = lines[i].trim();
    if (!/^-?\d+$/.test(codeRaw)) {
      i -= 1; // bắt lại nhịp cặp
      continue;
    }
    pairs.push({ code: parseInt(codeRaw, 10), value: lines[i + 1] });
  }

  return pairs;
}

/**
 * Các loại thực thể bộ đọc hiểu được (khớp union `DxfEntityRaw["type"]`).
 *
 * Loại nào KHÔNG có trong danh sách này sẽ bị bỏ qua hoàn toàn — không đọc, không đếm, không xuất
 * — nên thêm loại mới vào đây là cách duy nhất để nó không biến mất im lặng khỏi bản vẽ.
 *
 * Cố ý không có: `VIEWPORT` (khung nhìn của không gian giấy) là siêu dữ liệu bố cục in, không phải
 * nội dung bản vẽ; dựng lại nó đòi cả bố cục R12 mà bộ ghi này không tái tạo.
 */
const PARSED_ENTITY_TYPES = new Set<DxfEntityRaw["type"]>([
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
  "POINT",
  "ATTDEF",
  "XLINE",
  "RAY",
  "MLINE",
  "TRACE",
  "WIPEOUT",
  "IMAGE",
  "SHAPE",
  "TOLERANCE",
]);

/** Đọc số thực; giá trị không đọc được trả `undefined` để chỗ gọi tự quyết, không mặc định 0. */
function numOrUndef(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function num(v: string, fallback = 0): number {
  return numOrUndef(v) ?? fallback;
}

/**
 * Gom toàn bộ cặp của một nhóm (thực thể / bản ghi bảng), tính từ ngay sau cặp `0/<TÊN>` cho tới
 * ngay trước cặp mã 0 kế tiếp. Giữ nguyên thứ tự vì nhiều mã nhóm lặp lại (10/20 của LWPOLYLINE,
 * 42 độ cong từng đoạn, 3 các mảnh chữ MTEXT).
 */
function readGroup(pairs: DxfPair[], start: number): { group: DxfPair[]; next: number } {
  const group: DxfPair[] = [];
  let i = start;
  while (i < pairs.length && pairs[i].code !== 0) {
    group.push(pairs[i]);
    i += 1;
  }
  return { group, next: i };
}

/** Điểm 3D dựng từ 3 mã nhóm toạ độ; thiếu X hoặc Y thì coi như không có điểm. */
function pointOf(
  x: number | undefined,
  y: number | undefined,
  z: number | undefined,
): [number, number, number] | undefined {
  if (x === undefined || y === undefined) return undefined;
  return [x, y, z ?? 0];
}

/** Rời rạc hoá một cung tròn thành chuỗi đỉnh — dùng cho cạnh cung trong ranh giới HATCH. */
function arcToPoints(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  segments = 16,
): Array<[number, number, number]> {
  const a0 = (startDeg * Math.PI) / 180;
  let a1 = (endDeg * Math.PI) / 180;
  if (a1 <= a0) a1 += Math.PI * 2;
  const pts: Array<[number, number, number]> = [];
  for (let k = 0; k <= segments; k++) {
    const t = a0 + ((a1 - a0) * k) / segments;
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t), 0]);
  }
  return pts;
}

/**
 * Đọc **ranh giới tô** của HATCH (mã 91 số đường bao, 92 kiểu đường bao, 93 số đỉnh/số cạnh,
 * 72 kiểu cạnh, 42 độ cong, 73 khép kín).
 *
 * Trước đây HATCH chỉ giữ tên mẫu tô và điểm neo, nên vùng tô — thường là vùng bảo ôn, vùng đúc
 * bù, vùng cắt qua của bản vẽ MEPF — mất sạch hình khi xuất tệp. Cạnh cung được rời rạc hoá vì
 * đường bao xuất ra dưới dạng đa tuyến; các loại cạnh ellipse/spline lấy theo đỉnh điều khiển.
 */
function parseHatchBoundaries(group: DxfPair[]): {
  paths: Array<{ points: Array<[number, number, number]>; bulges: number[]; closed: boolean }>;
  seeds: Array<[number, number, number]>;
} {
  const paths: Array<{
    points: Array<[number, number, number]>;
    bulges: number[];
    closed: boolean;
  }> = [];
  const seeds: Array<[number, number, number]> = [];

  let inBoundary = false;
  let inSeeds = false;
  let isPolylinePath = false;
  let edgeType = 0;
  let current: {
    points: Array<[number, number, number]>;
    bulges: number[];
    closed: boolean;
  } | null = null;
  // Bộ đệm cho cạnh cung (mã 10/20 là tâm, 40 bán kính, 50/51 hai góc)
  let arcCx: number | undefined;
  let arcCy: number | undefined;
  let arcR: number | undefined;
  let arcA0: number | undefined;

  const flushArc = () => {
    if (
      current &&
      edgeType === 2 &&
      arcCx !== undefined &&
      arcCy !== undefined &&
      arcR !== undefined &&
      arcA0 !== undefined
    ) {
      const pts = arcToPoints(arcCx, arcCy, arcR, arcA0, arcA0);
      pts.forEach((pt) => {
        current!.points.push(pt);
        current!.bulges.push(0);
      });
    }
    arcCx = arcCy = arcR = arcA0 = undefined;
  };

  for (const { code, value } of group) {
    if (code === 91) {
      inBoundary = true;
      continue;
    }
    if (code === 98) {
      // Kết thúc phần ranh giới, sang danh sách điểm gieo mẫu tô
      flushArc();
      if (current && current.points.length > 0) paths.push(current);
      current = null;
      inBoundary = false;
      inSeeds = true;
      continue;
    }
    if (code === 75 || code === 76 || code === 47) {
      // Các mã kiểu/tỷ lệ mẫu tô nằm sau phần ranh giới
      flushArc();
      if (current && current.points.length > 0) paths.push(current);
      current = null;
      inBoundary = false;
      continue;
    }

    if (inSeeds) {
      if (code === 10) seeds.push([num(value), 0, 0]);
      else if (code === 20 && seeds.length > 0) seeds[seeds.length - 1][1] = num(value);
      continue;
    }

    if (!inBoundary) continue;

    if (code === 92) {
      flushArc();
      if (current && current.points.length > 0) paths.push(current);
      const flags = num(value);
      isPolylinePath = Boolean(flags & 2);
      edgeType = 0;
      current = { points: [], bulges: [], closed: false };
      continue;
    }
    if (!current) continue;

    if (code === 72) {
      // Đường bao đa tuyến: 72 là cờ "có độ cong"; đường bao theo cạnh: 72 là kiểu cạnh
      if (!isPolylinePath) {
        flushArc();
        edgeType = num(value);
      }
      continue;
    }
    if (code === 73) {
      if (isPolylinePath) current.closed = num(value) === 1;
      continue;
    }
    if (code === 10) {
      if (!isPolylinePath && edgeType === 2) {
        flushArc();
        arcCx = num(value);
      } else {
        current.points.push([num(value), 0, 0]);
        current.bulges.push(0);
      }
      continue;
    }
    if (code === 20) {
      if (!isPolylinePath && edgeType === 2) arcCy = num(value);
      else if (current.points.length > 0) current.points[current.points.length - 1][1] = num(value);
      continue;
    }
    if (code === 11 && !isPolylinePath && edgeType === 1) {
      current.points.push([num(value), 0, 0]);
      current.bulges.push(0);
      continue;
    }
    if (code === 21 && !isPolylinePath && edgeType === 1 && current.points.length > 0) {
      current.points[current.points.length - 1][1] = num(value);
      continue;
    }
    if (code === 40 && !isPolylinePath && edgeType === 2) {
      arcR = num(value);
      continue;
    }
    if (code === 50 && !isPolylinePath && edgeType === 2) {
      arcA0 = num(value);
      continue;
    }
    if (code === 51 && !isPolylinePath && edgeType === 2) {
      if (arcCx !== undefined && arcCy !== undefined && arcR !== undefined && arcA0 !== undefined) {
        arcToPoints(arcCx, arcCy, arcR, arcA0, num(value)).forEach((pt) => {
          current!.points.push(pt);
          current!.bulges.push(0);
        });
      }
      arcCx = arcCy = arcR = arcA0 = undefined;
      continue;
    }
    if (code === 42 && isPolylinePath && current.points.length > 0) {
      current.bulges[current.points.length - 1] = num(value);
      continue;
    }
  }

  flushArc();
  if (current && current.points.length > 0) paths.push(current);

  return { paths, seeds };
}

/**
 * Đọc phần nội dung của MULTILEADER (chú thích có đường dẫn, R2000 trở lên).
 *
 * Dữ liệu nằm trong khối ngữ cảnh lồng nhau `CONTEXT_DATA{ … LEADER{ … LEADER_LINE{ … } }`, đánh
 * dấu bằng mã 300/302. Lấy: chữ chú thích (mã 304), điểm đặt chữ (mã 10 đầu tiên trong ngữ cảnh)
 * và các đỉnh của từng đường dẫn (mã 10 bên trong `LEADER_LINE{`).
 */
function parseMultiLeader(group: DxfPair[]): {
  text: string;
  textPoint?: [number, number, number];
  leaderPoints: Array<[number, number, number]>;
  textHeight?: number;
} {
  let text = "";
  let textPoint: [number, number, number] | undefined;
  let textHeight: number | undefined;
  const leaderPoints: Array<[number, number, number]> = [];

  let inContext = false;
  let inLeaderLine = false;
  let sawContextPoint = false;

  for (const { code, value } of group) {
    if (code === 300) {
      inContext = value.includes("CONTEXT_DATA");
      inLeaderLine = false;
      continue;
    }
    if (code === 302) {
      inLeaderLine = value.includes("LEADER_LINE");
      continue;
    }
    if (code === 304) {
      text += value;
      continue;
    }
    if (code === 40 && inContext && textHeight === undefined) {
      textHeight = numOrUndef(value);
      continue;
    }
    if (code === 10) {
      if (inLeaderLine) leaderPoints.push([num(value), 0, 0]);
      else if (inContext && !sawContextPoint) {
        textPoint = [num(value), 0, 0];
        sawContextPoint = true;
      }
      continue;
    }
    if (code === 20) {
      if (inLeaderLine && leaderPoints.length > 0)
        leaderPoints[leaderPoints.length - 1][1] = num(value);
      else if (textPoint && sawContextPoint) textPoint[1] = num(value);
      continue;
    }
    if (code === 30) {
      if (inLeaderLine && leaderPoints.length > 0)
        leaderPoints[leaderPoints.length - 1][2] = num(value);
      else if (textPoint && sawContextPoint) textPoint[2] = num(value);
      continue;
    }
  }

  return { text, textPoint, leaderPoints, textHeight };
}

/**
 * Dựng một `DxfEntityRaw` từ nhóm cặp mã đã gom, theo đúng mã nhóm mà đặc tả DXF quy định cho
 * từng loại thực thể. Không có mã nhóm nào thì trường tương ứng để trống — không bịa giá trị.
 */
function buildEntity(type: DxfEntityRaw["type"], group: DxfPair[], id: string): DxfEntityRaw {
  let layer = "0";
  let color: number | undefined;
  let lineType: string | undefined;
  let text = "";
  let blockName: string | undefined;
  let textStyle: string | undefined;
  let patternName: string | undefined;

  // Bộ toạ độ cơ bản
  let x10: number | undefined;
  let y20: number | undefined;
  let z30: number | undefined;
  let x11: number | undefined;
  let y21: number | undefined;
  let z31: number | undefined;
  let x13: number | undefined;
  let y23: number | undefined;
  let z33: number | undefined;
  let x14: number | undefined;
  let y24: number | undefined;
  let z34: number | undefined;

  let val40: number | undefined; // bán kính / chiều cao chữ / tỷ lệ trục ELLIPSE
  let val41: number | undefined; // hệ số bề rộng chữ / tỷ lệ X của INSERT
  let val42: number | undefined; // số đo thật của DIMENSION / tỷ lệ Y của INSERT
  let val43: number | undefined; // tỷ lệ Z của INSERT
  let val44: number | undefined; // bước lặp theo cột của MINSERT
  let val45: number | undefined; // bước lặp theo hàng của MINSERT
  let val50: number | undefined; // góc xoay / góc bắt đầu cung
  let val51: number | undefined; // góc kết thúc cung
  let flags70: number | undefined;
  let val71: number | undefined; // số hàng của MINSERT / kiểu canh lề MLINE
  let val72: number | undefined; // canh lề ngang của TEXT
  let val73: number | undefined; // canh lề dọc của TEXT
  let elevation38: number | undefined;
  let thickness39: number | undefined;
  let ltScale48: number | undefined;
  let invisible60: number | undefined;
  let paperSpace67: number | undefined;
  let ex210: number | undefined;
  let ey220: number | undefined;
  let ez230: number | undefined;
  let attributePrompt: string | undefined;

  const points: Array<[number, number, number]> = [];
  const bulges: number[] = [];
  const fitPoints: Array<[number, number, number]> = [];
  const corners: Array<[number, number, number]> = [];

  const isPolyLike = type === "LWPOLYLINE" || type === "SPLINE" || type === "LEADER";
  const isCornerLike = type === "SOLID" || type === "3DFACE" || type === "TRACE";
  // MLINE (đường nhiều nét, R13+) đặt các đỉnh trục ở mã 11/21/31 lặp lại
  const isMline = type === "MLINE";
  // WIPEOUT/IMAGE: đường bao cắt ảnh nằm ở mã 14/24 lặp lại
  const isRaster = type === "WIPEOUT" || type === "IMAGE";

  for (const { code, value } of group) {
    switch (code) {
      case 8:
        layer = value.trim();
        break;
      case 6:
        lineType = value.trim();
        break;
      case 62: {
        const c = numOrUndef(value);
        if (c !== undefined) color = Math.abs(c);
        break;
      }
      case 3:
        // MTEXT chia chữ dài thành nhiều mảnh mã 3 rồi kết bằng mã 1; còn ở ATTDEF mã 3 là câu
        // nhắc nhập liệu, không phải nội dung chữ trên bản vẽ.
        if (type === "ATTDEF") attributePrompt = value.trim();
        else text += value;
        break;
      case 1:
        text += value;
        break;
      case 2:
        if (type === "HATCH") patternName = value.trim();
        else blockName = value.trim();
        break;
      case 7:
        textStyle = value.trim();
        break;
      case 10:
        if (isPolyLike) {
          points.push([num(value), 0, 0]);
          bulges.push(0);
        } else if (isCornerLike) {
          // SOLID / 3DFACE: đỉnh thứ nhất nằm ở 10/20/30, ba đỉnh còn lại ở 11..13
          corners.push([num(value), 0, 0]);
        } else {
          x10 = numOrUndef(value);
        }
        break;
      case 20:
        if (isPolyLike && points.length > 0) points[points.length - 1][1] = num(value);
        else if (isCornerLike && corners.length > 0) corners[corners.length - 1][1] = num(value);
        else y20 = numOrUndef(value);
        break;
      case 30:
        if (isPolyLike && points.length > 0) points[points.length - 1][2] = num(value);
        else if (isCornerLike && corners.length > 0) corners[corners.length - 1][2] = num(value);
        else z30 = numOrUndef(value);
        break;
      case 11:
        if (type === "SPLINE" || isMline) fitPoints.push([num(value), 0, 0]);
        else if (isCornerLike) corners.push([num(value), 0, 0]);
        else x11 = numOrUndef(value);
        break;
      case 21:
        if ((type === "SPLINE" || isMline) && fitPoints.length > 0)
          fitPoints[fitPoints.length - 1][1] = num(value);
        else if (isCornerLike && corners.length > 0) corners[corners.length - 1][1] = num(value);
        else y21 = numOrUndef(value);
        break;
      case 31:
        if ((type === "SPLINE" || isMline) && fitPoints.length > 0)
          fitPoints[fitPoints.length - 1][2] = num(value);
        else if (isCornerLike && corners.length > 0) corners[corners.length - 1][2] = num(value);
        else z31 = numOrUndef(value);
        break;
      case 12:
        if (isCornerLike) corners.push([num(value), 0, 0]);
        break;
      case 22:
        if (isCornerLike && corners.length > 0) corners[corners.length - 1][1] = num(value);
        break;
      case 32:
        if (isCornerLike && corners.length > 0) corners[corners.length - 1][2] = num(value);
        break;
      case 13:
        if (type === "SOLID" || type === "3DFACE") corners.push([num(value), 0, 0]);
        else x13 = numOrUndef(value);
        break;
      case 23:
        if ((type === "SOLID" || type === "3DFACE") && corners.length > 0)
          corners[corners.length - 1][1] = num(value);
        else y23 = numOrUndef(value);
        break;
      case 33:
        if ((type === "SOLID" || type === "3DFACE") && corners.length > 0)
          corners[corners.length - 1][2] = num(value);
        else z33 = numOrUndef(value);
        break;
      case 14:
        if (isRaster) {
          points.push([num(value), 0, 0]);
          bulges.push(0);
        } else x14 = numOrUndef(value);
        break;
      case 24:
        if (isRaster && points.length > 0) points[points.length - 1][1] = num(value);
        else y24 = numOrUndef(value);
        break;
      case 34:
        z34 = numOrUndef(value);
        break;
      case 38:
        elevation38 = numOrUndef(value);
        break;
      case 40:
        val40 = numOrUndef(value);
        break;
      case 41:
        val41 = numOrUndef(value);
        break;
      case 42:
        // LWPOLYLINE: độ cong của đoạn nối từ đỉnh vừa đọc; các loại khác: số đo/tỷ lệ.
        if (type === "LWPOLYLINE" && points.length > 0) bulges[points.length - 1] = num(value);
        else val42 = numOrUndef(value);
        break;
      case 43:
        val43 = numOrUndef(value);
        break;
      case 50:
        val50 = numOrUndef(value);
        break;
      case 51:
        val51 = numOrUndef(value);
        break;
      case 70:
        flags70 = numOrUndef(value);
        break;
      case 71:
        val71 = numOrUndef(value);
        break;
      case 72:
        val72 = numOrUndef(value);
        break;
      case 73:
        val73 = numOrUndef(value);
        break;
      case 44:
        val44 = numOrUndef(value);
        break;
      case 45:
        val45 = numOrUndef(value);
        break;
      case 39:
        thickness39 = numOrUndef(value);
        break;
      case 48:
        ltScale48 = numOrUndef(value);
        break;
      case 60:
        invisible60 = numOrUndef(value);
        break;
      case 67:
        paperSpace67 = numOrUndef(value);
        break;
      case 210:
        ex210 = numOrUndef(value);
        break;
      case 220:
        ey220 = numOrUndef(value);
        break;
      case 230:
        ez230 = numOrUndef(value);
        break;
    }
  }

  const coordinates: DxfEntityRaw["coordinates"] = {};

  if (type === "LINE") {
    coordinates.start = pointOf(x10, y20, z30);
    coordinates.end = pointOf(x11, y21, z31);
  } else if (type === "LWPOLYLINE") {
    if (elevation38 !== undefined) {
      points.forEach((p) => (p[2] = elevation38));
      coordinates.elevation = elevation38;
    }
    coordinates.points = points;
    if (bulges.some((b) => b !== 0)) coordinates.bulges = bulges;
    coordinates.closed = Boolean(flags70 !== undefined && flags70 & 1);
  } else if (type === "POLYLINE") {
    // POLYLINE kiểu cũ: mã 10/20/30 của chính nó là điểm giả (luôn 0,0,cao-độ) — hình học nằm ở
    // các VERTEX theo sau, `readEntityAt` sẽ điền vào. Không lấy điểm giả này làm toạ độ thực thể.
    coordinates.points = [];
    coordinates.closed = Boolean(flags70 !== undefined && flags70 & 1);
    if (z30 !== undefined) coordinates.elevation = z30;
  } else if (type === "SPLINE") {
    // Đường cong SPLINE dùng điểm khớp (11/21/31) nếu có, không có thì dùng điểm điều khiển.
    coordinates.points = fitPoints.length > 0 ? fitPoints : points;
    coordinates.closed = Boolean(flags70 !== undefined && flags70 & 1);
  } else if (type === "LEADER") {
    coordinates.points = points;
    if (points.length > 0) {
      coordinates.start = points[0];
      coordinates.end = points[points.length - 1];
    }
  } else if (type === "CIRCLE") {
    coordinates.center = pointOf(x10, y20, z30);
    if (val40 !== undefined) coordinates.radius = val40;
  } else if (type === "ARC") {
    coordinates.center = pointOf(x10, y20, z30);
    if (val40 !== undefined) coordinates.radius = val40;
    if (val50 !== undefined) coordinates.startAngle = val50;
    if (val51 !== undefined) coordinates.endAngle = val51;
  } else if (type === "ELLIPSE") {
    coordinates.center = pointOf(x10, y20, z30);
    coordinates.majorAxis = pointOf(x11, y21, z31);
    if (val40 !== undefined) coordinates.axisRatio = val40;
  } else if (isCornerLike) {
    coordinates.corners = corners;
    if (corners.length > 0) coordinates.center = corners[0];
  } else if (type === "XLINE" || type === "RAY") {
    // Đường dựng hình: mã 10 là điểm gốc, mã 11 là VECTOR hướng đơn vị (không phải điểm thứ hai)
    coordinates.start = pointOf(x10, y20, z30);
    coordinates.direction = pointOf(x11, y21, z31);
  } else if (isMline) {
    coordinates.points = fitPoints;
    coordinates.closed = Boolean(flags70 !== undefined && flags70 & 2);
  } else if (isRaster) {
    // Ảnh chèn / vùng che: giữ điểm chèn và đường bao cắt (nếu bản vẽ có khai)
    coordinates.center = pointOf(x10, y20, z30);
    if (points.length > 0) {
      coordinates.points = points;
      coordinates.closed = true;
    }
  } else if (type === "HATCH") {
    const { paths, seeds } = parseHatchBoundaries(group);
    coordinates.boundaryPaths = paths;
    coordinates.center = pointOf(x10, y20, z30) || seeds[0];
    if (paths.length > 0) {
      coordinates.points = paths[0].points;
      coordinates.bulges = paths[0].bulges;
      coordinates.closed = paths[0].closed;
    }
  } else if (type === "MULTILEADER") {
    const ml = parseMultiLeader(group);
    coordinates.points = ml.leaderPoints;
    coordinates.center = ml.textPoint || pointOf(x10, y20, z30);
    if (ml.leaderPoints.length > 0) {
      coordinates.start = ml.leaderPoints[0];
      coordinates.end = ml.leaderPoints[ml.leaderPoints.length - 1];
    }
    if (ml.text) text = ml.text;
    if (ml.textHeight !== undefined) val40 = ml.textHeight;
  } else if (type === "DIMENSION") {
    // Mã 10 là điểm đặt đường kích thước, KHÔNG phải hai đầu đo. Hai đầu đo thật nằm ở
    // 13/23/33 và 14/24/34; số đo thật nằm ở mã 42 do AutoCAD ghi sẵn.
    const p13 = pointOf(x13, y23, z33);
    const p14 = pointOf(x14, y24, z34);
    if (p13 && p14) coordinates.measurePoints = [p13, p14];
    coordinates.start = p13 ?? pointOf(x10, y20, z30);
    coordinates.end = p14;
    coordinates.center = pointOf(x10, y20, z30);
    coordinates.textMidPoint = pointOf(x11, y21, z31);
  } else {
    // TEXT / MTEXT / INSERT / HATCH / MULTILEADER: điểm chèn nằm ở 10/20/30
    coordinates.center = pointOf(x10, y20, z30);
    if (type === "TEXT" && (x11 !== undefined || y21 !== undefined)) {
      coordinates.alignPoint = pointOf(x11, y21, z31);
    }
  }

  const entity: DxfEntityRaw = {
    id,
    type,
    layer,
    color,
    coordinates,
  };

  if (lineType) entity.lineType = lineType;
  if (text) {
    entity.textValue = text;
    entity.decodedText = decodeCadText(text);
  }
  if (blockName) entity.blockName = blockName;
  if (textStyle) entity.textStyle = textStyle;
  if (patternName) entity.patternName = patternName;

  if (type === "TEXT" || type === "MTEXT" || type === "ATTDEF" || type === "MULTILEADER") {
    if (val40 !== undefined) entity.textHeight = val40;
    if (val41 !== undefined && (type === "TEXT" || type === "ATTDEF")) entity.widthFactor = val41;
    if (val50 !== undefined) entity.rotation = val50;
    if (type === "ATTDEF") {
      // Ở ATTDEF, mã 2 là THẺ thuộc tính chứ không phải tên khối
      if (blockName) entity.attributeTag = blockName;
      entity.blockName = undefined;
      if (attributePrompt) entity.attributePrompt = attributePrompt;
    }
    // TEXT có canh lề (mã 72/73 khác 0) thì điểm đặt thật là mã 11, không phải mã 10
    if ((type === "TEXT" || type === "ATTDEF") && ((val72 ?? 0) !== 0 || (val73 ?? 0) !== 0)) {
      const align = pointOf(x11, y21, z31);
      if (align) {
        entity.coordinates.alignPoint = entity.coordinates.center;
        entity.coordinates.center = align;
        entity.textAlign = { horizontal: val72 ?? 0, vertical: val73 ?? 0 };
      }
    }
  } else if (type === "SHAPE") {
    if (val40 !== undefined) entity.textHeight = val40;
    if (val50 !== undefined) entity.rotation = val50;
  } else if (type === "INSERT") {
    entity.scale = [val41 ?? 1, val42 ?? 1, val43 ?? 1];
    if (val50 !== undefined) entity.rotation = val50;
    // MINSERT: khối chèn lặp theo lưới cột × hàng
    const columns = flags70 ?? 1;
    const rows = val71 ?? 1;
    if (columns > 1 || rows > 1) {
      entity.insertArray = {
        columns,
        rows,
        columnSpacing: val44 ?? 0,
        rowSpacing: val45 ?? 0,
      };
    }
  } else if (type === "DIMENSION") {
    if (val42 !== undefined) entity.measurement = val42;
    if (val50 !== undefined) entity.rotation = val50;
  } else if (type === "HATCH") {
    entity.isSolidFill = Boolean(flags70 !== undefined && flags70 & 1);
  }

  // Thuộc tính chung mọi thực thể — trước đây bị bỏ hết nên xuất tệp là mất
  if (paperSpace67 === 1) entity.isPaperSpace = true;
  if (thickness39 !== undefined && thickness39 !== 0) entity.thickness = thickness39;
  if (ltScale48 !== undefined && ltScale48 !== 1) entity.lineTypeScale = ltScale48;
  if (invisible60 === 1) entity.isInvisible = true;
  if (ex210 !== undefined || ey220 !== undefined || ez230 !== undefined) {
    const ext: [number, number, number] = [ex210 ?? 0, ey220 ?? 0, ez230 ?? 1];
    // Chỉ giữ khi khác hướng mặc định (0,0,1) — bản vẽ lật gương mới cần thông tin này
    if (ext[0] !== 0 || ext[1] !== 0 || ext[2] !== 1) entity.extrusion = ext;
  }

  return entity;
}

/**
 * Đọc một thực thể tại vị trí `start` (trỏ vào cặp `0/<TÊN>`), gồm cả các nhóm con đi kèm:
 * VERTEX của POLYLINE cũ và ATTRIB của INSERT có thuộc tính.
 */
function readEntityAt(
  pairs: DxfPair[],
  start: number,
  id: string,
): { entity: DxfEntityRaw; next: number } {
  const type = pairs[start].value.trim() as DxfEntityRaw["type"];
  const { group, next } = readGroup(pairs, start + 1);
  const entity = buildEntity(type, group, id);
  let i = next;

  if (type === "POLYLINE") {
    // POLYLINE kiểu cũ: hình học nằm ở các thực thể VERTEX theo sau, kết bằng SEQEND.
    const verts: Array<[number, number, number]> = [];
    const vertBulges: number[] = [];
    while (i < pairs.length && pairs[i].code === 0) {
      const sub = pairs[i].value.trim();
      if (sub === "VERTEX") {
        const { group: vg, next: vn } = readGroup(pairs, i + 1);
        let vx: number | undefined;
        let vy: number | undefined;
        let vz = 0;
        let vb = 0;
        for (const { code, value } of vg) {
          if (code === 10) vx = numOrUndef(value);
          else if (code === 20) vy = numOrUndef(value);
          else if (code === 30) vz = num(value);
          else if (code === 42) vb = num(value);
        }
        if (vx !== undefined && vy !== undefined) {
          verts.push([vx, vy, vz]);
          vertBulges.push(vb);
        }
        i = vn;
      } else if (sub === "SEQEND") {
        i = readGroup(pairs, i + 1).next;
        break;
      } else {
        break;
      }
    }
    entity.coordinates.points = verts;
    if (vertBulges.some((b) => b !== 0)) entity.coordinates.bulges = vertBulges;
  } else if (type === "INSERT") {
    // INSERT có mã 66=1 thì các ATTRIB theo sau mang giá trị thuộc tính thật của khối.
    const attributes: Record<string, string> = {};
    while (i < pairs.length && pairs[i].code === 0) {
      const sub = pairs[i].value.trim();
      if (sub === "ATTRIB") {
        const { group: ag, next: an } = readGroup(pairs, i + 1);
        let tag = "";
        let value = "";
        for (const p of ag) {
          if (p.code === 2) tag = p.value.trim();
          else if (p.code === 1) value += p.value;
        }
        if (tag) attributes[tag] = decodeCadText(value);
        i = an;
      } else if (sub === "SEQEND") {
        i = readGroup(pairs, i + 1).next;
        break;
      } else {
        break;
      }
    }
    if (Object.keys(attributes).length > 0) entity.attributes = attributes;
  }

  return { entity, next: i };
}

/** Mọi toạ độ thật của một thực thể, dùng để tính khung bao bản vẽ. */
function entityPoints(e: DxfEntityRaw): Array<[number, number, number]> {
  const c = e.coordinates;
  const pts: Array<[number, number, number]> = [];
  if (c.start) pts.push(c.start);
  if (c.end) pts.push(c.end);
  if (c.center) pts.push(c.center);
  if (c.alignPoint) pts.push(c.alignPoint);
  if (c.textMidPoint) pts.push(c.textMidPoint);
  if (c.points) pts.push(...c.points);
  if (c.corners) pts.push(...c.corners);
  if (c.measurePoints) pts.push(...c.measurePoints);
  // Đường tròn/cung: lấy khung bao theo bán kính quanh tâm
  if (c.center && c.radius !== undefined && c.radius > 0) {
    pts.push([c.center[0] - c.radius, c.center[1] - c.radius, c.center[2]]);
    pts.push([c.center[0] + c.radius, c.center[1] + c.radius, c.center[2]]);
  }
  return pts;
}

/** Kết quả rỗng trung thực khi không đọc được bản vẽ — không sinh layer/thực thể giả. */
function emptyParseResult(fileName: string, fileSizeBytes: number, lyDo: string): DxfParseResult {
  return {
    fileName,
    sourcePath: fileName,
    fileFormat: "Unknown / Empty",
    fileSizeBytes,
    isRealDrawing: false,
    layers: [],
    entities: [],
    blocks: [],
    xrefs: [],
    spatialRoutes: [],
    diagnostic: {
      healthScore: 0,
      totalEntities: 0,
      totalLayers: 0,
      standardLayersCount: 0,
      nonStandardLayersCount: 0,
      corruptedTextCount: 0,
      unmappedBlocksCount: 0,
      boundingDimensions: { minX: 0, maxX: 0, minY: 0, maxY: 0, widthMm: 0, lengthMm: 0 },
      disciplineBreakdown: {
        hvac: 0,
        electrical: 0,
        plumbing: 0,
        firefighting: 0,
        elv: 0,
        structural: 0,
      },
      recommendations: [lyDo],
    },
  };
}

/**
 * Phân tích tệp DXF ASCII thành cấu trúc hình học & kỹ thuật (tệp DWG nhị phân bị từ chối,
 * xem `DWG_UNSUPPORTED_MESSAGE`).
 *
 * Bộ đọc bám **theo section** (HEADER / TABLES / BLOCKS / ENTITIES) đúng đặc tả DXF của Autodesk
 * thay vì quét phẳng cả tệp. Nhờ vậy: bảng LAYER không lẫn với thực thể, hình học bên trong định
 * nghĩa BLOCK không bị đếm nhầm vào model space, và XREF đọc được từ chính bản vẽ (BLOCK có cờ 70
 * bit 4 kèm đường dẫn mã 1).
 *
 * Nguyên tắc xuyên suốt (M98/M99): **thiếu dữ liệu thì để trống** — không suy diễn toạ độ, khung
 * bao, số đo hay danh sách tệp tham chiếu.
 */
export function parseDxf(
  dxfContent: string | Buffer | ArrayBuffer | Uint8Array,
  fileName = "model.dxf",
): DxfParseResult {
  // Dữ liệu nhị phân đi vào đây có thể là BA loại khác nhau — trước đây gộp làm một và từ chối
  // tất cả kèm thông báo "không đọc DWG", sai cả chẩn đoán lẫn hướng dẫn cho người dùng:
  //   1. DWG          → thật sự không đọc được bằng TypeScript (ADR-0006), từ chối.
  //   2. DXF nhị phân → vẫn là DXF, đọc bình thường ("Save As → DXF nhị phân" của AutoCAD).
  //   3. DXF ASCII    → chỉ là byte của tệp chữ, giải mã theo bảng mã rồi đọc như thường.
  let pairs: DxfPair[];
  let sourceBytes = 0;
  let fileFormat = "DXF ASCII";

  const asBuffer =
    typeof Buffer !== "undefined" && Buffer.isBuffer(dxfContent)
      ? dxfContent
      : dxfContent instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(dxfContent))
        : dxfContent instanceof Uint8Array
          ? Buffer.from(dxfContent)
          : null;

  if (asBuffer) {
    if (isDwgBuffer(asBuffer) || fileName.toLowerCase().endsWith(".dwg")) {
      return parseDwgBinary(asBuffer, fileName);
    }
    sourceBytes = asBuffer.length;
    if (isBinaryDxf(asBuffer)) {
      fileFormat = "DXF nhị phân";
      pairs = readBinaryDxfPairs(asBuffer);
    } else {
      const text = decodeDxfBytes(asBuffer).trim();
      if (!text || !text.includes("SECTION")) {
        return emptyParseResult(
          fileName,
          sourceBytes,
          "Chưa nạp bản vẽ hoặc tệp tin không đúng cấu trúc CAD. Vui lòng tải lên file DXF hợp lệ.",
        );
      }
      pairs = readDxfPairs(text);
    }
  } else {
    const raw = String(dxfContent || "");
    // Chuỗi mang chữ ký DWG hoặc byte 0 giữa chừng: nội dung nhị phân bị ép thành chuỗi từ trước
    if (raw.startsWith("AC10") || (raw.includes("\0") && !raw.startsWith(BINARY_DXF_SENTINEL))) {
      return parseDwgBinary(Buffer.from(raw, "binary"), fileName);
    }
    if (raw.startsWith(BINARY_DXF_SENTINEL)) {
      fileFormat = "DXF nhị phân";
      sourceBytes = raw.length;
      pairs = readBinaryDxfPairs(Buffer.from(raw, "binary"));
    } else {
      const contentToParse = raw.trim();
      if (!contentToParse || !contentToParse.includes("SECTION")) {
        return emptyParseResult(
          fileName,
          raw.length,
          "Chưa nạp bản vẽ hoặc tệp tin không đúng cấu trúc CAD. Vui lòng tải lên file DXF hợp lệ.",
        );
      }
      sourceBytes = contentToParse.length;
      pairs = readDxfPairs(contentToParse);
    }
  }

  const layerMap = new Map<
    string,
    {
      color: number;
      lineType: string;
      count: number;
      isFrozen: boolean;
      isOff: boolean;
      isLocked: boolean;
      lineWeight?: number;
    }
  >();
  const entities: DxfEntityRaw[] = [];
  const insertCounts = new Map<string, { count: number; attributes: Record<string, string> }>();
  const blockDefs = new Map<
    string,
    {
      name: string;
      basePoint: [number, number, number];
      isXref: boolean;
      isOverlay: boolean;
      xrefPath?: string;
      entities: DxfEntityRaw[];
      layerNames: Set<string>;
    }
  >();
  const header: NonNullable<DxfParseResult["header"]> = {};

  let section = "";
  let tableName = "";
  let currentBlock: ReturnType<typeof blockDefs.get> | undefined;
  let i = 0;

  /** Ghi nhận layer được thực thể tham chiếu (kể cả layer không khai trong bảng LAYER). */
  const touchLayer = (name: string, color?: number) => {
    const info = layerMap.get(name) || {
      color: color ?? 7,
      lineType: "CONTINUOUS",
      count: 0,
      isFrozen: false,
      isOff: false,
      isLocked: false,
    };
    info.count += 1;
    layerMap.set(name, info);
  };

  while (i < pairs.length) {
    const p = pairs[i];

    if (p.code !== 0) {
      i += 1;
      continue;
    }

    const marker = p.value.trim();

    if (marker === "SECTION") {
      const { group, next } = readGroup(pairs, i + 1);
      section = (group.find((g) => g.code === 2)?.value || "").trim().toUpperCase();
      tableName = "";
      i = next;
      continue;
    }

    if (marker === "ENDSEC") {
      section = "";
      tableName = "";
      currentBlock = undefined;
      i = readGroup(pairs, i + 1).next;
      continue;
    }

    if (section === "HEADER") {
      i = readGroup(pairs, i + 1).next;
      continue;
    }

    if (section === "TABLES") {
      if (marker === "TABLE") {
        const { group, next } = readGroup(pairs, i + 1);
        tableName = (group.find((g) => g.code === 2)?.value || "").trim().toUpperCase();
        i = next;
        continue;
      }
      if (marker === "ENDTAB") {
        tableName = "";
        i = readGroup(pairs, i + 1).next;
        continue;
      }
      if (marker === "LAYER" && tableName === "LAYER") {
        const { group, next } = readGroup(pairs, i + 1);
        let name = "0";
        let rawColor = 7;
        let lineType = "CONTINUOUS";
        let flags = 0;
        let lineWeight: number | undefined;
        for (const { code, value } of group) {
          if (code === 2) name = value.trim();
          else if (code === 62) rawColor = num(value, 7);
          else if (code === 6) lineType = value.trim();
          else if (code === 70) flags = num(value);
          else if (code === 370) lineWeight = numOrUndef(value);
        }
        const existing = layerMap.get(name);
        layerMap.set(name, {
          // Mã 62 âm = layer đang TẮT (giá trị tuyệt đối vẫn là màu ACI)
          color: Math.abs(rawColor) || 7,
          lineType,
          count: existing?.count ?? 0,
          isFrozen: Boolean(flags & 1),
          isLocked: Boolean(flags & 4),
          isOff: rawColor < 0,
          lineWeight,
        });
        i = next;
        continue;
      }
      i = readGroup(pairs, i + 1).next;
      continue;
    }

    if (section === "BLOCKS") {
      if (marker === "BLOCK") {
        const { group, next } = readGroup(pairs, i + 1);
        let name = "";
        let flags = 0;
        let xrefPath: string | undefined;
        let bx = 0;
        let by = 0;
        let bz = 0;
        for (const { code, value } of group) {
          if (code === 2) name = value.trim();
          else if (code === 1) xrefPath = value.trim();
          else if (code === 70) flags = num(value);
          else if (code === 10) bx = num(value);
          else if (code === 20) by = num(value);
          else if (code === 30) bz = num(value);
        }
        currentBlock = {
          name,
          basePoint: [bx, by, bz],
          // Cờ 70: bit 4 = khối là XREF, bit 8 = XREF kiểu overlay
          isXref: Boolean(flags & 4),
          isOverlay: Boolean(flags & 8),
          xrefPath: xrefPath || undefined,
          entities: [],
          layerNames: new Set<string>(),
        };
        if (name) blockDefs.set(name, currentBlock);
        i = next;
        continue;
      }
      if (marker === "ENDBLK") {
        currentBlock = undefined;
        i = readGroup(pairs, i + 1).next;
        continue;
      }
      if (PARSED_ENTITY_TYPES.has(marker as DxfEntityRaw["type"]) && currentBlock) {
        const { entity, next } = readEntityAt(
          pairs,
          i,
          `BLK-${currentBlock.name}-${currentBlock.entities.length + 1}`,
        );
        currentBlock.entities.push(entity);
        currentBlock.layerNames.add(entity.layer);
        i = next;
        continue;
      }
      i = readGroup(pairs, i + 1).next;
      continue;
    }

    if (section === "ENTITIES" && PARSED_ENTITY_TYPES.has(marker as DxfEntityRaw["type"])) {
      const { entity, next } = readEntityAt(pairs, i, `ENT-${entities.length + 1}`);
      entities.push(entity);
      touchLayer(entity.layer, entity.color);
      if (entity.type === "INSERT" && entity.blockName) {
        const b = insertCounts.get(entity.blockName) || { count: 0, attributes: {} };
        b.count += 1;
        if (entity.attributes) Object.assign(b.attributes, entity.attributes);
        insertCounts.set(entity.blockName, b);
      }
      i = next;
      continue;
    }

    i = readGroup(pairs, i + 1).next;
  }

  // ── HEADER: đọc riêng theo cặp mã 9/<tên biến> ──
  for (let h = 0; h + 1 < pairs.length; h += 1) {
    if (pairs[h].code !== 9) continue;
    const varName = pairs[h].value.trim().toUpperCase();
    const rest = pairs.slice(h + 1, h + 5).filter((q) => q.code !== 9 && q.code !== 0);
    const first = rest[0];
    if (!first) continue;
    if (varName === "$ACADVER") header.acadVer = first.value.trim();
    else if (varName === "$INSUNITS") {
      const u = numOrUndef(first.value);
      if (u !== undefined) {
        header.insUnits = u;
        header.insUnitsLabel = INSUNITS_LABELS[u] || "Không rõ";
      }
    } else if (varName === "$MEASUREMENT") header.measurement = numOrUndef(first.value);
    else if (varName === "$LTSCALE") header.ltScale = numOrUndef(first.value);
    else if (varName === "$EXTMIN" || varName === "$EXTMAX") {
      const x = rest.find((q) => q.code === 10);
      const y = rest.find((q) => q.code === 20);
      const z = rest.find((q) => q.code === 30);
      const pt = pointOf(
        x ? numOrUndef(x.value) : undefined,
        y ? numOrUndef(y.value) : undefined,
        z ? numOrUndef(z.value) : undefined,
      );
      if (pt) {
        if (varName === "$EXTMIN") header.extMin = pt;
        else header.extMax = pt;
      }
    }
  }

  // ── Khung bao: tính từ toạ độ THẬT của thực thể; bản vẽ không có toạ độ nào thì để 0 ──
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const e of entities) {
    for (const [x, y] of entityPoints(e)) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const hasBounds = minX !== Infinity;
  if (!hasBounds) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  // ── Layer ──
  const rawLayerNames = Array.from(layerMap.keys());
  const standardLayerMapping = normalizeCadLayers(rawLayerNames);

  const layers: DxfLayerInfo[] = rawLayerNames.map((name) => {
    const info = layerMap.get(name)!;
    const stdName = standardLayerMapping[name] || name;
    const isStd =
      stdName.includes("-") &&
      (stdName.startsWith("M-") ||
        stdName.startsWith("E-") ||
        stdName.startsWith("P-") ||
        stdName.startsWith("F-") ||
        stdName.startsWith("ELV-") ||
        stdName.startsWith("S-"));
    let discipline: DxfLayerInfo["discipline"] = "OTHER";

    if (stdName.startsWith("M-")) discipline = "M";
    else if (stdName.startsWith("E-")) discipline = "E";
    else if (stdName.startsWith("P-")) discipline = "P";
    else if (stdName.startsWith("F-")) discipline = "F";
    else if (stdName.startsWith("ELV-")) discipline = "ELV";
    else if (stdName.startsWith("S-")) discipline = "S";

    return {
      name,
      colorNumber: info.color,
      colorHex: ACI_TO_HEX[info.color] || "#a1a1aa",
      lineType: info.lineType,
      isStandardized: isStd,
      standardName: stdName,
      discipline,
      entityCount: info.count,
      isFrozen: info.isFrozen,
      isOff: info.isOff,
      isLocked: info.isLocked,
      lineWeight: info.lineWeight,
    };
  });

  // ── Khối: gộp định nghĩa trong section BLOCKS với số lần chèn thật ở model space ──
  const blockNames = new Set<string>([...blockDefs.keys(), ...insertCounts.keys()]);
  const blocks = Array.from(blockNames)
    // Khối XREF và khối hệ thống (*Model_Space…) không phải khối thiết bị để bóc khối lượng
    .filter((name) => !name.startsWith("*") && !blockDefs.get(name)?.isXref)
    .map((name) => {
      const def = blockDefs.get(name);
      const ins = insertCounts.get(name);
      let mappedBoq: string | undefined;
      const n = name.toUpperCase();
      if (n.includes("DIFFUSER")) mappedBoq = "HVAC-DIFF-600";
      else if (n.includes("VAV")) mappedBoq = "HVAC-VAV-BOX";
      else if (n.includes("SPRINKLER")) mappedBoq = "FP-SPK-PENDENT";
      else if (n.includes("VALVE")) mappedBoq = "PLUMB-VALVE-BF";
      else if (n.includes("PANEL") || n.includes("DB")) mappedBoq = "ELEC-PANEL-DB";

      return {
        name,
        count: ins?.count ?? 0,
        attributes: ins?.attributes ?? {},
        mappedBoqCode: mappedBoq,
        basePoint: def?.basePoint,
        entities: def?.entities,
      };
    });

  // ── XREF: đọc thật từ các khối mang cờ tham chiếu ngoài, không có thì danh sách rỗng ──
  const xrefs: DxfXrefInfo[] = Array.from(blockDefs.values())
    .filter((b) => b.isXref)
    .map((b, idx) => {
      const path = b.xrefPath || "";
      const baseName = path.split(/[\\/]/).pop() || `${b.name}.dwg`;
      const insertCount = entities.filter((e) => e.blockName === b.name).length;
      return {
        id: `XREF-${String(idx + 1).padStart(2, "0")}`,
        name: b.name,
        originalPath: path,
        path: path || undefined,
        fileName: baseName,
        type: b.isOverlay ? ("Overlay" as const) : ("Attach" as const),
        // Bản thân tệp DXF không cho biết tệp tham chiếu có tồn tại hay không —
        // `resolveXrefDependencies` mới đối soát với danh sách tệp thật của thư mục.
        status: "unloaded" as const,
        entityCount: insertCount,
        layerCount: b.layerNames.size,
        description: `Tham chiếu ngoài ${b.isOverlay ? "kiểu Overlay" : "kiểu Attach"} từ ${path || "(không ghi đường dẫn)"}`,
        isBound: false,
      };
    });

  // ── Chẩn đoán ──
  let hvacCount = 0;
  let elecCount = 0;
  let plumbCount = 0;
  let fireCount = 0;
  let elvCount = 0;
  let structCount = 0;
  let corruptedTextCount = 0;

  entities.forEach((e) => {
    const l = e.layer.toUpperCase();
    if (l.includes("DUCT") || l.includes("GIO") || l.includes("AHU") || l.includes("FCU"))
      hvacCount++;
    else if (l.includes("ELEC") || l.includes("TRAY") || l.includes("DIEN") || l.includes("PWR"))
      elecCount++;
    else if (l.includes("PIPE") || l.includes("NUOC") || l.includes("SAN") || l.includes("THOAT"))
      plumbCount++;
    else if (l.includes("FIRE") || l.includes("PCCC") || l.includes("SPK")) fireCount++;
    else if (l.includes("ELV") || l.includes("DATA") || l.includes("LAN") || l.includes("BMS"))
      elvCount++;
    else if (l.includes("GRID") || l.includes("TRUC") || l.includes("DAM") || l.includes("COT"))
      structCount++;

    if (e.textValue && e.textValue !== e.decodedText) {
      corruptedTextCount++;
    }
  });

  const stdLayersCount = layers.filter((l) => l.isStandardized).length;
  const nonStdLayersCount = layers.length - stdLayersCount;
  const unmappedBlocksCount = blocks.filter((b) => !b.mappedBoqCode).length;

  const recommendations: string[] = [];
  if (nonStdLayersCount > 0) {
    recommendations.push(
      `Tìm thấy ${nonStdLayersCount} layer chưa chuẩn AIA. Đề xuất chạy kịch bản .SCR để tự động đổi tên sang chuẩn MEPF.`,
    );
  }
  if (corruptedTextCount > 0) {
    recommendations.push(
      `Phát hiện ${corruptedTextCount} đoạn text bị lỗi font TCVN3/VNI hoặc mã CAD. Chạy Font Doctor để chuyển về UTF-8.`,
    );
  }
  if (xrefs.length > 0) {
    recommendations.push(
      `Bản vẽ tham chiếu ${xrefs.length} tệp ngoài (XREF). Nạp cả thư mục chứa các tệp này để đối soát và gộp trước khi phát hành.`,
    );
  }
  if (entities.length > 0) {
    recommendations.push(
      "Bản vẽ sẵn sàng đùn khối 3D AABB và thiết lập phân tầng hành lang kỹ thuật đa tầng (Multi-Tier Corridor).",
    );
  }
  if (entities.length === 0) {
    recommendations.push(
      "Section ENTITIES của tệp không có thực thể nào đọc được — kiểm tra lại tệp gốc trước khi chuẩn hóa.",
    );
  }

  const layerScore = layers.length > 0 ? (stdLayersCount / layers.length) * 40 : 20;
  const fontScore =
    entities.length > 0
      ? Math.max(0, 30 - (corruptedTextCount / (entities.length || 1)) * 100)
      : 30;
  const geomScore = entities.length > 0 ? 30 : 0;
  const healthScore = Math.min(100, Math.round(layerScore + fontScore + geomScore));

  const diagnostic: DxfDiagnosticReport = {
    healthScore,
    totalEntities: entities.length,
    totalLayers: layers.length,
    standardLayersCount: stdLayersCount,
    nonStandardLayersCount: nonStdLayersCount,
    corruptedTextCount,
    unmappedBlocksCount,
    boundingDimensions: {
      minX: Math.round(minX),
      maxX: Math.round(maxX),
      minY: Math.round(minY),
      maxY: Math.round(maxY),
      widthMm: Math.round(maxX - minX),
      lengthMm: Math.round(maxY - minY),
    },
    disciplineBreakdown: {
      hvac: hvacCount,
      electrical: elecCount,
      plumbing: plumbCount,
      firefighting: fireCount,
      elv: elvCount,
      structural: structCount,
    },
    recommendations,
  };

  const spatialRoutes = convertDxfToSpatialRoutes(entities);

  return {
    fileName,
    sourcePath: fileName,
    fileFormat,
    fileSizeBytes: sourceBytes,
    header,
    layers,
    entities,
    blocks,
    xrefs,
    diagnostic,
    spatialRoutes,
  };
}

/**
 * Tự động đối soát và khớp các tệp XREF trong danh sách tệp của thư mục tải lên.
 */
export function resolveXrefDependencies(
  masterResult: DxfParseResult,
  folderFiles: Array<{ name: string; content?: string }>,
): DxfXrefInfo[] {
  const fileNamesSet = new Set(folderFiles.map((f) => f.name.toLowerCase()));

  return masterResult.xrefs.map((xref) => {
    const targetName = xref.fileName.toLowerCase();
    const isFound =
      fileNamesSet.has(targetName) ||
      fileNamesSet.has(targetName.replace(/\.dwg$/, ".dxf")) ||
      folderFiles.some(
        (f) =>
          f.name.toLowerCase().includes(targetName.replace(/\.[^.]+$/, "")) ||
          targetName.includes(f.name.toLowerCase().replace(/\.[^.]+$/, "")),
      );

    return {
      ...xref,
      status: isFound ? "resolved" : "missing",
      resolvedFileName: isFound ? xref.fileName : undefined,
    };
  });
}

/**
 * Gộp (Bind) một tệp XREF vào mô hình Master (chuyển các layer thành XREF$name$layer)
 */
export function bindXrefToMaster(masterResult: DxfParseResult, xrefId: string): DxfParseResult {
  const updatedXrefs = masterResult.xrefs.map((x) =>
    x.id === xrefId
      ? {
          ...x,
          isBound: !x.isBound,
          type: (x.isBound ? "Overlay" : "Attach") as "Overlay" | "Attach",
        }
      : x,
  );

  return {
    ...masterResult,
    xrefs: updatedXrefs,
  };
}

/**
 * Chuyển đổi các thực thể tuyến (LINE, LWPOLYLINE) từ 2D DXF thành bao không gian 3D Bounding Box (AABB)
 * kèm cao độ phân tầng hành lang kỹ thuật.
 */
export function convertDxfToSpatialRoutes(
  entities: DxfEntityRaw[],
  defaultFloorHeightMm = 3400,
): Extruded3dRoute[] {
  const routes: Extruded3dRoute[] = [];

  // Filter line/poly entities that represent centerline routes
  const centerlineEntities = entities.filter(
    (e) =>
      (e.type === "LINE" || e.type === "LWPOLYLINE" || e.type === "POLYLINE") &&
      (e.coordinates.start || (e.coordinates.points && e.coordinates.points.length >= 2)),
  );

  let routeIndex = 1;

  for (const ent of centerlineEntities) {
    let startPt: [number, number, number] = [0, 0, 0];
    let endPt: [number, number, number] = [0, 0, 0];

    if (ent.type === "LINE" && ent.coordinates.start && ent.coordinates.end) {
      startPt = ent.coordinates.start;
      endPt = ent.coordinates.end;
    } else if (ent.coordinates.points && ent.coordinates.points.length >= 2) {
      startPt = ent.coordinates.points[0];
      endPt = ent.coordinates.points[ent.coordinates.points.length - 1];
    }

    const length = Math.round(
      Math.hypot(endPt[0] - startPt[0], endPt[1] - startPt[1], endPt[2] - startPt[2]),
    );

    if (length < 200) continue; // Ignore tiny ticks

    const layerUpper = ent.layer.toUpperCase();
    let system: Extruded3dRoute["system"] = "OTHER";
    let corridorTier: Extruded3dRoute["corridorTier"] = "Tier 2 (Điện)";
    let sectionDimensions = "300 x 100 mm";
    let widthMm = 300;
    let heightOrDiaMm = 100;
    let insulationMm = 0;
    let elevationBopMm = 2800;
    let soffitClearanceMm = 300;
    let combineStatus: Extruded3dRoute["combineStatus"] = "clean";

    if (layerUpper.includes("DUCT") || layerUpper.includes("GIO") || layerUpper.includes("M-")) {
      system = "HVAC";
      corridorTier = "Tier 1 (Gió)";
      sectionDimensions = "800 x 400 mm";
      widthMm = 800;
      heightOrDiaMm = 400;
      insulationMm = 25;
      elevationBopMm = 2875;
      soffitClearanceMm = 225;
      combineStatus = "verified";
    } else if (
      layerUpper.includes("PIPE") ||
      layerUpper.includes("NUOC") ||
      layerUpper.includes("P-")
    ) {
      system = "WATER";
      corridorTier = "Tier 3 (Nước)";
      if (layerUpper.includes("DRAIN") || layerUpper.includes("THOAT")) {
        sectionDimensions = "Ø114 mm (uPVC)";
        widthMm = 114;
        heightOrDiaMm = 114;
        elevationBopMm = 2250;
        soffitClearanceMm = 180;
        combineStatus = "clash_risk"; // Requires slope inspection
      } else {
        sectionDimensions = "Ø168 mm (DN150 Chiller)";
        widthMm = 168;
        heightOrDiaMm = 168;
        insulationMm = 32;
        elevationBopMm = 2368;
        soffitClearanceMm = 450;
        combineStatus = "clean";
      }
    } else if (
      layerUpper.includes("FIRE") ||
      layerUpper.includes("PCCC") ||
      layerUpper.includes("F-")
    ) {
      system = "FIRE";
      corridorTier = "Tier 3 (Nước)";
      sectionDimensions = "Ø114 mm (DN100)";
      widthMm = 114;
      heightOrDiaMm = 114;
      elevationBopMm = 2550;
      soffitClearanceMm = 400;
      combineStatus = "verified";
    } else if (
      layerUpper.includes("ELEC") ||
      layerUpper.includes("TRAY") ||
      layerUpper.includes("E-")
    ) {
      system = "ELECTRICAL";
      corridorTier = "Tier 2 (Điện)";
      sectionDimensions = "400 x 100 mm";
      widthMm = 400;
      heightOrDiaMm = 100;
      elevationBopMm = 2800;
      soffitClearanceMm = 450;
      combineStatus = "verified";
    }

    const minX = Math.min(startPt[0], endPt[0]) - widthMm / 2;
    const maxX = Math.max(startPt[0], endPt[0]) + widthMm / 2;
    const minY = Math.min(startPt[1], endPt[1]) - widthMm / 2;
    const maxY = Math.max(startPt[1], endPt[1]) + widthMm / 2;
    const minZ = elevationBopMm;
    const maxZ = elevationBopMm + heightOrDiaMm + insulationMm * 2;

    routes.push({
      id: `R-${system.substring(0, 4)}-${String(routeIndex).padStart(2, "0")}`,
      system,
      name: `Tuyến ${system} (${ent.layer}) Trục Centerline ${routeIndex}`,
      layer: ent.layer,
      startPoint: [Math.round(startPt[0]), Math.round(startPt[1]), elevationBopMm],
      endPoint: [Math.round(endPt[0]), Math.round(endPt[1]), elevationBopMm],
      lengthMm: length,
      sectionDimensions,
      widthMm,
      heightOrDiaMm,
      insulationMm,
      elevationBopMm,
      corridorTier,
      combineStatus,
      soffitClearanceMm,
      boundingBox3d: {
        min: [Math.round(minX), Math.round(minY), Math.round(minZ)],
        max: [Math.round(maxX), Math.round(maxY), Math.round(maxZ)],
      },
    });

    routeIndex++;
    if (routes.length >= 25) break; // Keep manageable preview
  }

  return routes;
}

/**
 * Xuất kịch bản AutoCAD Script (.SCR) để tự động đổi tên layer, gán màu và purge layer rác trong AutoCAD.
 */
export function generateStandardizedAutocadScript(layers: DxfLayerInfo[]): string {
  let script = `;; =====================================================================\n`;
  script += `;; XBoss CAD Standardization Batch Script (.SCR)\n`;
  script += `;; Tiêu chuẩn: AIA / BS1192 / TT 12/2021/TT-BXD\n`;
  script += `;; =====================================================================\n`;
  script += `CMDECHO 0\n`;
  script += `EXPERT 5\n\n`;

  // Rename & standardize layers
  for (const l of layers) {
    if (l.name !== l.standardName) {
      script += `-RENAME LA "${l.name}" "${l.standardName}"\n`;
      script += `-LAYER C ${l.colorNumber} "${l.standardName}" L "${l.lineType}" "${l.standardName}" \n`;
    }
  }

  // Purge unused layers
  script += `-PURGE LA * N\n`;
  script += `-PURGE B * N\n`;
  script += `AUDIT Y\n`;
  script += `QSAVE\n`;
  script += `CMDECHO 1\n`;
  script += `(princ "\\n[XBoss] Hoan tat chuan hoa ban ve CAD theo tieu chuan AIA/BS1192.")\n`;

  return script;
}

/** Số thực an toàn cho tệp DXF (NaN/Infinity ghi ra sẽ làm AutoCAD báo lỗi đọc tệp). */
function dxfNum(v: number | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Bộ ba toạ độ của một điểm, khuyết thì 0. */
function ptXYZ(p?: [number, number, number]): [number, number, number] {
  return [dxfNum(p?.[0]), dxfNum(p?.[1]), dxfNum(p?.[2])];
}

/** Số đo hiển thị: bỏ đuôi 0 thừa để "4000.00" ra "4000" đúng như AutoCAD in ra. */
function formatMeasurement(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/**
 * Chiều cao chữ dùng khi thực thể nguồn không khai mã nhóm 40 — R12 bắt buộc TEXT phải có mã này.
 * Lấy **trung vị chiều cao chữ thật của chính bản vẽ** để chữ bổ khuyết không lạc cỡ; bản vẽ không
 * có chữ nào khai chiều cao thì mới dùng 250 (cỡ chữ ghi chú thường gặp của bản vẽ MEPF hệ mm).
 */
function resolveDefaultTextHeight(entities: DxfEntityRaw[]): number {
  const heights = entities
    .map((e) => e.textHeight)
    .filter((h): h is number => typeof h === "number" && Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  if (heights.length === 0) return 250;
  return heights[Math.floor(heights.length / 2)];
}

/** Rời rạc hoá ELLIPSE thành đa tuyến — R12 không có thực thể ELLIPSE. */
function ellipseToPoints(
  center: [number, number, number],
  majorAxis: [number, number, number],
  ratio: number,
  segments = 48,
): Array<[number, number, number]> {
  const majorLen = Math.hypot(majorAxis[0], majorAxis[1]);
  if (majorLen === 0) return [];
  const rot = Math.atan2(majorAxis[1], majorAxis[0]);
  const minorLen = majorLen * (ratio > 0 ? ratio : 1);
  const pts: Array<[number, number, number]> = [];
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    const ex = majorLen * Math.cos(t);
    const ey = minorLen * Math.sin(t);
    pts.push([
      center[0] + ex * Math.cos(rot) - ey * Math.sin(rot),
      center[1] + ex * Math.sin(rot) + ey * Math.cos(rot),
      center[2],
    ]);
  }
  return pts;
}

/**
 * Ghi một đa tuyến theo cấu trúc R12: POLYLINE + các VERTEX + SEQEND.
 *
 * R12 **không có** thực thể LWPOLYLINE (mãi R14 mới có), nên bản ghi trước đây vừa khai AC1009 vừa
 * ghi LWPOLYLINE là tự mâu thuẫn. Độ cong từng đoạn (mã 42) được VERTEX của R12 hỗ trợ sẵn nên
 * cung tròn trong đa tuyến giữ nguyên hình, không phải bẻ thành đoạn thẳng.
 */
function writePolylineR12(
  layer: string,
  colStr: string,
  points: Array<[number, number, number]>,
  bulges: number[] | undefined,
  closed: boolean,
): string {
  let out = `0\r\nPOLYLINE\r\n8\r\n${layer}\r\n${colStr}66\r\n1\r\n70\r\n${closed ? 1 : 0}\r\n`;
  out += `10\r\n0.0\r\n20\r\n0.0\r\n30\r\n${dxfNum(points[0]?.[2])}\r\n`;
  points.forEach((pt, idx) => {
    out += `0\r\nVERTEX\r\n8\r\n${layer}\r\n10\r\n${dxfNum(pt[0])}\r\n20\r\n${dxfNum(pt[1])}\r\n30\r\n${dxfNum(pt[2])}\r\n`;
    const b = bulges?.[idx];
    if (typeof b === "number" && b !== 0) out += `42\r\n${b}\r\n`;
  });
  out += `0\r\nSEQEND\r\n8\r\n${layer}\r\n`;
  return out;
}

/** Ghi một TEXT R12 kèm chiều cao / góc xoay / kiểu chữ thật của thực thể nguồn. */
function writeTextR12(
  layer: string,
  colStr: string,
  pos: [number, number, number],
  value: string,
  opts: {
    height: number;
    rotation?: number;
    widthFactor?: number;
    style?: string;
    /** Canh lề (mã 72/73) kèm điểm canh thứ nhất (mã 10) — thiếu thì chữ nhảy vị trí khi mở lại */
    align?: { horizontal: number; vertical: number };
    firstPoint?: [number, number, number];
  },
): string {
  // Chữ có canh lề: mã 10 là điểm canh thứ nhất, mã 11 mới là điểm đặt thật
  const p10 = opts.align && opts.firstPoint ? opts.firstPoint : pos;
  let out = `0\r\nTEXT\r\n8\r\n${layer}\r\n${colStr}`;
  out += `10\r\n${p10[0]}\r\n20\r\n${p10[1]}\r\n30\r\n${p10[2]}\r\n40\r\n${opts.height}\r\n1\r\n${value}\r\n`;
  if (opts.align) {
    out += `72\r\n${opts.align.horizontal}\r\n73\r\n${opts.align.vertical}\r\n`;
    out += `11\r\n${pos[0]}\r\n21\r\n${pos[1]}\r\n31\r\n${pos[2]}\r\n`;
  }
  if (typeof opts.rotation === "number" && opts.rotation !== 0) out += `50\r\n${opts.rotation}\r\n`;
  if (typeof opts.widthFactor === "number" && opts.widthFactor > 0 && opts.widthFactor !== 1)
    out += `41\r\n${opts.widthFactor}\r\n`;
  out += `7\r\n${opts.style || "STANDARD"}\r\n`;
  return out;
}

/**
 * Ghi một thực thể đã phân tích thành khối mã nhóm DXF R12.
 *
 * Hai cam kết:
 * 1. **Không bịa dữ liệu** — thiếu toạ độ/bán kính/góc thì không tự chế giá trị thay thế.
 * 2. **Không nuốt mất thực thể** — loại hình R12 không có (HATCH, MULTILEADER) hoặc thiếu dữ liệu
 *    để dựng hình vẫn để lại POINT tại điểm neo đã biết, đúng tiền lệ đã chốt cho DIMENSION ở M98.
 */
/** Khung bao bản vẽ, dùng để cắt đường dựng hình dài vô hạn. */
interface DrawingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Cắt một đường dài vô hạn (XLINE: cả hai phía; RAY: một phía) theo khung bao bản vẽ, bằng thuật
 * toán slab. Trả `null` khi đường không cắt qua khung bao.
 *
 * Cắt theo khung bao chứ không kéo dài theo đường chéo: kéo dài làm khung bao bản vẽ phình ra khỏi
 * phạm vi thật, kéo theo `$EXTMIN/$EXTMAX` sai và lệnh ZOOM EXTENTS trong AutoCAD nhảy ra xa.
 */
function clipInfiniteLine(
  base: [number, number, number],
  dir: [number, number, number],
  box: DrawingBox,
  onlyForward: boolean,
): [[number, number, number], [number, number, number]] | null {
  let tMin = onlyForward ? 0 : -Infinity;
  let tMax = Infinity;

  const slab = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0; // song song với cặp cạnh này
    const t = q / p;
    if (p < 0) {
      if (t > tMax) return false;
      if (t > tMin) tMin = t;
    } else {
      if (t < tMin) return false;
      if (t < tMax) tMax = t;
    }
    return true;
  };

  if (!slab(-dir[0], base[0] - box.minX)) return null;
  if (!slab(dir[0], box.maxX - base[0])) return null;
  if (!slab(-dir[1], base[1] - box.minY)) return null;
  if (!slab(dir[1], box.maxY - base[1])) return null;
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) return null;

  return [
    [base[0] + dir[0] * tMin, base[1] + dir[1] * tMin, base[2]],
    [base[0] + dir[0] * tMax, base[1] + dir[1] * tMax, base[2]],
  ];
}

function writeEntityR12(
  ent: DxfEntityRaw,
  layer: string,
  defaultTextHeight: number,
  drawingBox?: DrawingBox,
): string {
  // Thuộc tính chung phải bám theo MỌI thực thể ghi ra, nếu không xuất tệp là mất: màu riêng,
  // kiểu nét riêng, bề dày đùn, tỷ lệ nét đứt, cờ ẩn, không gian giấy và hướng đùn (bản vẽ lật
  // gương có hướng đùn (0,0,-1) — mất nó là hình bị lật ngược khi mở lại).
  let colStr = ent.color ? `62\r\n${ent.color}\r\n` : "";
  if (ent.lineType) colStr += `6\r\n${ent.lineType}\r\n`;
  if (ent.isPaperSpace) colStr += `67\r\n1\r\n`;
  if (typeof ent.thickness === "number" && ent.thickness !== 0)
    colStr += `39\r\n${ent.thickness}\r\n`;
  if (typeof ent.lineTypeScale === "number" && ent.lineTypeScale !== 1)
    colStr += `48\r\n${ent.lineTypeScale}\r\n`;
  if (ent.isInvisible) colStr += `60\r\n1\r\n`;
  // Hướng đùn nằm chung trong khối thuộc tính: nhánh POLYLINE ghi nó vào chính nhóm POLYLINE
  // (trước các VERTEX), nếu tách ra ghi ở cuối thì nó rơi nhầm sang thực thể SEQEND.
  if (ent.extrusion) {
    colStr += `210\r\n${ent.extrusion[0]}\r\n220\r\n${ent.extrusion[1]}\r\n230\r\n${ent.extrusion[2]}\r\n`;
  }
  const c = ent.coordinates;

  /** Dấu vết tối giản tại điểm neo — thực thể không dựng được hình vẫn không biến mất im lặng. */
  const pointTrace = (): string => {
    const anchor = c.center || c.start || c.end || c.points?.[0] || c.corners?.[0];
    if (!anchor) return "";
    const [x, y, z] = ptXYZ(anchor);
    return `0\r\nPOINT\r\n8\r\n${layer}\r\n${colStr}10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n`;
  };

  switch (ent.type) {
    case "LINE": {
      if (!c.start || !c.end) return pointTrace();
      const [sx, sy, sz] = ptXYZ(c.start);
      const [ex, ey, ez] = ptXYZ(c.end);
      return (
        `0\r\nLINE\r\n8\r\n${layer}\r\n${colStr}` +
        `10\r\n${sx}\r\n20\r\n${sy}\r\n30\r\n${sz}\r\n` +
        `11\r\n${ex}\r\n21\r\n${ey}\r\n31\r\n${ez}\r\n`
      );
    }

    case "LWPOLYLINE":
    case "POLYLINE":
    case "SPLINE":
    case "LEADER": {
      const pts = c.points || [];
      if (pts.length === 0) return pointTrace();
      if (pts.length === 1) {
        const [x, y, z] = ptXYZ(pts[0]);
        return `0\r\nPOINT\r\n8\r\n${layer}\r\n${colStr}10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n`;
      }
      return writePolylineR12(layer, colStr, pts, c.bulges, Boolean(c.closed));
    }

    case "CIRCLE": {
      if (!c.center || !c.radius) return pointTrace();
      const [x, y, z] = ptXYZ(c.center);
      return (
        `0\r\nCIRCLE\r\n8\r\n${layer}\r\n${colStr}` +
        `10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n40\r\n${c.radius}\r\n`
      );
    }

    case "ARC": {
      // Cung tròn R12 bắt buộc có cả bán kính lẫn 2 góc; thiếu thì không tự đặt 0°–180° như bản cũ
      if (!c.center || !c.radius || c.startAngle === undefined || c.endAngle === undefined) {
        return pointTrace();
      }
      const [x, y, z] = ptXYZ(c.center);
      return (
        `0\r\nARC\r\n8\r\n${layer}\r\n${colStr}` +
        `10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n40\r\n${c.radius}\r\n` +
        `50\r\n${c.startAngle}\r\n51\r\n${c.endAngle}\r\n`
      );
    }

    case "ELLIPSE": {
      // R12 không có ELLIPSE — rời rạc hoá thành đa tuyến từ chính tâm/bán trục/tỷ lệ của tệp gốc
      if (!c.center || !c.majorAxis) return pointTrace();
      const pts = ellipseToPoints(ptXYZ(c.center), ptXYZ(c.majorAxis), c.axisRatio ?? 1);
      if (pts.length < 2) return pointTrace();
      return writePolylineR12(layer, colStr, pts, undefined, true);
    }

    case "SOLID":
    case "3DFACE": {
      const corners = c.corners || [];
      if (corners.length < 3) return pointTrace();
      const [p1, p2, p3] = [ptXYZ(corners[0]), ptXYZ(corners[1]), ptXYZ(corners[2])];
      const p4 = ptXYZ(corners[3] || corners[2]);
      return (
        `0\r\n${ent.type}\r\n8\r\n${layer}\r\n${colStr}` +
        `10\r\n${p1[0]}\r\n20\r\n${p1[1]}\r\n30\r\n${p1[2]}\r\n` +
        `11\r\n${p2[0]}\r\n21\r\n${p2[1]}\r\n31\r\n${p2[2]}\r\n` +
        `12\r\n${p3[0]}\r\n22\r\n${p3[1]}\r\n32\r\n${p3[2]}\r\n` +
        `13\r\n${p4[0]}\r\n23\r\n${p4[1]}\r\n33\r\n${p4[2]}\r\n`
      );
    }

    case "POINT": {
      if (!c.center) return "";
      const [x, y, z] = ptXYZ(c.center);
      return `0\r\nPOINT\r\n8\r\n${layer}\r\n${colStr}10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n`;
    }

    case "TEXT":
    case "MTEXT": {
      // R12 không có MTEXT — hạ thành TEXT, giữ nguyên chiều cao / góc xoay / kiểu chữ thật
      const value = ent.decodedText || ent.textValue || "";
      if (!value) return pointTrace();
      const pos = ptXYZ(c.center || c.alignPoint);
      return writeTextR12(layer, colStr, pos, value, {
        height: dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight,
        rotation: ent.rotation,
        widthFactor: ent.widthFactor,
        style: ent.textStyle,
        align: ent.textAlign,
        firstPoint: ent.coordinates.alignPoint,
      });
    }

    case "INSERT": {
      const bName = ent.blockName;
      if (!bName || !c.center) return pointTrace();
      const [x, y, z] = ptXYZ(c.center);
      const [sx, sy, sz] = ent.scale ?? [1, 1, 1];
      let out = `0\r\nINSERT\r\n8\r\n${layer}\r\n${colStr}2\r\n${bName}\r\n`;
      out += `10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n`;
      out += `41\r\n${dxfNum(sx, 1)}\r\n42\r\n${dxfNum(sy, 1)}\r\n43\r\n${dxfNum(sz, 1)}\r\n`;
      out += `50\r\n${dxfNum(ent.rotation)}\r\n`;
      return out;
    }

    case "DIMENSION": {
      // R12 đòi mỗi DIMENSION kèm block hình học `*D<n>`; bộ ghi này không sinh block đó nên hạ
      // kích thước thành LINE (nối đúng HAI ĐẦU ĐO ở mã 13/14) + TEXT (số đo). Mã 10 là điểm đặt
      // đường kích thước, KHÔNG phải đầu đo — không dùng nó để vẽ đường đo (M98 §1(b)).
      let out = "";
      const measure = c.measurePoints;
      if (measure) {
        const [a, b] = [ptXYZ(measure[0]), ptXYZ(measure[1])];
        out +=
          `0\r\nLINE\r\n8\r\n${layer}\r\n${colStr}` +
          `10\r\n${a[0]}\r\n20\r\n${a[1]}\r\n30\r\n${a[2]}\r\n` +
          `11\r\n${b[0]}\r\n21\r\n${b[1]}\r\n31\r\n${b[2]}\r\n`;
      }

      // Chữ kích thước: ưu tiên chữ ghi đè của người vẽ, không có thì dùng số đo thật ở mã 42.
      // Không tự tính khoảng cách để điền vào khi tệp không khai số đo — đó là số bịa.
      const override = ent.decodedText || ent.textValue || "";
      const label =
        override && override !== "<>"
          ? override
          : typeof ent.measurement === "number"
            ? formatMeasurement(ent.measurement)
            : "";

      if (label) {
        const anchor =
          c.textMidPoint ||
          (measure
            ? ([
                (measure[0][0] + measure[1][0]) / 2,
                (measure[0][1] + measure[1][1]) / 2,
                (measure[0][2] + measure[1][2]) / 2,
              ] as [number, number, number])
            : c.center || c.start);
        out += writeTextR12(layer, colStr, ptXYZ(anchor), label, {
          height: dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight,
          rotation: ent.rotation,
          style: ent.textStyle,
        });
      }

      return out || pointTrace();
    }

    case "ATTDEF": {
      // ATTDEF là thực thể hợp lệ của R12 — giữ nguyên thẻ và câu nhắc để khối còn bóc được
      // thuộc tính (mã hiệu thiết bị, kích thước) về sau.
      const pos = ptXYZ(c.center);
      let out = `0\r\nATTDEF\r\n8\r\n${layer}\r\n${colStr}`;
      out += `10\r\n${pos[0]}\r\n20\r\n${pos[1]}\r\n30\r\n${pos[2]}\r\n`;
      out += `40\r\n${dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight}\r\n`;
      out += `1\r\n${ent.decodedText || ent.textValue || ""}\r\n`;
      out += `3\r\n${ent.attributePrompt || ent.attributeTag || ""}\r\n`;
      out += `2\r\n${ent.attributeTag || "TAG"}\r\n70\r\n0\r\n`;
      if (typeof ent.rotation === "number" && ent.rotation !== 0)
        out += `50\r\n${ent.rotation}\r\n`;
      out += `7\r\n${ent.textStyle || "STANDARD"}\r\n`;
      return out;
    }

    case "SHAPE": {
      // SHAPE cũng là thực thể R12 hợp lệ
      if (!c.center || !ent.blockName) return pointTrace();
      const [x, y, z] = ptXYZ(c.center);
      let out = `0\r\nSHAPE\r\n8\r\n${layer}\r\n${colStr}`;
      out += `10\r\n${x}\r\n20\r\n${y}\r\n30\r\n${z}\r\n`;
      out += `40\r\n${dxfNum(ent.textHeight, defaultTextHeight)}\r\n2\r\n${ent.blockName}\r\n`;
      if (typeof ent.rotation === "number" && ent.rotation !== 0)
        out += `50\r\n${ent.rotation}\r\n`;
      return out;
    }

    case "XLINE":
    case "RAY": {
      // Đường dựng hình dài vô hạn: R12 không có XLINE/RAY. Cắt theo khung bao bản vẽ thành LINE
      // hữu hạn — giữ đúng vị trí và phương của đường gốc, chỉ giới hạn chiều dài.
      if (!c.start || !c.direction || !drawingBox) return pointTrace();
      const base = ptXYZ(c.start);
      const dir = ptXYZ(c.direction);
      if (Math.hypot(dir[0], dir[1]) === 0) return pointTrace();
      // RAY chỉ chạy về một phía kể từ điểm gốc; XLINE chạy cả hai phía
      const doan = clipInfiniteLine(base, dir, drawingBox, ent.type === "RAY");
      if (!doan) return pointTrace();
      const [a, z] = doan;
      return (
        `0\r\nLINE\r\n8\r\n${layer}\r\n${colStr}` +
        `10\r\n${a[0]}\r\n20\r\n${a[1]}\r\n30\r\n${a[2]}\r\n` +
        `11\r\n${z[0]}\r\n21\r\n${z[1]}\r\n31\r\n${z[2]}\r\n`
      );
    }

    case "MLINE": {
      // MLINE (R13+) hạ thành đa tuyến đi theo trục — giữ đúng tuyến, mất phần nét kép hai bên
      const pts = c.points || [];
      if (pts.length < 2) return pointTrace();
      return writePolylineR12(layer, colStr, pts, undefined, Boolean(c.closed));
    }

    case "TRACE": {
      const corners = c.corners || [];
      if (corners.length < 4) return pointTrace();
      const [p1, p2, p3, p4] = corners.map(ptXYZ);
      return (
        `0\r\nTRACE\r\n8\r\n${layer}\r\n${colStr}` +
        `10\r\n${p1[0]}\r\n20\r\n${p1[1]}\r\n30\r\n${p1[2]}\r\n` +
        `11\r\n${p2[0]}\r\n21\r\n${p2[1]}\r\n31\r\n${p2[2]}\r\n` +
        `12\r\n${p3[0]}\r\n22\r\n${p3[1]}\r\n32\r\n${p3[2]}\r\n` +
        `13\r\n${p4[0]}\r\n23\r\n${p4[1]}\r\n33\r\n${p4[2]}\r\n`
      );
    }

    case "HATCH": {
      // R12 không có HATCH. Ghi lại ĐƯỜNG BAO vùng tô dưới dạng đa tuyến khép kín — giữ đúng
      // phạm vi vùng tô (vùng bảo ôn, vùng cắt qua…), chỉ mất phần nét gạch bên trong.
      const paths = c.boundaryPaths || [];
      if (paths.length === 0) return pointTrace();
      let out = "";
      for (const path of paths) {
        if (path.points.length < 2) continue;
        out += writePolylineR12(layer, colStr, path.points, path.bulges, true);
      }
      return out || pointTrace();
    }

    case "MULTILEADER": {
      // R12 không có MULTILEADER: hạ thành đường dẫn (đa tuyến) + chữ chú thích tại điểm đặt chữ
      let out = "";
      const pts = c.points || [];
      if (pts.length >= 2) out += writePolylineR12(layer, colStr, pts, undefined, false);
      const value = ent.decodedText || ent.textValue || "";
      if (value) {
        out += writeTextR12(layer, colStr, ptXYZ(c.center || pts[pts.length - 1]), value, {
          height: dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight,
          rotation: ent.rotation,
          style: ent.textStyle,
        });
      }
      return out || pointTrace();
    }

    default:
      // WIPEOUT / IMAGE / TOLERANCE: R12 không có, và nội dung (ảnh raster, khung dung sai) không
      // dựng lại được bằng thực thể R12. Có đường bao cắt thì giữ đường bao, không thì để lại
      // POINT tại điểm neo — không thực thể nào biến mất im lặng.
      if (c.points && c.points.length >= 2) {
        return writePolylineR12(layer, colStr, c.points, undefined, Boolean(c.closed));
      }
      return pointTrace();
  }
}

/**
 * Xuất `DxfParseResult` thành chuỗi DXF ASCII hoàn chỉnh chuẩn AutoCAD R12 (AC1009), đủ các phần
 * HEADER, TABLES (VPORT, LTYPE, LAYER, STYLE, APPID, BLOCK_RECORD), BLOCKS, ENTITIES, EOF.
 *
 * Cấu trúc ghi ra không có handle và không có section OBJECTS nên chỉ hợp lệ ở mức R12 — khai đúng
 * AC1009 để AutoCAD không kỳ vọng cấu trúc R2000 (M98 §1(b)). Kéo theo: DIMENSION hạ thành
 * LINE + TEXT, MTEXT hạ thành TEXT, đa tuyến ghi bằng POLYLINE/VERTEX (R12 chưa có LWPOLYLINE).
 *
 * **Không bịa dữ liệu:** bản vẽ không có nét thì tệp xuất ra cũng không có nét — bản cũ chèn sẵn
 * một bộ hình học MEPF "minh hoạ" (trục lưới, ống gió, máng cáp, sprinkler) và định nghĩa khối hình
 * chữ thập; cả hai đều là hình do máy chế ra, nay đã bỏ.
 */
export function exportDxf(
  parsed: DxfParseResult,
  options?: { applyStandardLayers?: boolean; decodeUnicodeText?: boolean },
): string {
  const useStandardLayers = options?.applyStandardLayers ?? true;
  const layers = parsed.layers && parsed.layers.length > 0 ? parsed.layers : [];

  // Ánh xạ tên layer theo tùy chọn chuẩn hóa
  const layerMap = new Map<string, string>();
  layers.forEach((l) => {
    layerMap.set(l.name, useStandardLayers && l.standardName ? l.standardName : l.name);
  });

  const getLayer = (name: string) => layerMap.get(name) || name || "0";
  const entities = parsed.entities || [];
  const defaultTextHeight = resolveDefaultTextHeight(entities);
  // Khung bao bản vẽ — dùng để cắt đường dựng hình dài vô hạn (XLINE/RAY) thành LINE hữu hạn
  const bao = parsed.diagnostic?.boundingDimensions;
  const drawingBox: DrawingBox | undefined =
    bao && (bao.maxX > bao.minX || bao.maxY > bao.minY)
      ? { minX: bao.minX, maxX: bao.maxX, minY: bao.minY, maxY: bao.maxY }
      : undefined;

  let dxf = "";

  // 1. SECTION HEADER
  dxf += "0\r\nSECTION\r\n2\r\nHEADER\r\n";
  dxf += "9\r\n$ACADVER\r\n1\r\nAC1009\r\n"; // R12 — đúng cấu trúc thực sự ghi ra bên dưới
  // Đơn vị vẽ giữ nguyên của bản vẽ gốc; tệp gốc không khai thì mới mặc định hệ mét MEPF (mm)
  dxf += `9\r\n$INSUNITS\r\n70\r\n${parsed.header?.insUnits ?? 4}\r\n`;
  dxf += `9\r\n$MEASUREMENT\r\n70\r\n${parsed.header?.measurement ?? 1}\r\n`;
  if (parsed.diagnostic?.boundingDimensions) {
    const b = parsed.diagnostic.boundingDimensions;
    dxf += `9\r\n$EXTMIN\r\n10\r\n${dxfNum(b.minX)}\r\n20\r\n${dxfNum(b.minY)}\r\n30\r\n0.0\r\n`;
    dxf += `9\r\n$EXTMAX\r\n10\r\n${dxfNum(b.maxX)}\r\n20\r\n${dxfNum(b.maxY)}\r\n30\r\n0.0\r\n`;
    dxf += `9\r\n$LIMMIN\r\n10\r\n${dxfNum(b.minX)}\r\n20\r\n${dxfNum(b.minY)}\r\n`;
    dxf += `9\r\n$LIMMAX\r\n10\r\n${dxfNum(b.maxX)}\r\n20\r\n${dxfNum(b.maxY)}\r\n`;
  }
  dxf += "0\r\nENDSEC\r\n";

  // 2. SECTION TABLES
  dxf += "0\r\nSECTION\r\n2\r\nTABLES\r\n";

  // VPORT Table
  dxf += "0\r\nTABLE\r\n2\r\nVPORT\r\n70\r\n1\r\n";
  dxf +=
    "0\r\nVPORT\r\n2\r\n*ACTIVE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n11\r\n1.0\r\n21\r\n1.0\r\n12\r\n0.0\r\n22\r\n0.0\r\n40\r\n1000.0\r\n41\r\n1.5\r\n";
  dxf += "0\r\nENDTAB\r\n";

  // LTYPE Table (Các kiểu đường nét CAD cơ bản)
  dxf += "0\r\nTABLE\r\n2\r\nLTYPE\r\n70\r\n4\r\n";
  dxf +=
    "0\r\nLTYPE\r\n2\r\nCONTINUOUS\r\n70\r\n0\r\n3\r\nSolid line\r\n72\r\n65\r\n73\r\n0\r\n40\r\n0.0\r\n";
  dxf +=
    "0\r\nLTYPE\r\n2\r\nCENTER\r\n70\r\n0\r\n3\r\nCenter ____ _ ____ _ ____\r\n72\r\n65\r\n73\r\n4\r\n40\r\n50.0\r\n49\r\n30.0\r\n49\r\n-5.0\r\n49\r\n10.0\r\n49\r\n-5.0\r\n";
  dxf +=
    "0\r\nLTYPE\r\n2\r\nHIDDEN\r\n70\r\n0\r\n3\r\nHidden __ __ __ __\r\n72\r\n65\r\n73\r\n2\r\n40\r\n10.0\r\n49\r\n5.0\r\n49\r\n-5.0\r\n";
  dxf +=
    "0\r\nLTYPE\r\n2\r\nDASHED\r\n70\r\n0\r\n3\r\nDashed __ __ __ __\r\n72\r\n65\r\n73\r\n2\r\n40\r\n20.0\r\n49\r\n15.0\r\n49\r\n-5.0\r\n";
  dxf += "0\r\nENDTAB\r\n";

  // LAYER Table — giữ nguyên trạng thái thật của từng layer (đóng băng / tắt / khoá / bề rộng nét)
  const uniqueLayerEntries = new Map<
    string,
    { color: number; lineType: string; flags: number; lineWeight?: number }
  >();
  uniqueLayerEntries.set("0", { color: 7, lineType: "CONTINUOUS", flags: 0 });
  layers.forEach((l) => {
    const finalName = useStandardLayers && l.standardName ? l.standardName : l.name;
    uniqueLayerEntries.set(finalName, {
      // Mã 62 âm là quy ước DXF cho layer đang tắt — giữ đúng trạng thái người vẽ đã đặt
      color: l.isOff ? -Math.abs(l.colorNumber || 7) : l.colorNumber || 7,
      lineType: l.lineType || "CONTINUOUS",
      flags: (l.isFrozen ? 1 : 0) | (l.isLocked ? 4 : 0),
      lineWeight: l.lineWeight,
    });
  });

  dxf += `0\r\nTABLE\r\n2\r\nLAYER\r\n70\r\n${uniqueLayerEntries.size}\r\n`;
  uniqueLayerEntries.forEach((val, name) => {
    dxf += `0\r\nLAYER\r\n2\r\n${name}\r\n70\r\n${val.flags}\r\n62\r\n${val.color}\r\n6\r\n${val.lineType}\r\n`;
    if (typeof val.lineWeight === "number") dxf += `370\r\n${val.lineWeight}\r\n`;
  });
  dxf += "0\r\nENDTAB\r\n";

  // STYLE Table (Font chữ tiêu chuẩn)
  dxf += "0\r\nTABLE\r\n2\r\nSTYLE\r\n70\r\n1\r\n";
  dxf +=
    "0\r\nSTYLE\r\n2\r\nSTANDARD\r\n70\r\n0\r\n40\r\n0.0\r\n41\r\n1.0\r\n50\r\n0.0\r\n71\r\n0\r\n42\r\n250.0\r\n3\r\ntxt\r\n4\r\n\r\n";
  dxf += "0\r\nENDTAB\r\n";

  // APPID Table
  dxf += "0\r\nTABLE\r\n2\r\nAPPID\r\n70\r\n1\r\n";
  dxf += "0\r\nAPPID\r\n2\r\nACAD\r\n70\r\n0\r\n";
  dxf += "0\r\nENDTAB\r\n";

  // BLOCK_RECORD Table
  const blockNames = new Set<string>(["*MODEL_SPACE", "*PAPER_SPACE"]);
  if (parsed.blocks) {
    parsed.blocks.forEach((b) => blockNames.add(b.name));
  }
  entities.forEach((e) => {
    if (e.type === "INSERT" && e.blockName) blockNames.add(e.blockName);
  });

  dxf += `0\r\nTABLE\r\n2\r\nBLOCK_RECORD\r\n70\r\n${blockNames.size}\r\n`;
  blockNames.forEach((bName) => {
    dxf += `0\r\nBLOCK_RECORD\r\n2\r\n${bName}\r\n70\r\n0\r\n`;
  });
  dxf += "0\r\nENDTAB\r\n";

  dxf += "0\r\nENDSEC\r\n";

  // 3. SECTION BLOCKS — ghi lại ĐÚNG hình học của từng khối đọc được từ tệp gốc.
  // Khối không có định nghĩa hình học (vd chỉ thấy qua INSERT) thì ghi khối rỗng hợp lệ, KHÔNG
  // chèn hình chữ thập "đại diện" như bản cũ — đó là nét do máy bịa ra trên bản vẽ người dùng.
  dxf += "0\r\nSECTION\r\n2\r\nBLOCKS\r\n";
  dxf +=
    "0\r\nBLOCK\r\n2\r\n*MODEL_SPACE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n0\r\nENDBLK\r\n";
  dxf +=
    "0\r\nBLOCK\r\n2\r\n*PAPER_SPACE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n0\r\nENDBLK\r\n";
  const blockDefById = new Map((parsed.blocks || []).map((b) => [b.name, b]));
  blockNames.forEach((bName) => {
    if (bName === "*MODEL_SPACE" || bName === "*PAPER_SPACE") return;
    const def = blockDefById.get(bName);
    const base = ptXYZ(def?.basePoint);
    dxf += `0\r\nBLOCK\r\n2\r\n${bName}\r\n70\r\n0\r\n10\r\n${base[0]}\r\n20\r\n${base[1]}\r\n30\r\n${base[2]}\r\n`;
    for (const sub of def?.entities || []) {
      dxf += writeEntityR12(sub, getLayer(sub.layer), defaultTextHeight, drawingBox);
    }
    dxf += "0\r\nENDBLK\r\n";
  });
  dxf += "0\r\nENDSEC\r\n";

  // 4. SECTION ENTITIES
  dxf += "0\r\nSECTION\r\n2\r\nENTITIES\r\n";
  for (const ent of entities) {
    dxf += writeEntityR12(ent, getLayer(ent.layer), defaultTextHeight, drawingBox);
  }
  dxf += "0\r\nENDSEC\r\n";

  // 5. EOF
  dxf += "0\r\nEOF\r\n";

  return dxf;
}

/**
 * Sinh cấu trúc file AutoCAD 2D ASCII DXF chuẩn với đầy đủ các phân hệ MEPF và trục toạ độ (X, Y).
 */
export function generateStandard2dDxf(title = "Ban_Ve_CAD_2D", system = "HVAC"): string {
  const sysUpper = (system || "HVAC").toUpperCase();
  return `0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n9\r\n$INSUNITS\r\n70\r\n4\r\n9\r\n$MEASUREMENT\r\n70\r\n1\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nTABLES\r\n0\r\nTABLE\r\n2\r\nVPORT\r\n70\r\n1\r\n0\r\nVPORT\r\n2\r\n*ACTIVE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n11\r\n1.0\r\n21\r\n1.0\r\n12\r\n0.0\r\n22\r\n0.0\r\n40\r\n1000.0\r\n41\r\n1.5\r\n0\r\nENDTAB\r\n0\r\nTABLE\r\n2\r\nLAYER\r\n70\r\n8\r\n0\r\nLAYER\r\n2\r\n0\r\n70\r\n0\r\n62\r\n7\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nM-DUCT-SUPP\r\n70\r\n0\r\n62\r\n4\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nM-DUCT-RETN\r\n70\r\n0\r\n62\r\n6\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nP-PIPE-SANR\r\n70\r\n0\r\n62\r\n3\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nE-CABL-TRAY\r\n70\r\n0\r\n62\r\n1\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nF-SPRN-PIPE\r\n70\r\n0\r\n62\r\n1\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nA-WALL-GRID\r\n70\r\n0\r\n62\r\n8\r\n6\r\nCONTINUOUS\r\n0\r\nLAYER\r\n2\r\nG-ANNO-TEXT\r\n70\r\n0\r\n62\r\n7\r\n6\r\nCONTINUOUS\r\n0\r\nENDTAB\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nBLOCKS\r\n0\r\nENDSEC\r\n0\r\nSECTION\r\n2\r\nENTITIES\r\n0\r\nLINE\r\n8\r\nA-WALL-GRID\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n11\r\n36000.0\r\n21\r\n0.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nA-WALL-GRID\r\n10\r\n36000.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n11\r\n36000.0\r\n21\r\n18000.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nA-WALL-GRID\r\n10\r\n36000.0\r\n20\r\n18000.0\r\n30\r\n0.0\r\n11\r\n0.0\r\n21\r\n18000.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nA-WALL-GRID\r\n10\r\n0.0\r\n20\r\n18000.0\r\n30\r\n0.0\r\n11\r\n0.0\r\n21\r\n0.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nM-DUCT-SUPP\r\n10\r\n3000.0\r\n20\r\n9000.0\r\n30\r\n0.0\r\n11\r\n33000.0\r\n21\r\n9000.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nM-DUCT-RETN\r\n10\r\n3000.0\r\n20\r\n12000.0\r\n30\r\n0.0\r\n11\r\n33000.0\r\n21\r\n12000.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nP-PIPE-SANR\r\n10\r\n3000.0\r\n20\r\n6000.0\r\n30\r\n0.0\r\n11\r\n33000.0\r\n21\r\n6000.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nE-CABL-TRAY\r\n10\r\n3000.0\r\n20\r\n15000.0\r\n30\r\n0.0\r\n11\r\n33000.0\r\n21\r\n15000.0\r\n31\r\n0.0\r\n0\r\nLINE\r\n8\r\nF-SPRN-PIPE\r\n10\r\n3000.0\r\n20\r\n3000.0\r\n30\r\n0.0\r\n11\r\n33000.0\r\n21\r\n3000.0\r\n31\r\n0.0\r\n0\r\nTEXT\r\n8\r\nG-ANNO-TEXT\r\n10\r\n18000.0\r\n20\r\n9500.0\r\n30\r\n0.0\r\n40\r\n300.0\r\n1\r\nống gió cấp lạnh AHU-01 800x500\r\n0\r\nTEXT\r\n8\r\nG-ANNO-TEXT\r\n10\r\n18000.0\r\n20\r\n12500.0\r\n30\r\n0.0\r\n40\r\n300.0\r\n1\r\nống gió hồi 700x400\r\n0\r\nTEXT\r\n8\r\nG-ANNO-TEXT\r\n10\r\n18000.0\r\n20\r\n6500.0\r\n30\r\n0.0\r\n40\r\n300.0\r\n1\r\nống thoát nước D114 dốc i=1.5% BOP=+2850\r\n0\r\nTEXT\r\n8\r\nG-ANNO-TEXT\r\n10\r\n18000.0\r\n20\r\n15500.0\r\n30\r\n0.0\r\n40\r\n300.0\r\n1\r\nMáng cáp điện Trunking 400x100\r\n0\r\nTEXT\r\n8\r\nG-ANNO-TEXT\r\n10\r\n18000.0\r\n20\r\n3500.0\r\n30\r\n0.0\r\n40\r\n300.0\r\n1\r\nĐầu phun PCCC Sprinkler 68°C\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n`;
}

/** Bốn section bắt buộc phải có trong một tệp DXF ASCII do XBoss phát hành */
const REQUIRED_DXF_SECTIONS = ["HEADER", "TABLES", "BLOCKS", "ENTITIES"];

/**
 * Kiểm định tối thiểu cấu trúc một chuỗi DXF ASCII trước khi ghi ra đĩa — lưới an toàn chặn ghi
 * tệp rác (nội dung rỗng, thiếu section, cụt giữa chừng), KHÔNG phải bộ đọc DXF đầy đủ.
 * Năm điều kiện bắt buộc: nội dung không rỗng, đọc được thành cặp (mã nhóm, giá trị) không lệch
 * nhịp, cặp SECTION/ENDSEC cân bằng, có đủ 4 section HEADER/TABLES/BLOCKS/ENTITIES và kết thúc
 * bằng cặp mã `0` + `EOF`.
 */
export function validateDxf(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ["Nội dung DXF rỗng — không có dữ liệu để lưu."] };
  }

  // DXF ASCII là chuỗi cặp dòng (mã nhóm, giá trị) — duyệt theo cặp để giá trị rỗng hợp lệ
  // (vd mã 4 của bảng STYLE) không làm lệch nhịp đọc. Trước khi ghép cặp phải bỏ BOM UTF-8 và
  // các dòng trống dẫn đầu/kết đuôi, nếu không nhịp cặp lệch 1 dòng và mọi kiểm tra sau đều sai.
  const lines = content.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);

  let firstIdx = 0;
  while (firstIdx < lines.length && lines[firstIdx].trim() === "") firstIdx++;
  let lastIdx = lines.length - 1;
  while (lastIdx >= firstIdx && lines[lastIdx].trim() === "") lastIdx--;
  const body = lines.slice(firstIdx, lastIdx + 1);

  const foundSections = new Set<string>();
  let openSections = 0;
  let strayEndsec = 0;
  let expectingSectionName = false;
  // Số dòng (đếm từ 1) nơi phát hiện nhịp cặp bị lệch — 0 nghĩa là đọc trôi chảy
  let misalignedLine = 0;

  for (let i = 0; i + 1 < body.length; i += 2) {
    const code = body[i].trim();
    const value = body[i + 1].trim();

    // Vị trí chẵn bắt buộc là mã nhóm (số nguyên). Không phải số → tệp lệch nhịp cặp,
    // mọi suy luận phía sau vô nghĩa nên dừng và báo lỗi thay vì đoán bừa.
    if (!/^-?\d+$/.test(code)) {
      misalignedLine = firstIdx + i + 1;
      break;
    }

    if (code === "0") {
      if (value === "SECTION") {
        openSections++;
        expectingSectionName = true;
      } else {
        if (value === "ENDSEC") {
          if (openSections === 0) strayEndsec++;
          else openSections--;
        }
        expectingSectionName = false;
      }
    } else if (code === "2" && expectingSectionName) {
      foundSections.add(value.toUpperCase());
      expectingSectionName = false;
    }
  }

  // Số dòng lẻ = có mã nhóm cuối cùng không kèm giá trị
  if (!misalignedLine && body.length % 2 !== 0) {
    misalignedLine = firstIdx + body.length;
  }

  if (misalignedLine) {
    errors.push(
      `Cấu trúc DXF lệch nhịp cặp (mã nhóm, giá trị) tại dòng ${misalignedLine} — không đọc được như DXF ASCII.`,
    );
  } else {
    if (openSections > 0) {
      errors.push(`Thiếu ${openSections} thẻ ENDSEC đóng SECTION — tệp DXF bị cụt.`);
    }
    if (strayEndsec > 0) {
      errors.push(`Có ${strayEndsec} thẻ ENDSEC thừa không khớp SECTION nào.`);
    }

    const missingSections = REQUIRED_DXF_SECTIONS.filter((s) => !foundSections.has(s));
    if (missingSections.length > 0) {
      errors.push(`Thiếu section bắt buộc: ${missingSections.join(", ")}.`);
    }

    const meaningfulLines = body.map((l) => l.trim()).filter((l) => l.length > 0);
    const n = meaningfulLines.length;
    if (n < 2 || meaningfulLines[n - 1] !== "EOF" || meaningfulLines[n - 2] !== "0") {
      errors.push('Tệp DXF phải kết thúc bằng cặp mã "0" + "EOF".');
    }
  }

  return { valid: errors.length === 0, errors };
}
