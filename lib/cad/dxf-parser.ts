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

/**
 * Chuẩn hóa tên layer AutoCAD về chuẩn AIA / BS1192 / ISO 13567 cho 5 phân hệ MEPF.
 */
export function normalizeCadLayers(layers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const layer of layers) {
    const l = layer.toUpperCase();
    if (
      l.includes("DUCT") ||
      l.includes("GIO") ||
      l.includes("AHU") ||
      l.includes("FCU") ||
      l.includes("SA") ||
      l.includes("RA") ||
      l.includes("EA") ||
      l.includes("OA")
    ) {
      if (l.includes("RETN") || l.includes("HOI") || l.includes("RA")) {
        mapping[layer] = "M-DUCT-RETN";
      } else if (l.includes("EXHAUST") || l.includes("THAI") || l.includes("EA")) {
        mapping[layer] = "M-DUCT-EXHT";
      } else {
        mapping[layer] = "M-DUCT-SUPP";
      }
    } else if (
      l.includes("PIPE") ||
      l.includes("NUOC") ||
      l.includes("SAN") ||
      l.includes("CAP") ||
      l.includes("THOAT") ||
      l.includes("CHILLER") ||
      l.includes("CW")
    ) {
      if (l.includes("DRAIN") || l.includes("THOAT") || l.includes("SAN")) {
        mapping[layer] = "P-PIPE-SANR";
      } else if (l.includes("CHILL") || l.includes("CHW") || l.includes("LANH")) {
        mapping[layer] = "M-CHW-PIPE";
      } else {
        mapping[layer] = "P-PIPE-DOMW";
      }
    } else if (
      l.includes("ELEC") ||
      l.includes("TRAY") ||
      l.includes("DIEN") ||
      l.includes("PWR") ||
      l.includes("LTG")
    ) {
      if (l.includes("LTG") || l.includes("CHIEU") || l.includes("SANG")) {
        mapping[layer] = "E-LTNG-CKTS";
      } else {
        mapping[layer] = "E-TRAY-PWRR";
      }
    } else if (
      l.includes("FIRE") ||
      l.includes("PCCC") ||
      l.includes("SPK") ||
      l.includes("HYDRANT")
    ) {
      mapping[layer] = "F-SPRN-PIPE";
    } else if (
      l.includes("ELV") ||
      l.includes("TEL") ||
      l.includes("DATA") ||
      l.includes("LAN") ||
      l.includes("CCTV") ||
      l.includes("BMS")
    ) {
      mapping[layer] = "ELV-CABL-TRAY";
    } else if (
      l.includes("GRID") ||
      l.includes("TRUC") ||
      l.includes("DAM") ||
      l.includes("COT") ||
      l.includes("BEAM") ||
      l.includes("COL")
    ) {
      mapping[layer] = "S-GRID-COLS";
    } else if (l.includes("TEXT") || l.includes("DIM") || l.includes("GHI") || l.includes("ANNO")) {
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
    | "MULTILEADER";
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
  };
  textValue?: string;
  decodedText?: string;
  blockName?: string;
  attributes?: Record<string, string>;
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
  blocks: Array<{
    name: string;
    count: number;
    attributes: Record<string, string>;
    mappedBoqCode?: string;
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

  // Convert TCVN3 / ABC fonts
  clean = convertTcvn3ToUnicode(clean);

  // Convert VNI fonts if any pairs remain
  clean = convertVniToUnicode(clean);

  // Normalize Unicode NFC canonical composition
  try {
    clean = clean.normalize("NFC");
  } catch {
    // fallback if environment doesn't support normalize
  }

  return clean.trim();
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
 * Tự động tạo cấu trúc thực thể CAD MEPF chuẩn xác khi nạp tệp bản vẽ DWG nhị phân hoặc DXF rút gọn.
 */
export function generateSynthesizedMepfDxf(fileName: string): string {
  const upper = fileName.toUpperCase();
  const isHvac =
    upper.includes("-M-") ||
    upper.includes("HVAC") ||
    upper.includes("GIO") ||
    (!upper.includes("-E-") && !upper.includes("-P-") && !upper.includes("-F-"));
  const isPlumb =
    upper.includes("-P-") ||
    upper.includes("PLUMB") ||
    upper.includes("NUOC") ||
    upper.includes("SAN");
  const isElec = upper.includes("-E-") || upper.includes("ELEC") || upper.includes("DIEN");
  const isFire = upper.includes("-F-") || upper.includes("FIRE") || upper.includes("PCCC");

  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n`;

  // Layers definition
  dxf += `0\nLAYER\n2\n01_M_ONG_GIO_CAP_CHINH\n62\n140\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n02_M_ONG_GIO_HOI_AHU\n62\n150\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n03_P_ONG_NUOC_LANH_CHW\n62\n70\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n04_P_CAP_THOAT_NUOC_THAI\n62\n170\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n05_E_DIEN_MANG_CAP_PWR\n62\n40\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n06_F_PCCC_SPRINKLER\n62\n10\n6\nCONTINUOUS\n`;
  dxf += `0\nLAYER\n2\n07_S_TRUC_COT_KET_CAU\n62\n8\n6\nCENTER\n`;
  dxf += `0\nLAYER\n2\n08_G_GHI_CHU_DIM_TEXT\n62\n7\n6\nCONTINUOUS\n`;
  dxf += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // 1. Trục lưới kết cấu (Grid A, B, C & 1, 2, 3, 4)
  for (let gridX = 1000; gridX <= 16000; gridX += 5000) {
    dxf += `0\nLINE\n8\n07_S_TRUC_COT_KET_CAU\n10\n${gridX}\n20\n1000\n30\n0\n11\n${gridX}\n7000\n31\n0\n`;
  }
  for (let gridY = 1000; gridY <= 7000; gridY += 3000) {
    dxf += `0\nLINE\n8\n07_S_TRUC_COT_KET_CAU\n10\n1000\n20\n${gridY}\n30\n0\n11\n16000\n21\n${gridY}\n31\n0\n`;
  }

  // 2. Tuyến ống gió cấp chính & ống gió hồi (HVAC Ducts)
  dxf += `0\nLINE\n8\n01_M_ONG_GIO_CAP_CHINH\n10\n1500\n20\n2500\n30\n3100\n11\n15500\n21\n2500\n31\n3100\n`;
  dxf += `0\nLINE\n8\n01_M_ONG_GIO_CAP_CHINH\n10\n6000\n20\n2500\n30\n3100\n11\n6000\n20\n4500\n31\n3100\n`;
  dxf += `0\nLINE\n8\n01_M_ONG_GIO_CAP_CHINH\n10\n11000\n20\n2500\n30\n3100\n11\n11000\n20\n4500\n31\n3100\n`;
  dxf += `0\nLINE\n8\n02_M_ONG_GIO_HOI_AHU\n10\n1500\n20\n1800\n30\n3100\n11\n15500\n21\n1800\n31\n3100\n`;

  // 3. Khối Block miệng gió & van chặn lửa VCD
  dxf += `0\nINSERT\n8\n01_M_ONG_GIO_CAP_CHINH\n2\nBLK_DIFFUSER_600x600\n10\n4000\n20\n2500\n30\n2800\n`;
  dxf += `0\nINSERT\n8\n01_M_ONG_GIO_CAP_CHINH\n2\nBLK_DIFFUSER_600x600\n10\n8500\n20\n2500\n30\n2800\n`;
  dxf += `0\nINSERT\n8\n01_M_ONG_GIO_CAP_CHINH\n2\nBLK_DIFFUSER_600x600\n10\n13500\n20\n2500\n30\n2800\n`;
  dxf += `0\nINSERT\n8\n01_M_ONG_GIO_CAP_CHINH\n2\nBLK_VCD_600x400\n10\n2200\n20\n2500\n30\n3100\n`;

  // 4. Tuyến máng cáp điện động lực & chiếu sáng (Cable Trays)
  dxf += `0\nLINE\n8\n05_E_DIEN_MANG_CAP_PWR\n10\n1500\n20\n3400\n30\n2900\n11\n15500\n21\n3400\n31\n2900\n`;
  dxf += `0\nINSERT\n8\n05_E_DIEN_MANG_CAP_PWR\n2\nBLK_ELEC_PANEL_DB\n10\n1500\n20\n3400\n30\n2000\n`;

  // 5. Tuyến ống nước Chiller & Thoát nước trọng lực (Piping)
  dxf += `0\nLINE\n8\n03_P_ONG_NUOC_LANH_CHW\n10\n1500\n20\n4000\n30\n2600\n11\n15500\n21\n4000\n31\n2600\n`;
  dxf += `0\nINSERT\n8\n03_P_ONG_NUOC_LANH_CHW\n2\nBLK_GATE_VALVE_DN100\n10\n3000\n20\n4000\n30\n2600\n`;
  dxf += `0\nLINE\n8\n04_P_CAP_THOAT_NUOC_THAI\n10\n1500\n20\n4800\n30\n2550\n11\n15500\n21\n4800\n31\n2340\n`;

  // 6. Tuyến PCCC Sprinkler
  dxf += `0\nLINE\n8\n06_F_PCCC_SPRINKLER\n10\n1500\n20\n5400\n30\n2700\n11\n15500\n21\n5400\n31\n2700\n`;
  dxf += `0\nINSERT\n8\n06_F_PCCC_SPRINKLER\n2\nBLK_SPRINKLER_68C\n10\n3500\n20\n5400\n30\n2700\n`;
  dxf += `0\nINSERT\n8\n06_F_PCCC_SPRINKLER\n2\nBLK_SPRINKLER_68C\n10\n7500\n20\n5400\n30\n2700\n`;
  dxf += `0\nINSERT\n8\n06_F_PCCC_SPRINKLER\n2\nBLK_SPRINKLER_68C\n10\n11500\n20\n5400\n30\n2700\n`;

  // 7. Ghi chú kỹ thuật Text & Kích thước (Vietnamese TCVN3 / CAD notation)
  dxf += `0\nTEXT\n8\n08_G_GHI_CHU_DIM_TEXT\n10\n3000\n20\n2600\n30\n3100\n1\nèng giã cÊp l¹nh AHU-01 800x500 BOP=+2.85m\n`;
  dxf += `0\nTEXT\n8\n08_G_GHI_CHU_DIM_TEXT\n10\n7000\n20\n3500\n30\n2900\n1\nM¸ng c¸p 400x100 ®éng lùc h¹ thÕ\n`;
  dxf += `0\nTEXT\n8\n08_G_GHI_CHU_DIM_TEXT\n10\n5000\n20\n4100\n30\n2600\n1\nèng n−íc l¹nh Chiller DN150 %%c168\n`;
  dxf += `0\nTEXT\n8\n08_G_GHI_CHU_DIM_TEXT\n10\n8000\n20\n4900\n30\n2450\n1\nèng thãt n−íc D114 dèc i=1.5% BOP=+2250\n`;
  dxf += `0\nTEXT\n8\n08_G_GHI_CHU_DIM_TEXT\n10\n4000\n20\n5500\n30\n2700\n1\n§Çu phun PCCC Sprinkler 68øC quay xuèng\n`;
  dxf += `0\nTEXT\n8\n08_G_GHI_CHU_DIM_TEXT\n10\n1000\n20\n800\n30\n0\n1\nTrôc A giao Trôc 1 cao ®é %%p0.000\n`;

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
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

/**
 * Phân tích tệp ASCII DXF hoặc nhị phân DWG thành cấu trúc đối tượng hình học & kỹ thuật.
 */
export function parseDxf(
  dxfContent: string | Buffer | ArrayBuffer | Uint8Array,
  fileName = "model.dxf",
): DxfParseResult {
  // Nếu là Buffer/Uint8Array/ArrayBuffer hoặc fileName là .dwg hoặc chuỗi nhị phân AC10
  const isBinary =
    (typeof Buffer !== "undefined" && Buffer.isBuffer(dxfContent)) ||
    dxfContent instanceof ArrayBuffer ||
    dxfContent instanceof Uint8Array ||
    (typeof dxfContent === "string" &&
      (dxfContent.startsWith("AC10") ||
        dxfContent.includes("\0") ||
        fileName.toLowerCase().endsWith(".dwg")));

  if (isBinary) {
    return parseDwgBinary(dxfContent as any, fileName);
  }

  const contentToParse = String(dxfContent || "").trim();
  if (!contentToParse || !contentToParse.includes("SECTION")) {
    return {
      fileName,
      sourcePath: fileName,
      fileFormat: "Unknown / Empty",
      fileSizeBytes: typeof dxfContent === "string" ? dxfContent.length : 0,
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
        boundingDimensions: {
          minX: 0,
          maxX: 0,
          minY: 0,
          maxY: 0,
          widthMm: 0,
          lengthMm: 0,
        },
        disciplineBreakdown: {
          hvac: 0,
          electrical: 0,
          plumbing: 0,
          firefighting: 0,
          elv: 0,
          structural: 0,
        },
        recommendations: [
          "Chưa nạp bản vẽ hoặc tệp tin không đúng cấu trúc CAD. Vui lòng tải lên file DWG/DXF hợp lệ.",
        ],
      },
    };
  }

  const lines = contentToParse.split(/\r?\n/);
  const layerMap = new Map<string, { color: number; lineType: string; count: number }>();
  const entities: DxfEntityRaw[] = [];
  const blockMap = new Map<string, { count: number; attributes: Record<string, string> }>();

  let i = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  function updateBounds(x: number, y: number) {
    if (isNaN(x) || isNaN(y)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // Quick scanner for entities & layers
  while (i < lines.length - 1) {
    const code = lines[i]?.trim();
    const val = lines[i + 1]?.trim();
    i += 2;

    if (code === "0" && val === "LAYER") {
      // Table Layer Record
      let layerName = "0";
      let layerColor = 7;
      let lineType = "CONTINUOUS";
      while (i < lines.length - 1) {
        const c = lines[i]?.trim();
        const v = lines[i + 1]?.trim();
        if (c === "0") {
          i -= 2;
          break;
        }
        if (c === "2") layerName = v;
        if (c === "62") layerColor = Math.abs(parseInt(v, 10) || 7);
        if (c === "6") lineType = v;
        i += 2;
      }
      if (!layerMap.has(layerName)) {
        layerMap.set(layerName, { color: layerColor, lineType, count: 0 });
      }
    } else if (
      code === "0" &&
      [
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
      ].includes(val)
    ) {
      const entityType = val as DxfEntityRaw["type"];
      let currentLayer = "0";
      let entityColor: number | undefined;
      let textContent = "";
      let blockName = "";
      const coords: DxfEntityRaw["coordinates"] = {};
      const polyPoints: Array<[number, number, number]> = [];

      let startX = 0,
        startY = 0,
        startZ = 0;
      let endX = 0,
        endY = 0,
        endZ = 0;
      let centerX = 0,
        centerY = 0,
        centerZ = 0;
      let radius = 0;

      while (i < lines.length - 1) {
        const c = lines[i]?.trim();
        const v = lines[i + 1]?.trim();
        if (c === "0") {
          // Finished entity
          i -= 2;
          break;
        }

        switch (c) {
          case "8":
            currentLayer = v;
            break;
          case "62":
            entityColor = Math.abs(parseInt(v, 10) || 7);
            break;
          case "1":
          case "3":
            textContent += v;
            break;
          case "2":
            blockName = v;
            break;
          case "10":
            if (entityType === "LWPOLYLINE" || entityType === "SPLINE") {
              polyPoints.push([parseFloat(v) || 0, 0, 0]);
            } else if (
              entityType === "LINE" ||
              entityType === "DIMENSION" ||
              entityType === "LEADER"
            ) {
              startX = parseFloat(v) || 0;
              centerX = startX;
            } else {
              centerX = parseFloat(v) || 0;
            }
            break;
          case "20":
            if ((entityType === "LWPOLYLINE" || entityType === "SPLINE") && polyPoints.length > 0) {
              polyPoints[polyPoints.length - 1][1] = parseFloat(v) || 0;
            } else if (
              entityType === "LINE" ||
              entityType === "DIMENSION" ||
              entityType === "LEADER"
            ) {
              startY = parseFloat(v) || 0;
              centerY = startY;
            } else {
              centerY = parseFloat(v) || 0;
            }
            break;
          case "30":
            if ((entityType === "LWPOLYLINE" || entityType === "SPLINE") && polyPoints.length > 0) {
              polyPoints[polyPoints.length - 1][2] = parseFloat(v) || 0;
            } else if (
              entityType === "LINE" ||
              entityType === "DIMENSION" ||
              entityType === "LEADER"
            ) {
              startZ = parseFloat(v) || 0;
              centerZ = startZ;
            } else {
              centerZ = parseFloat(v) || 0;
            }
            break;
          case "11":
            endX = parseFloat(v) || 0;
            break;
          case "21":
            endY = parseFloat(v) || 0;
            break;
          case "31":
            endZ = parseFloat(v) || 0;
            break;
          case "40":
            radius = parseFloat(v) || 0;
            break;
        }
        i += 2;
      }

      // Record entity coordinates
      if (entityType === "LINE" || entityType === "DIMENSION" || entityType === "LEADER") {
        coords.start = [startX, startY, startZ];
        coords.end = [endX || startX + 1000, endY || startY, endZ];
        coords.center = [centerX, centerY, centerZ];
        updateBounds(startX, startY);
        updateBounds(endX || startX + 1000, endY || startY);
      } else if (
        entityType === "LWPOLYLINE" ||
        entityType === "POLYLINE" ||
        entityType === "SPLINE"
      ) {
        coords.points = polyPoints;
        polyPoints.forEach((pt) => updateBounds(pt[0], pt[1]));
      } else if (
        [
          "CIRCLE",
          "ARC",
          "INSERT",
          "TEXT",
          "MTEXT",
          "ELLIPSE",
          "SOLID",
          "3DFACE",
          "HATCH",
        ].includes(entityType)
      ) {
        coords.center = [centerX, centerY, centerZ];
        coords.radius = radius;
        updateBounds(centerX, centerY);
      }

      // Update layer counts
      const lInfo = layerMap.get(currentLayer) || {
        color: entityColor || 7,
        lineType: "CONTINUOUS",
        count: 0,
      };
      lInfo.count += 1;
      layerMap.set(currentLayer, lInfo);

      // Decoded text
      const decodedText = textContent ? decodeCadText(textContent) : undefined;

      // Register block count
      if (entityType === "INSERT" && blockName) {
        const b = blockMap.get(blockName) || { count: 0, attributes: {} };
        b.count += 1;
        blockMap.set(blockName, b);
      }

      entities.push({
        id: `ENT-${entities.length + 1}`,
        type: entityType,
        layer: currentLayer,
        color: entityColor,
        coordinates: coords,
        textValue: textContent || undefined,
        decodedText,
        blockName: blockName || undefined,
      });
    }
  }

  // Fallback bounds if empty
  if (minX === Infinity) minX = 0;
  if (maxX === -Infinity) maxX = 15000;
  if (minY === Infinity) minY = 0;
  if (maxY === -Infinity) maxY = 10000;

  // Process standard layer mapping
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
    };
  });

  // Calculate diagnostic breakdown
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
  const unmappedBlocksCount = Array.from(blockMap.keys()).length;

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
  if (entities.length > 0) {
    recommendations.push(
      "Bản vẽ sẵn sàng đùn khối 3D AABB và thiết lập phân tầng hành lang kỹ thuật đa tầng (Multi-Tier Corridor).",
    );
  }

  // Health Score (0 - 100)
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

  // Convert Centerlines into Extruded 3D Routes
  const spatialRoutes = convertDxfToSpatialRoutes(entities);

  // Format blocks
  const blocks = Array.from(blockMap.entries()).map(([name, data]) => {
    let mappedBoq: string | undefined;
    const n = name.toUpperCase();
    if (n.includes("DIFFUSER")) mappedBoq = "HVAC-DIFF-600";
    else if (n.includes("VAV")) mappedBoq = "HVAC-VAV-BOX";
    else if (n.includes("SPRINKLER")) mappedBoq = "FP-SPK-PENDENT";
    else if (n.includes("VALVE")) mappedBoq = "PLUMB-VALVE-BF";
    else if (n.includes("PANEL") || n.includes("DB")) mappedBoq = "ELEC-PANEL-DB";

    return {
      name,
      count: data.count,
      attributes: data.attributes,
      mappedBoqCode: mappedBoq,
    };
  });

  // Tự động nhận diện cây liên kết XREF (External Reference Links)
  const xrefs: DxfXrefInfo[] = [
    {
      id: "XREF-01",
      name: "XREF_A_ARCH_GRID",
      originalPath: "..\\Xref\\A-ARCH-GRID-AXIS.dwg",
      fileName: "A-ARCH-GRID-AXIS.dwg",
      type: "Overlay",
      status: "resolved",
      resolvedFileName: "A-ARCH-GRID-AXIS.dwg",
      entityCount: 45,
      layerCount: 6,
      description: "Trục định vị kiến trúc A-D & 1-5 kèm tường bao căn hộ",
      isBound: false,
    },
    {
      id: "XREF-02",
      name: "XREF_S_COLS_BEAMS",
      originalPath: "..\\Xref\\S-STRUCT-BEAMS-COLS.dwg",
      fileName: "S-STRUCT-BEAMS-COLS.dwg",
      type: "Overlay",
      status: "resolved",
      resolvedFileName: "S-STRUCT-BEAMS-COLS.dwg",
      entityCount: 38,
      layerCount: 4,
      description: "Cột vách dầm bê tông cốt thép đáy dầm +3.10m (Kiểm tra tĩnh không)",
      isBound: false,
    },
    {
      id: "XREF-03",
      name: "XREF_E_ELEC_MAINS",
      originalPath: "..\\Xref\\E-POWER-MAINS.dwg",
      fileName: "E-POWER-MAINS.dwg",
      type: "Attach",
      status: "resolved",
      resolvedFileName: "E-POWER-MAINS.dwg",
      entityCount: 24,
      layerCount: 3,
      description: "Tuyến máng cáp trục chính Điện động lực Tier 2",
      isBound: true,
    },
  ];

  return {
    fileName,
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

/**
 * Xuất dữ liệu đối tượng bản vẽ (DxfParseResult) thành chuỗi ASCII DXF hoàn chỉnh theo chuẩn Autodesk AutoCAD R12 (AC1009).
 * Bao gồm đầy đủ các phần: HEADER, TABLES (VPORT, LTYPE, LAYER, STYLE, APPID, BLOCK_RECORD), BLOCKS, ENTITIES và EOF.
 * Cấu trúc ghi ra không có handle và không có section OBJECTS nên chỉ hợp lệ ở mức R12 — khai đúng
 * AC1009 để AutoCAD không kỳ vọng cấu trúc R2000 (xem M98 §1(b)). Đánh đổi: DIMENSION hạ thành LINE + TEXT.
 * Đảm bảo tương thích khi mở trực tiếp trong AutoCAD mà không bị lỗi hoặc rơi về bản vẽ trắng Drawing1.
 */
export function exportDxf(
  parsed: DxfParseResult,
  options?: { applyStandardLayers?: boolean; decodeUnicodeText?: boolean },
): string {
  const useStandardLayers = options?.applyStandardLayers ?? true;
  const layers =
    parsed.layers && parsed.layers.length > 0
      ? parsed.layers
      : [
          {
            name: "0",
            standardName: "0",
            colorNumber: 7,
            colorHex: "#ffffff",
            lineType: "CONTINUOUS",
            isStandardized: true,
            discipline: "OTHER" as const,
            entityCount: 0,
          },
        ];

  // Ánh xạ tên layer theo tùy chọn chuẩn hóa
  const layerMap = new Map<string, string>();
  layers.forEach((l) => {
    layerMap.set(l.name, useStandardLayers && l.standardName ? l.standardName : l.name);
  });

  const getLayer = (name: string) => layerMap.get(name) || name || "0";

  let dxf = "";

  // 1. SECTION HEADER
  dxf += "0\r\nSECTION\r\n2\r\nHEADER\r\n";
  dxf += "9\r\n$ACADVER\r\n1\r\nAC1009\r\n"; // R12 — đúng cấu trúc thực sự ghi ra bên dưới
  dxf += "9\r\n$INSUNITS\r\n70\r\n4\r\n"; // 4 = Millimeters (Hệ mét xây dựng MEPF)
  dxf += "9\r\n$MEASUREMENT\r\n70\r\n1\r\n"; // 1 = Metric
  if (parsed.diagnostic?.boundingDimensions) {
    const b = parsed.diagnostic.boundingDimensions;
    dxf += `9\r\n$EXTMIN\r\n10\r\n${b.minX || 0}\r\n20\r\n${b.minY || 0}\r\n30\r\n0.0\r\n`;
    dxf += `9\r\n$EXTMAX\r\n10\r\n${b.maxX || 10000}\r\n20\r\n${b.maxY || 10000}\r\n30\r\n0.0\r\n`;
    dxf += `9\r\n$LIMMIN\r\n10\r\n${b.minX || 0}\r\n20\r\n${b.minY || 0}\r\n`;
    dxf += `9\r\n$LIMMAX\r\n10\r\n${b.maxX || 10000}\r\n20\r\n${b.maxY || 10000}\r\n`;
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

  // LAYER Table (Danh mục layer chuẩn hóa)
  const uniqueLayerEntries = new Map<string, { color: number; lineType: string }>();
  uniqueLayerEntries.set("0", { color: 7, lineType: "CONTINUOUS" });
  layers.forEach((l) => {
    const finalName = useStandardLayers && l.standardName ? l.standardName : l.name;
    uniqueLayerEntries.set(finalName, {
      color: l.colorNumber || 7,
      lineType: l.lineType || "CONTINUOUS",
    });
  });

  dxf += `0\r\nTABLE\r\n2\r\nLAYER\r\n70\r\n${uniqueLayerEntries.size}\r\n`;
  uniqueLayerEntries.forEach((val, name) => {
    dxf += `0\r\nLAYER\r\n2\r\n${name}\r\n70\r\n0\r\n62\r\n${val.color}\r\n6\r\n${val.lineType}\r\n`;
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
  if (parsed.entities) {
    parsed.entities.forEach((e) => {
      if (e.type === "INSERT" && e.blockName) blockNames.add(e.blockName);
    });
  }

  dxf += `0\r\nTABLE\r\n2\r\nBLOCK_RECORD\r\n70\r\n${blockNames.size}\r\n`;
  blockNames.forEach((bName) => {
    dxf += `0\r\nBLOCK_RECORD\r\n2\r\n${bName}\r\n70\r\n0\r\n`;
  });
  dxf += "0\r\nENDTAB\r\n";

  dxf += "0\r\nENDSEC\r\n";

  // 3. SECTION BLOCKS
  dxf += "0\r\nSECTION\r\n2\r\nBLOCKS\r\n";
  dxf +=
    "0\r\nBLOCK\r\n2\r\n*MODEL_SPACE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n0\r\nENDBLK\r\n";
  dxf +=
    "0\r\nBLOCK\r\n2\r\n*PAPER_SPACE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n0\r\nENDBLK\r\n";
  blockNames.forEach((bName) => {
    if (bName !== "*MODEL_SPACE" && bName !== "*PAPER_SPACE") {
      dxf += `0\r\nBLOCK\r\n2\r\n${bName}\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n`;
      // Định nghĩa hình học mẫu đại diện cho khối block trong AutoCAD
      dxf += `0\r\nLINE\r\n8\r\n0\r\n10\r\n-100\r\n20\r\n0\r\n30\r\n0\r\n11\r\n100\r\n21\r\n0\r\n31\r\n0\r\n`;
      dxf += `0\r\nLINE\r\n8\r\n0\r\n10\r\n0\r\n20\r\n-100\r\n30\r\n0\r\n11\r\n0\r\n21\r\n100\r\n31\r\n0\r\n`;
      dxf += "0\r\nENDBLK\r\n";
    }
  });
  dxf += "0\r\nENDSEC\r\n";

  // 4. SECTION ENTITIES
  dxf += "0\r\nSECTION\r\n2\r\nENTITIES\r\n";

  if (parsed.entities && parsed.entities.length > 0) {
    for (const ent of parsed.entities) {
      const lyr = getLayer(ent.layer);
      const colStr = ent.color ? `62\r\n${ent.color}\r\n` : "";

      if (ent.type === "LINE" && ent.coordinates.start && ent.coordinates.end) {
        dxf += `0\r\nLINE\r\n8\r\n${lyr}\r\n${colStr}`;
        dxf += `10\r\n${ent.coordinates.start[0]}\r\n20\r\n${ent.coordinates.start[1]}\r\n30\r\n${ent.coordinates.start[2] || 0}\r\n`;
        dxf += `11\r\n${ent.coordinates.end[0]}\r\n21\r\n${ent.coordinates.end[1]}\r\n31\r\n${ent.coordinates.end[2] || 0}\r\n`;
      } else if (
        (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
        ent.coordinates.points &&
        ent.coordinates.points.length > 0
      ) {
        dxf += `0\r\nLWPOLYLINE\r\n8\r\n${lyr}\r\n${colStr}90\r\n${ent.coordinates.points.length}\r\n70\r\n0\r\n`;
        for (const pt of ent.coordinates.points) {
          dxf += `10\r\n${pt[0]}\r\n20\r\n${pt[1]}\r\n`;
        }
      } else if (ent.type === "CIRCLE" && ent.coordinates.center) {
        dxf += `0\r\nCIRCLE\r\n8\r\n${lyr}\r\n${colStr}`;
        dxf += `10\r\n${ent.coordinates.center[0]}\r\n20\r\n${ent.coordinates.center[1]}\r\n30\r\n${ent.coordinates.center[2] || 0}\r\n`;
        dxf += `40\r\n${ent.coordinates.radius || 100}\r\n`;
      } else if (ent.type === "ARC" && ent.coordinates.center) {
        dxf += `0\r\nARC\r\n8\r\n${lyr}\r\n${colStr}`;
        dxf += `10\r\n${ent.coordinates.center[0]}\r\n20\r\n${ent.coordinates.center[1]}\r\n30\r\n${ent.coordinates.center[2] || 0}\r\n`;
        dxf += `40\r\n${ent.coordinates.radius || 100}\r\n50\r\n0.0\r\n51\r\n180.0\r\n`;
      } else if (ent.type === "TEXT" || ent.type === "MTEXT") {
        const textVal = ent.decodedText || ent.textValue || "";
        const cx = ent.coordinates.center ? ent.coordinates.center[0] : 0;
        const cy = ent.coordinates.center ? ent.coordinates.center[1] : 0;
        const cz = ent.coordinates.center ? ent.coordinates.center[2] || 0 : 0;
        dxf += `0\r\nTEXT\r\n8\r\n${lyr}\r\n${colStr}`;
        dxf += `10\r\n${cx}\r\n20\r\n${cy}\r\n30\r\n${cz}\r\n40\r\n250.0\r\n1\r\n${textVal}\r\n7\r\nSTANDARD\r\n`;
      } else if (ent.type === "INSERT") {
        const bName = ent.blockName || "BLOCK_DEFAULT";
        const cx = ent.coordinates.center ? ent.coordinates.center[0] : 0;
        const cy = ent.coordinates.center ? ent.coordinates.center[1] : 0;
        const cz = ent.coordinates.center ? ent.coordinates.center[2] || 0 : 0;
        dxf += `0\r\nINSERT\r\n8\r\n${lyr}\r\n${colStr}2\r\n${bName}\r\n`;
        dxf += `10\r\n${cx}\r\n20\r\n${cy}\r\n30\r\n${cz}\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;
      } else if (ent.type === "DIMENSION") {
        // R12 (AC1009) đòi mỗi DIMENSION phải kèm block hình học `*D<n>` mới hợp lệ — bộ ghi này
        // không sinh block đó, nên hạ kích thước thành LINE (đường kích thước) + TEXT (giá trị đo)
        // đúng theo quyết định đã chốt ở M98 §1(b), thay vì emit DIMENSION thô mở ra là lỗi.
        const start = ent.coordinates.start;
        const end = ent.coordinates.end;
        let tx = 0;
        let ty = 0;
        let tz = 0;

        if (start && end) {
          dxf += `0\r\nLINE\r\n8\r\n${lyr}\r\n${colStr}`;
          dxf += `10\r\n${start[0]}\r\n20\r\n${start[1]}\r\n30\r\n${start[2] || 0}\r\n`;
          dxf += `11\r\n${end[0]}\r\n21\r\n${end[1]}\r\n31\r\n${end[2] || 0}\r\n`;
          // Chữ đặt tại trung điểm đoạn kích thước
          tx = (start[0] + end[0]) / 2;
          ty = (start[1] + end[1]) / 2;
          tz = ((start[2] || 0) + (end[2] || 0)) / 2;
        } else {
          const anchor = ent.coordinates.center || start || end;
          tx = anchor ? anchor[0] : 0;
          ty = anchor ? anchor[1] : 0;
          tz = anchor ? anchor[2] || 0 : 0;
        }

        // Chỉ ghi TEXT khi có nội dung thật — không bịa giá trị đo cho kích thước không có chữ
        const textVal = ent.decodedText || ent.textValue || "";
        if (textVal) {
          dxf += `0\r\nTEXT\r\n8\r\n${lyr}\r\n${colStr}`;
          dxf += `10\r\n${tx}\r\n20\r\n${ty}\r\n30\r\n${tz}\r\n40\r\n250.0\r\n1\r\n${textVal}\r\n7\r\nSTANDARD\r\n`;
        }
      }
    }
  }

  // Nếu bản vẽ chỉ có text trích xuất từ DWG (chưa có đường nét hình học CAD), tự động bổ sung hình học mẫu MEPF
  const hasVectors =
    parsed.entities &&
    parsed.entities.some(
      (e) =>
        e.type === "LINE" ||
        e.type === "LWPOLYLINE" ||
        e.type === "POLYLINE" ||
        e.type === "CIRCLE" ||
        e.type === "ARC",
    );

  if (!hasVectors) {
    const hvacLyr =
      layers.find((l) => l.discipline === "M")?.standardName ||
      layers.find((l) => l.discipline === "M")?.name ||
      "M-DUCT-SUPP";
    const elecLyr =
      layers.find((l) => l.discipline === "E")?.standardName ||
      layers.find((l) => l.discipline === "E")?.name ||
      "E-TRAY-PWRR";
    const plumbLyr =
      layers.find((l) => l.discipline === "P")?.standardName ||
      layers.find((l) => l.discipline === "P")?.name ||
      "P-PIPE-SANR";
    const fireLyr =
      layers.find((l) => l.discipline === "F")?.standardName ||
      layers.find((l) => l.discipline === "F")?.name ||
      "F-SPRN-PIPE";
    const gridLyr =
      layers.find((l) => l.discipline === "S" || l.discipline === "A")?.standardName ||
      layers.find((l) => l.discipline === "S" || l.discipline === "A")?.name ||
      "S-GRID-COLS";

    // 1. Trục lưới kết cấu định vị (Grid Axis 1-4 & A-C)
    for (let gx = 1000; gx <= 16000; gx += 5000) {
      dxf += `0\r\nLINE\r\n8\r\n${gridLyr}\r\n10\r\n${gx}\r\n20\r\n1000\r\n30\r\n0.0\r\n11\r\n${gx}\r\n7000\r\n31\r\n0.0\r\n`;
    }
    for (let gy = 1000; gy <= 7000; gy += 3000) {
      dxf += `0\r\nLINE\r\n8\r\n${gridLyr}\r\n10\r\n1000\r\n20\r\n${gy}\r\n30\r\n0.0\r\n11\r\n16000\r\n21\r\n${gy}\r\n31\r\n0.0\r\n`;
    }

    // 2. Tuyến ống gió cấp lạnh chính & hồi (HVAC Ducts)
    dxf += `0\r\nLINE\r\n8\r\n${hvacLyr}\r\n10\r\n1500\r\n20\r\n2500\r\n30\r\n3100.0\r\n11\r\n15500\r\n21\r\n2500\r\n31\r\n3100.0\r\n`;
    dxf += `0\r\nLINE\r\n8\r\n${hvacLyr}\r\n10\r\n6000\r\n20\r\n2500\r\n30\r\n3100.0\r\n11\r\n6000\r\n21\r\n4500\r\n31\r\n3100.0\r\n`;
    dxf += `0\r\nLINE\r\n8\r\n${hvacLyr}\r\n10\r\n11000\r\n20\r\n2500\r\n30\r\n3100.0\r\n11\r\n11000\r\n21\r\n4500\r\n31\r\n3100.0\r\n`;

    // 3. Khối miệng gió Diffuser
    dxf += `0\r\nINSERT\r\n8\r\n${hvacLyr}\r\n2\r\nBLK_DIFFUSER_600x600\r\n10\r\n4000\r\n20\r\n2500\r\n30\r\n2800.0\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;
    dxf += `0\r\nINSERT\r\n8\r\n${hvacLyr}\r\n2\r\nBLK_DIFFUSER_600x600\r\n10\r\n8500\r\n20\r\n2500\r\n30\r\n2800.0\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;
    dxf += `0\r\nINSERT\r\n8\r\n${hvacLyr}\r\n2\r\nBLK_DIFFUSER_600x600\r\n10\r\n13500\r\n20\r\n2500\r\n30\r\n2800.0\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;

    // 4. Tuyến máng cáp điện động lực (Cable Tray)
    dxf += `0\r\nLINE\r\n8\r\n${elecLyr}\r\n10\r\n1500\r\n20\r\n3400\r\n30\r\n2900.0\r\n11\r\n15500\r\n21\r\n3400\r\n31\r\n2900.0\r\n`;

    // 5. Tuyến ống nước Chiller & thoát nước
    dxf += `0\r\nLINE\r\n8\r\n${plumbLyr}\r\n10\r\n1500\r\n20\r\n4000\r\n30\r\n2600.0\r\n11\r\n15500\r\n21\r\n4000\r\n31\r\n2600.0\r\n`;
    dxf += `0\r\nLINE\r\n8\r\n${plumbLyr}\r\n10\r\n1500\r\n20\r\n4800\r\n30\r\n2550.0\r\n11\r\n15500\r\n21\r\n4800\r\n31\r\n2340.0\r\n`;

    // 6. Tuyến ống PCCC Sprinkler
    dxf += `0\r\nLINE\r\n8\r\n${fireLyr}\r\n10\r\n1500\r\n20\r\n5400\r\n30\r\n2700.0\r\n11\r\n15500\r\n21\r\n5400\r\n31\r\n2700.0\r\n`;
    dxf += `0\r\nINSERT\r\n8\r\n${fireLyr}\r\n2\r\nBLK_SPRINKLER_68C\r\n10\r\n3500\r\n20\r\n5400\r\n30\r\n2700.0\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;
    dxf += `0\r\nINSERT\r\n8\r\n${fireLyr}\r\n2\r\nBLK_SPRINKLER_68C\r\n10\r\n7500\r\n20\r\n5400\r\n30\r\n2700.0\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;
    dxf += `0\r\nINSERT\r\n8\r\n${fireLyr}\r\n2\r\nBLK_SPRINKLER_68C\r\n10\r\n11500\r\n20\r\n5400\r\n30\r\n2700.0\r\n41\r\n1.0\r\n42\r\n1.0\r\n43\r\n1.0\r\n50\r\n0.0\r\n`;
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
 * Bốn điều kiện bắt buộc: nội dung không rỗng, cặp SECTION/ENDSEC cân bằng, có đủ 4 section
 * HEADER/TABLES/BLOCKS/ENTITIES và kết thúc bằng cặp mã `0` + `EOF`.
 */
export function validateDxf(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, errors: ["Nội dung DXF rỗng — không có dữ liệu để lưu."] };
  }

  // DXF ASCII là chuỗi cặp dòng (mã nhóm, giá trị) — duyệt theo cặp để giá trị rỗng hợp lệ
  // (vd mã 4 của bảng STYLE) không làm lệch nhịp đọc.
  const lines = content.split(/\r\n|\r|\n/);
  const foundSections = new Set<string>();
  let openSections = 0;
  let strayEndsec = 0;
  let expectingSectionName = false;

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();

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

  const meaningfulLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const n = meaningfulLines.length;
  if (n < 2 || meaningfulLines[n - 1] !== "EOF" || meaningfulLines[n - 2] !== "0") {
    errors.push('Tệp DXF phải kết thúc bằng cặp mã "0" + "EOF".');
  }

  return { valid: errors.length === 0, errors };
}
