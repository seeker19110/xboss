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
import { RULE_PACK_HIEN_HANH } from "@/lib/ky-thuat/cad/rule-pack-hien-hanh";

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
export function hasToken(l: string, token: string): boolean {
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

/**
 * Đúng khi tên layer chứa ít nhất một trong các từ khóa (theo ranh giới token).
 *
 * Xuất ra ngoài để **mọi** chỗ khớp theo quy tắc rule pack (`layerMap`, `takeoff.layerMatchAny`,
 * `takeoff.blockNameMatchAny`) dùng chung MỘT bộ khớp — đúng cam kết trong
 * `layerMap.matchingNote` và bản C# `XBoss.Cad.Core/Matching/TokenMatcher.cs`. Chuỗi và từ khóa
 * truyền vào phải đã chữ hoa.
 */
export function hasAnyToken(l: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => hasToken(l, token));
}

/** Hình dạng tối thiểu của rule pack mà lớp ánh xạ layer cần đọc. `drawTools` chỉ có từ v4 —
 *  v1/v2/v3 không khai khối này nên phải là tuỳ chọn. */
export interface RulePackAnhXaLayer {
  layerMap: { groups: readonly { branches: readonly { target: string }[] }[] };
  drawTools?: { edgeLayerSuffix?: string };
}

/**
 * Tập tên layer ĐÃ đúng chuẩn, lấy thẳng từ rule pack (không hard-code danh sách tên trong code):
 * mọi `layerMap.groups[].branches[].target`, cộng biến thể nét biên
 * `<target><drawTools.edgeLayerSuffix>` (M100 FR4 — nét biên là layer riêng, KHÔNG được gộp về
 * layer tim vì sẽ bóc trùng khối lượng).
 *
 * Tên trả về đã chữ hoa để so khớp không phân biệt hoa thường.
 */
export function tapLayerDaChuan(pack: RulePackAnhXaLayer): ReadonlySet<string> {
  const ten = new Set<string>();
  const hauTo = (pack.drawTools?.edgeLayerSuffix ?? "").toUpperCase();
  for (const group of pack.layerMap.groups) {
    for (const branch of group.branches) {
      const target = branch.target.toUpperCase();
      ten.add(target);
      if (hauTo) ten.add(target + hauTo);
    }
  }
  return ten;
}

/** Tính một lần cho rule pack đang phát hành — bảng chỉ vài chục tên, không đổi lúc chạy. */
const LAYER_DA_CHUAN = tapLayerDaChuan(RULE_PACK_HIEN_HANH);

/**
 * Chuẩn hóa tên layer AutoCAD về chuẩn AIA / BS1192 / ISO 13567 cho 5 phân hệ MEPF.
 *
 * Thứ tự nhánh: gió → điện nặng → ELV → ống nước → PCCC → kết cấu → ghi chú. Điện/ELV phải kiểm
 * TRƯỚC ống nước vì `"CAP"` (ý định: nước cấp) cũng là một token hợp lệ trong `"MANG_CAP_DIEN"` /
 * `"MANG_CAP_ELV"`, nơi nó mang nghĩa "cáp" chứ không phải "cấp".
 *
 * **Bất biến idempotent** (vá 2026-08-25): tên đã là một layer đích của rule pack — hoặc layer nét
 * biên của nó — thì giữ nguyên, không đem đi khớp token lại. Thiếu chốt này, chạy chuẩn hóa lần 2
 * trên bản vẽ đã chuẩn hóa sẽ gộp nhầm hệ (`M-DUCT-EXHT`→`M-DUCT-SUPP`, `F-SPRN-PIPE`→
 * `P-PIPE-DOMW`, `M-DUCT-SUPPEDGE`→`M-DUCT-SUPP`) vì token của tên đích không nằm trong `matchAny`
 * của chính nhóm nó (`EXHT` ≠ `EA`, `SANR` ≠ `THOAT`…) nên rơi vào nhánh `default` của nhóm khác.
 */
export function normalizeCadLayers(layers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const layer of layers) {
    const l = layer.toUpperCase();
    if (LAYER_DA_CHUAN.has(l)) {
      // Đã đúng chuẩn — chỉ chuẩn hoá hoa/thường về đúng dạng khai trong rule pack.
      mapping[layer] = l;
    } else if (hasAnyToken(l, ["DUCT", "GIO", "AHU", "FCU", "SA", "RA", "EA", "OA"])) {
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
    | "TOLERANCE"
    | "VIEWPORT"
    // ATTRIB không nằm trong PARSED_ENTITY_TYPES vì nó luôn là con của INSERT, không đứng riêng
    | "ATTRIB";
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
    /** Đa tuyến 3D (cờ 70 bit 8) — đỉnh có cao độ khác nhau, không ép về đa tuyến phẳng được */
    is3d?: boolean;
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
    /** Vector knot của SPLINE (mã 40 lặp lại) — thiếu nó thì không dựng lại được đúng đường cong */
    knots?: number[];
    /** Bậc của SPLINE (mã 71) */
    degree?: number;
    /** Các điểm điều khiển của SPLINE (mã 10/20/30) khi bản vẽ khai cả điểm khớp lẫn điểm điều khiển */
    controlPoints?: Array<[number, number, number]>;
    /** Tham số bắt đầu / kết thúc của ELLIPSE (mã 41/42) — cung ellipse chứ không phải ellipse đủ */
    startParam?: number;
    endParam?: number;
    /** Từng đường dẫn riêng của MULTILEADER (một chú thích có thể có nhiều nhánh) */
    leaderLines?: Array<Array<[number, number, number]>>;
    /** Các đường bao vùng tô của HATCH (mã 91/92/93) */
    boundaryPaths?: HatchBoundaryPath[];
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
  /** Tên KIỂU kích thước của DIMENSION / LEADER / TOLERANCE (mã 3) — khác kiểu chữ (mã 7) */
  dimStyle?: string;
  /** HATCH tô đặc (cờ 70 bit 1) */
  isSolidFill?: boolean;
  /** Góc và tỷ lệ mẫu tô của HATCH (mã 52/41) */
  hatchAngle?: number;
  hatchScale?: number;
  /** Định nghĩa các nét gạch của mẫu tô (mã 53/43/44/45/46/79/49) — thiếu thì AutoCAD tô rỗng */
  hatchPatternLines?: Array<{
    angle: number;
    baseX: number;
    baseY: number;
    offsetX: number;
    offsetY: number;
    dashes: number[];
  }>;
  /** Các ATTRIB đi kèm INSERT, giữ nguyên vị trí và cỡ chữ để ghi lại đúng chỗ */
  attribEntities?: DxfEntityRaw[];
  /** Cấu trúc đỉnh đầy đủ của MLINE, giữ để ghi lại nguyên bản thay vì hạ thành đa tuyến */
  mlineVertices?: Array<{
    point: [number, number, number];
    direction?: [number, number, number];
    miter?: [number, number, number];
    elements: number[][];
  }>;
  /** Tỷ lệ (mã 40) và kiểu canh (mã 71) của MLINE */
  mlineScale?: number;
  mlineJustification?: number;
  /** Khung nhìn của không gian giấy (VIEWPORT) — quyết định bố cục in thấy phần nào của bản vẽ */
  viewport?: {
    width: number;
    height: number;
    viewCenter?: [number, number];
    viewHeight?: number;
    status: number;
    id: number;
    twistAngle?: number;
  };
  /** Handle của IMAGEDEF mà IMAGE/WIPEOUT trỏ tới (mã 340) */
  imageDefHandle?: string;
  /** Vector cạnh U và V của ảnh chèn (mã 11/21/31 và 12/22/32) — quyết định cỡ và hướng ảnh */
  imageUVector?: [number, number, number];
  imageVVector?: [number, number, number];
  /** Kích thước ảnh tính bằng điểm ảnh (mã 13/23) */
  imageSizePx?: [number, number];
  /** Độ sáng / tương phản / độ mờ của ảnh (mã 281/282/283) */
  imageDisplay?: { brightness: number; contrast: number; fade: number; flags: number };
  /** Dữ liệu nhánh dẫn của MULTILEADER, giữ để ghi lại nguyên bản thay vì hạ cấp */
  mleaderContext?: {
    leaders: Array<{
      lastPoint?: [number, number, number];
      doglegVector?: [number, number, number];
      doglegLength?: number;
    }>;
    textStyleHandle?: string;
  };
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
  /**
   * Định nghĩa ảnh chèn đọc từ section OBJECTS (`IMAGEDEF`) — thực thể IMAGE/WIPEOUT chỉ mang
   * handle trỏ tới đây, nên không đọc OBJECTS thì mất đường dẫn ảnh và kích thước gốc.
   */
  imageDefs?: Array<{
    handle: string;
    path: string;
    /** Kích thước ảnh tính bằng điểm ảnh (mã 10/20) */
    sizePx?: [number, number];
    /** Kích thước một điểm ảnh theo đơn vị vẽ (mã 11/21) */
    pixelSize?: [number, number];
  }>;
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
  return giaiMaByteDxf(buf);
}

/**
 * Bản chạy được ở CẢ máy chủ lẫn TRÌNH DUYỆT của `decodeDxfBytes` — không phụ thuộc `Buffer`.
 *
 * Vì sao cần: trang chuẩn hoá đọc tệp bằng `FileReader.readAsText()`, mà `readAsText` không có
 * tham số bảng mã thì **mặc định UTF-8**. Bản vẽ Việt Nam đời cũ ghi bằng TCVN3/ABC, VNI hay
 * CP1258 sẽ mất sạch chữ có dấu thành `\uFFFD` ngay ở bước đọc tệp — **không thể khôi phục**, vì
 * byte gốc đã bị trình duyệt vứt đi trước khi Bác Sĩ Font kịp nhìn thấy. Máy chủ xử lý đúng chuyện
 * này từ lâu (`parse-dxf/route.ts` truyền thẳng Buffer), client thì chưa bao giờ (audit 2026-08-24).
 *
 * Nhánh dự phòng cố ý **tự map byte → mã điểm** thay vì `new TextDecoder("latin1")`: nhãn
 * "latin1" của WHATWG thực chất là windows-1252, khác latin1 thật ở dải 0x80–0x9F — đúng dải mà
 * bảng mã VNI dùng. Dùng nhầm là hỏng đúng thứ đang muốn cứu.
 */
export function giaiMaByteDxf(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Ghép theo khối để không vượt giới hạn số tham số của String.fromCharCode với tệp lớn.
    const KHOI = 0x2000;
    let ket = "";
    for (let i = 0; i < bytes.length; i += KHOI) {
      ket += String.fromCharCode(...bytes.subarray(i, Math.min(i + KHOI, bytes.length)));
    }
    return ket;
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
 * nội dung bản vẽ; dựng lại nó đòi cả bố cục in (LAYOUT) mà bộ ghi này không tái tạo.
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
  "VIEWPORT",
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

/**
 * Một cạnh của đường bao vùng tô HATCH. Giữ đúng KIỂU cạnh (đoạn thẳng / cung / cung ellipse /
 * spline) thay vì bẻ hết thành đoạn thẳng, để tệp ghi ra dựng lại đúng vùng tô cong.
 */
export type HatchEdge =
  | { type: "line"; start: [number, number, number]; end: [number, number, number] }
  | {
      type: "arc";
      center: [number, number, number];
      radius: number;
      startAngle: number;
      endAngle: number;
      ccw: boolean;
    }
  | {
      type: "ellipse";
      center: [number, number, number];
      majorAxis: [number, number, number];
      ratio: number;
      startAngle?: number;
      endAngle?: number;
      points: Array<[number, number, number]>;
    }
  | { type: "spline"; points: Array<[number, number, number]>; degree?: number };

/** Một đường bao vùng tô: hoặc là đa tuyến, hoặc là chuỗi cạnh có kiểu. */
export interface HatchBoundaryPath {
  /** Chuỗi đỉnh đã rời rạc hoá — để tính khung bao và cho bên tiêu thụ không quan tâm kiểu cạnh */
  points: Array<[number, number, number]>;
  bulges: number[];
  closed: boolean;
  /** Đường bao khai dưới dạng đa tuyến (mã 92 bit 2) */
  isPolyline?: boolean;
  /** Các cạnh có kiểu, chỉ có khi đường bao KHÔNG phải đa tuyến */
  edges?: HatchEdge[];
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
  paths: HatchBoundaryPath[];
  seeds: Array<[number, number, number]>;
  patternLines: NonNullable<DxfEntityRaw["hatchPatternLines"]>;
} {
  const paths: HatchBoundaryPath[] = [];
  const seeds: Array<[number, number, number]> = [];
  // Định nghĩa các nét gạch của mẫu tô (mã 78 số dòng; mỗi dòng 53/43/44/45/46/79 + 49 lặp lại).
  // Thiếu phần này thì tệp ghi ra có HATCH nhưng AutoCAD tô rỗng — nhìn như mất vùng tô.
  const patternLines: NonNullable<DxfEntityRaw["hatchPatternLines"]> = [];
  let patternLine: NonNullable<DxfEntityRaw["hatchPatternLines"]>[number] | null = null;

  let inBoundary = false;
  let inSeeds = false;
  let current: HatchBoundaryPath | null = null;
  let edge: HatchEdge | null = null;

  /** Kết thúc cạnh đang đọc dở: bổ sung điểm rời rạc để tính khung bao và cho bên tiêu thụ cũ. */
  const closeEdge = () => {
    if (!current || !edge) return;
    if (edge.type === "line") {
      current.points.push(edge.start, edge.end);
      current.bulges.push(0, 0);
    } else if (edge.type === "arc") {
      arcToPoints(
        edge.center[0],
        edge.center[1],
        edge.radius,
        edge.startAngle,
        edge.endAngle,
      ).forEach((pt) => {
        current!.points.push(pt);
        current!.bulges.push(0);
      });
    } else if (edge.type === "ellipse" || edge.type === "spline") {
      edge.points.forEach((pt) => {
        current!.points.push(pt);
        current!.bulges.push(0);
      });
    }
    current.edges!.push(edge);
    edge = null;
  };

  const closePath = () => {
    closeEdge();
    if (current && current.points.length > 0) paths.push(current);
    current = null;
  };

  for (const { code, value } of group) {
    // ── Định nghĩa nét gạch mẫu tô ──
    if (code === 53) {
      if (patternLine) patternLines.push(patternLine);
      patternLine = { angle: num(value), baseX: 0, baseY: 0, offsetX: 0, offsetY: 0, dashes: [] };
      continue;
    }
    if (patternLine) {
      if (code === 43) {
        patternLine.baseX = num(value);
        continue;
      }
      if (code === 44) {
        patternLine.baseY = num(value);
        continue;
      }
      if (code === 45) {
        patternLine.offsetX = num(value);
        continue;
      }
      if (code === 46) {
        patternLine.offsetY = num(value);
        continue;
      }
      if (code === 49) {
        patternLine.dashes.push(num(value));
        continue;
      }
    }

    if (code === 91) {
      inBoundary = true;
      continue;
    }
    if (code === 98) {
      // Kết thúc phần ranh giới, sang danh sách điểm gieo mẫu tô
      closePath();
      inBoundary = false;
      inSeeds = true;
      continue;
    }
    if (code === 75 || code === 76 || code === 47) {
      // Các mã kiểu/tỷ lệ mẫu tô nằm sau phần ranh giới
      closePath();
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
      closePath();
      const flags = num(value);
      // Bit 2 = đường bao là một đa tuyến; không có bit này thì đường bao gồm các CẠNH có kiểu
      current = {
        points: [],
        bulges: [],
        closed: false,
        isPolyline: Boolean(flags & 2),
        edges: Boolean(flags & 2) ? undefined : [],
      };
      continue;
    }
    if (!current) continue;

    // ── Đường bao dạng đa tuyến ──
    if (current.isPolyline) {
      if (code === 73) {
        current.closed = num(value) === 1;
        continue;
      }
      if (code === 10) {
        current.points.push([num(value), 0, 0]);
        current.bulges.push(0);
        continue;
      }
      if (code === 20 && current.points.length > 0) {
        current.points[current.points.length - 1][1] = num(value);
        continue;
      }
      if (code === 42 && current.points.length > 0) {
        current.bulges[current.points.length - 1] = num(value);
        continue;
      }
      continue;
    }

    // ── Đường bao theo cạnh có kiểu: 1 = đoạn thẳng, 2 = cung, 3 = cung ellipse, 4 = spline ──
    if (code === 72) {
      closeEdge();
      const t = num(value);
      if (t === 1) edge = { type: "line", start: [0, 0, 0], end: [0, 0, 0] };
      else if (t === 2)
        edge = {
          type: "arc",
          center: [0, 0, 0],
          radius: 0,
          startAngle: 0,
          endAngle: 360,
          ccw: true,
        };
      else if (t === 3)
        edge = { type: "ellipse", center: [0, 0, 0], majorAxis: [0, 0, 0], ratio: 1, points: [] };
      else edge = { type: "spline", points: [] };
      continue;
    }
    if (!edge) continue;

    if (edge.type === "line") {
      if (code === 10) edge.start[0] = num(value);
      else if (code === 20) edge.start[1] = num(value);
      else if (code === 11) edge.end[0] = num(value);
      else if (code === 21) edge.end[1] = num(value);
      continue;
    }
    if (edge.type === "arc") {
      if (code === 10) edge.center[0] = num(value);
      else if (code === 20) edge.center[1] = num(value);
      else if (code === 40) edge.radius = num(value);
      else if (code === 50) edge.startAngle = num(value);
      else if (code === 51) edge.endAngle = num(value);
      else if (code === 73) edge.ccw = num(value) === 1;
      continue;
    }
    if (edge.type === "ellipse") {
      if (code === 10) edge.center[0] = num(value);
      else if (code === 20) edge.center[1] = num(value);
      else if (code === 11) edge.majorAxis[0] = num(value);
      else if (code === 21) edge.majorAxis[1] = num(value);
      else if (code === 40) edge.ratio = num(value);
      else if (code === 50) edge.startAngle = num(value);
      else if (code === 51) edge.endAngle = num(value);
      continue;
    }
    if (edge.type === "spline") {
      if (code === 10) edge.points.push([num(value), 0, 0]);
      else if (code === 20 && edge.points.length > 0)
        edge.points[edge.points.length - 1][1] = num(value);
      else if (code === 94) edge.degree = num(value);
      continue;
    }
  }

  closePath();
  if (patternLine) patternLines.push(patternLine);

  return { paths, seeds, patternLines };
}

/**
 * Đọc cấu trúc đỉnh của MLINE (đường nhiều nét).
 *
 * Mỗi đỉnh gồm ba vector — vị trí (11/21/31), hướng đoạn (12/22/32) và hướng vát mối nối
 * (13/23/33) — kèm tham số của từng nét thành phần (74 số tham số + 41 giá trị, 75/42 cho phần tô).
 * Giữ nguyên cả ba mới ghi lại được MLINE thật; chỉ giữ vị trí thì phải hạ cấp thành đa tuyến,
 * mất phần nét kép và mối nối vát.
 */
function parseMlineVertices(group: DxfPair[]): Array<{
  point: [number, number, number];
  direction?: [number, number, number];
  miter?: [number, number, number];
  elements: number[][];
}> {
  const verts: Array<{
    point: [number, number, number];
    direction?: [number, number, number];
    miter?: [number, number, number];
    elements: number[][];
  }> = [];
  let element: number[] | null = null;

  const last = () => verts[verts.length - 1];

  for (const { code, value } of group) {
    switch (code) {
      case 11:
        verts.push({ point: [num(value), 0, 0], elements: [] });
        element = null;
        break;
      case 21:
        if (verts.length) last().point[1] = num(value);
        break;
      case 31:
        if (verts.length) last().point[2] = num(value);
        break;
      case 12:
        if (verts.length) last().direction = [num(value), 0, 0];
        break;
      case 22:
        if (verts.length && last().direction) last().direction![1] = num(value);
        break;
      case 32:
        if (verts.length && last().direction) last().direction![2] = num(value);
        break;
      case 13:
        if (verts.length) last().miter = [num(value), 0, 0];
        break;
      case 23:
        if (verts.length && last().miter) last().miter![1] = num(value);
        break;
      case 33:
        if (verts.length && last().miter) last().miter![2] = num(value);
        break;
      case 74:
        if (verts.length) {
          element = [];
          last().elements.push(element);
        }
        break;
      case 41:
        if (element) element.push(num(value));
        break;
    }
  }

  return verts;
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
  /** Mỗi đường dẫn là một chuỗi đỉnh — một chú thích có thể có nhiều đường dẫn toả ra */
  leaderLines: Array<Array<[number, number, number]>>;
  textHeight?: number;
  textRotation?: number;
  textStyleHandle?: string;
  /** Điểm cuối đường dẫn và vector gấp khúc của từng nhánh (mã 10/11 trong khối LEADER) */
  leaders: Array<{
    lastPoint?: [number, number, number];
    doglegVector?: [number, number, number];
    doglegLength?: number;
  }>;
} {
  let text = "";
  let textPoint: [number, number, number] | undefined;
  let textHeight: number | undefined;
  let textRotation: number | undefined;
  let textStyleHandle: string | undefined;
  const leaderLines: Array<Array<[number, number, number]>> = [];
  const leaders: Array<{
    lastPoint?: [number, number, number];
    doglegVector?: [number, number, number];
    doglegLength?: number;
  }> = [];

  // Ba mức lồng nhau, mở/đóng bằng cặp mã riêng:
  //   300 CONTEXT_DATA{ … 301 }
  //     302 LEADER{ … 303 }
  //       304 LEADER_LINE{ … 305 }
  // Mã 304 mang HAI nghĩa tuỳ mức: ở mức ngữ cảnh là chữ chú thích, ở trong LEADER{ là thẻ mở
  // LEADER_LINE{. Phân biệt bằng mức lồng — không thể phân biệt bằng riêng mã nhóm.
  let inContext = false;
  let inLeader = false;
  let inLeaderLine = false;
  let current: Array<[number, number, number]> | null = null;
  let sawContextPoint = false;

  /** Đặt một thành phần toạ độ cho điểm đang đọc dở, đúng theo mức lồng hiện tại. */
  const setOrdinate = (idx: 0 | 1 | 2, v: number) => {
    if (inLeaderLine && current && current.length > 0) current[current.length - 1][idx] = v;
    else if (inLeader && leaders.length > 0 && leaders[leaders.length - 1].lastPoint)
      leaders[leaders.length - 1].lastPoint![idx] = v;
    else if (inContext && textPoint && sawContextPoint) textPoint[idx] = v;
  };

  for (const { code, value } of group) {
    if (code === 300) {
      inContext = value.includes("CONTEXT_DATA");
      continue;
    }
    if (code === 301) {
      inContext = false;
      continue;
    }
    if (code === 302) {
      inLeader = true;
      leaders.push({});
      continue;
    }
    if (code === 303) {
      inLeader = false;
      continue;
    }
    if (code === 304) {
      if (inLeader) {
        // Thẻ mở một đường dẫn mới
        inLeaderLine = true;
        current = [];
        leaderLines.push(current);
      } else {
        // Ở mức ngữ cảnh, mã 304 là chữ chú thích
        text += value;
      }
      continue;
    }
    if (code === 305) {
      inLeaderLine = false;
      current = null;
      continue;
    }

    if (code === 10) {
      if (inLeaderLine && current) current.push([num(value), 0, 0]);
      else if (inLeader && leaders.length > 0)
        leaders[leaders.length - 1].lastPoint = [num(value), 0, 0];
      else if (inContext && !sawContextPoint) {
        textPoint = [num(value), 0, 0];
        sawContextPoint = true;
      }
      continue;
    }
    if (code === 20) {
      setOrdinate(1, num(value));
      continue;
    }
    if (code === 30) {
      setOrdinate(2, num(value));
      continue;
    }
    if (code === 11 && inLeader && leaders.length > 0) {
      leaders[leaders.length - 1].doglegVector = [num(value), 0, 0];
      continue;
    }
    if (code === 21 && inLeader && leaders.length > 0 && leaders[leaders.length - 1].doglegVector) {
      leaders[leaders.length - 1].doglegVector![1] = num(value);
      continue;
    }
    if (code === 31 && inLeader && leaders.length > 0 && leaders[leaders.length - 1].doglegVector) {
      leaders[leaders.length - 1].doglegVector![2] = num(value);
      continue;
    }
    if (code === 40) {
      if (inLeader && leaders.length > 0)
        leaders[leaders.length - 1].doglegLength = numOrUndef(value);
      continue;
    }
    if (code === 41 && inContext && textHeight === undefined) {
      // Mã 41 trong ngữ cảnh là CHIỀU CAO CHỮ (mã 40 là tỷ lệ nội dung, khác nghĩa)
      textHeight = numOrUndef(value);
      continue;
    }
    if (code === 42 && inContext && textRotation === undefined) {
      textRotation = numOrUndef(value);
      continue;
    }
    if (code === 340 && inContext && !textStyleHandle) {
      textStyleHandle = value.trim();
      continue;
    }
  }

  return { text, textPoint, leaderLines, leaders, textHeight, textRotation, textStyleHandle };
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
  let val45: number | undefined; // bước lặp theo hàng của MINSERT / chiều cao vùng nhìn VIEWPORT
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
  let val52: number | undefined; // góc mẫu tô của HATCH
  let hatchPatternLines: DxfEntityRaw["hatchPatternLines"];
  let dimStyle: string | undefined;
  let imageDefHandle: string | undefined;
  let x12: number | undefined;
  let y22: number | undefined;
  let z32: number | undefined;
  let val281: number | undefined;
  let val282: number | undefined;
  let val283: number | undefined;
  let val68: number | undefined;
  let val69: number | undefined;
  let mleader: ReturnType<typeof parseMultiLeader> | undefined;
  let mlineVertices: ReturnType<typeof parseMlineVertices> | undefined;

  const points: Array<[number, number, number]> = [];
  const bulges: number[] = [];
  const knots: number[] = [];
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
        // Mã 3 mang nghĩa khác nhau tuỳ loại thực thể — gộp hết vào nội dung chữ như trước làm
        // chữ kích thước "4000" hoá "4000STANDARD" (tên kiểu kích thước bị nối vào số đo):
        //   MTEXT            → một mảnh của chữ dài (kết thúc bằng mã 1)
        //   ATTDEF           → câu nhắc nhập liệu
        //   DIMENSION/LEADER/TOLERANCE → TÊN KIỂU kích thước
        if (type === "ATTDEF") attributePrompt = value.trim();
        else if (type === "DIMENSION" || type === "LEADER" || type === "TOLERANCE")
          dimStyle = value.trim();
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
        else x12 = numOrUndef(value);
        break;
      case 22:
        if (isCornerLike && corners.length > 0) corners[corners.length - 1][1] = num(value);
        else y22 = numOrUndef(value);
        break;
      case 32:
        if (isCornerLike && corners.length > 0) corners[corners.length - 1][2] = num(value);
        else z32 = numOrUndef(value);
        break;
      case 281:
        val281 = numOrUndef(value);
        break;
      case 282:
        val282 = numOrUndef(value);
        break;
      case 283:
        val283 = numOrUndef(value);
        break;
      case 340:
        if (isRaster) imageDefHandle = value.trim();
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
        // Ở SPLINE, mã 40 lặp lại là VECTOR KNOT — không có nó thì không dựng lại đúng đường cong
        if (type === "SPLINE") knots.push(num(value));
        else val40 = numOrUndef(value);
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
      case 68:
        val68 = numOrUndef(value);
        break;
      case 69:
        val69 = numOrUndef(value);
        break;
      case 50:
        val50 = numOrUndef(value);
        break;
      case 52:
        val52 = numOrUndef(value);
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
    // Cờ 70 bit 8 = đa tuyến 3D: các đỉnh có cao độ khác nhau, KHÔNG được ép về LWPOLYLINE phẳng
    coordinates.is3d = Boolean(flags70 !== undefined && flags70 & 8);
    if (z30 !== undefined) coordinates.elevation = z30;
  } else if (type === "SPLINE") {
    // Đường cong SPLINE dùng điểm khớp (11/21/31) nếu có, không có thì dùng điểm điều khiển.
    coordinates.points = fitPoints.length > 0 ? fitPoints : points;
    coordinates.closed = Boolean(flags70 !== undefined && flags70 & 1);
    if (points.length > 0) coordinates.controlPoints = points;
    if (knots.length > 0) coordinates.knots = knots;
    if (val71 !== undefined) coordinates.degree = val71;
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
    // Mã 41/42 là tham số bắt đầu/kết thúc — khác 0…2π nghĩa là CUNG ellipse, không phải ellipse đủ
    if (val41 !== undefined) coordinates.startParam = val41;
    if (val42 !== undefined) coordinates.endParam = val42;
  } else if (isCornerLike) {
    coordinates.corners = corners;
    if (corners.length > 0) coordinates.center = corners[0];
  } else if (type === "XLINE" || type === "RAY") {
    // Đường dựng hình: mã 10 là điểm gốc, mã 11 là VECTOR hướng đơn vị (không phải điểm thứ hai)
    coordinates.start = pointOf(x10, y20, z30);
    coordinates.direction = pointOf(x11, y21, z31);
  } else if (isMline) {
    mlineVertices = parseMlineVertices(group);
    coordinates.points = mlineVertices.map((v) => v.point);
    coordinates.closed = Boolean(flags70 !== undefined && flags70 & 2);
  } else if (isRaster) {
    // Ảnh chèn / vùng che: điểm chèn (10), hai vector cạnh U và V (11/12) quyết định cỡ và hướng,
    // kích thước điểm ảnh (13), và đường bao cắt (14/24 lặp lại).
    coordinates.center = pointOf(x10, y20, z30);
    if (points.length > 0) {
      coordinates.points = points;
      coordinates.closed = true;
    }
  } else if (type === "HATCH") {
    const { paths, seeds, patternLines } = parseHatchBoundaries(group);
    if (patternLines.length > 0) hatchPatternLines = patternLines;
    coordinates.boundaryPaths = paths;
    coordinates.center = pointOf(x10, y20, z30) || seeds[0];
    if (paths.length > 0) {
      coordinates.points = paths[0].points;
      coordinates.bulges = paths[0].bulges;
      coordinates.closed = paths[0].closed;
    }
  } else if (type === "MULTILEADER") {
    const ml = parseMultiLeader(group);
    const gop = ml.leaderLines.flat();
    coordinates.points = gop;
    coordinates.leaderLines = ml.leaderLines;
    coordinates.center = ml.textPoint || pointOf(x10, y20, z30);
    if (gop.length > 0) {
      coordinates.start = gop[0];
      coordinates.end = gop[gop.length - 1];
    }
    if (ml.text) text = ml.text;
    if (ml.textHeight !== undefined) val40 = ml.textHeight;
    if (ml.textRotation !== undefined) val50 = ml.textRotation;
    mleader = ml;
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
  if (dimStyle) entity.dimStyle = dimStyle;
  if (mlineVertices && mlineVertices.length > 0) {
    entity.mlineVertices = mlineVertices;
    if (val40 !== undefined) entity.mlineScale = val40;
    if (val71 !== undefined) entity.mlineJustification = val71;
  }
  if (mleader) {
    entity.mleaderContext = {
      leaders: mleader.leaders,
      textStyleHandle: mleader.textStyleHandle,
    };
  }

  if (
    type === "TEXT" ||
    type === "MTEXT" ||
    type === "ATTDEF" ||
    type === "ATTRIB" ||
    type === "MULTILEADER"
  ) {
    if (val40 !== undefined) entity.textHeight = val40;
    if (val41 !== undefined && (type === "TEXT" || type === "ATTDEF" || type === "ATTRIB"))
      entity.widthFactor = val41;
    if (val50 !== undefined) entity.rotation = val50;
    if (type === "ATTDEF") {
      // Ở ATTDEF, mã 2 là THẺ thuộc tính chứ không phải tên khối
      if (blockName) entity.attributeTag = blockName;
      entity.blockName = undefined;
      if (attributePrompt) entity.attributePrompt = attributePrompt;
    }
    // TEXT có canh lề (mã 72/73 khác 0) thì điểm đặt thật là mã 11, không phải mã 10
    if (
      (type === "TEXT" || type === "ATTDEF" || type === "ATTRIB") &&
      ((val72 ?? 0) !== 0 || (val73 ?? 0) !== 0)
    ) {
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
  } else if (type === "VIEWPORT") {
    // Khung nhìn trên không gian giấy: tâm và cỡ khung (10/40/41), rồi tâm và chiều cao của
    // phần model space mà nó nhìn vào (12/22 và 45).
    entity.viewport = {
      width: val40 ?? 0,
      height: val41 ?? 0,
      viewCenter: x12 !== undefined && y22 !== undefined ? [x12, y22] : undefined,
      viewHeight: val45,
      status: val68 ?? 1,
      id: val69 ?? 2,
      twistAngle: val51,
    };
  } else if (type === "WIPEOUT" || type === "IMAGE") {
    entity.imageUVector = pointOf(x11, y21, z31);
    entity.imageVVector = pointOf(x12, y22, z32);
    if (x13 !== undefined && y23 !== undefined) entity.imageSizePx = [x13, y23];
    if (imageDefHandle) entity.imageDefHandle = imageDefHandle;
    entity.imageDisplay = {
      flags: flags70 ?? 7,
      brightness: val281 ?? 50,
      contrast: val282 ?? 50,
      fade: val283 ?? 0,
    };
  } else if (type === "HATCH") {
    entity.isSolidFill = Boolean(flags70 !== undefined && flags70 & 1);
    if (val52 !== undefined) entity.hatchAngle = val52;
    if (val41 !== undefined) entity.hatchScale = val41;
    if (hatchPatternLines) entity.hatchPatternLines = hatchPatternLines;
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
    const attribEntities: DxfEntityRaw[] = [];
    while (i < pairs.length && pairs[i].code === 0) {
      const sub = pairs[i].value.trim();
      if (sub === "ATTRIB") {
        const attrib = readEntityAt(pairs, i, `${id}-ATT${attribEntities.length + 1}`);
        // ATTRIB dùng chung bộ mã nhóm với TEXT: mã 2 là thẻ, mã 1 là giá trị
        const tag = attrib.entity.blockName;
        if (tag) {
          attrib.entity.attributeTag = tag;
          attrib.entity.blockName = undefined;
          attributes[tag] = attrib.entity.decodedText || "";
        }
        attribEntities.push(attrib.entity);
        i = attrib.next;
      } else if (sub === "SEQEND") {
        i = readGroup(pairs, i + 1).next;
        break;
      } else {
        break;
      }
    }
    if (Object.keys(attributes).length > 0) entity.attributes = attributes;
    if (attribEntities.length > 0) entity.attribEntities = attribEntities;
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
  const imageDefs: NonNullable<DxfParseResult["imageDefs"]> = [];

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

    if (section === "OBJECTS") {
      // Chỉ quan tâm IMAGEDEF: thực thể IMAGE/WIPEOUT chỉ mang handle trỏ tới đây, đường dẫn ảnh
      // và kích thước gốc nằm trong đối tượng này.
      if (marker === "IMAGEDEF") {
        const { group, next } = readGroup(pairs, i + 1);
        let handle = "";
        let duongDan = "";
        let sx: number | undefined;
        let sy: number | undefined;
        let px: number | undefined;
        let py: number | undefined;
        for (const { code, value } of group) {
          if (code === 5) handle = value.trim();
          else if (code === 1) duongDan = value;
          else if (code === 10) sx = numOrUndef(value);
          else if (code === 20) sy = numOrUndef(value);
          else if (code === 11) px = numOrUndef(value);
          else if (code === 21) py = numOrUndef(value);
        }
        if (handle) {
          imageDefs.push({
            handle,
            path: duongDan,
            sizePx: sx !== undefined && sy !== undefined ? [sx, sy] : undefined,
            pixelSize: px !== undefined && py !== undefined ? [px, py] : undefined,
          });
        }
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
    imageDefs: imageDefs.length > 0 ? imageDefs : undefined,
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
 * Chiều cao chữ dùng khi thực thể nguồn không khai mã nhóm 40 — TEXT bắt buộc phải có mã này.
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

/**
 * Bộ cấp phát **handle** — mỗi thực thể, bản ghi bảng, khối và đối tượng trong tệp DXF R2000 phải
 * mang một handle duy nhất (mã 5) và trỏ về chủ sở hữu của nó (mã 330). Đây chính là thứ mà cấu
 * trúc R12 không có, và cũng là lý do bản ghi cũ phải khai AC1009.
 */
class HandleAllocator {
  private next = 0x100;
  take(): string {
    const h = this.next.toString(16).toUpperCase();
    this.next += 1;
    return h;
  }
  get seed(): string {
    return this.next.toString(16).toUpperCase();
  }
}

/** Số nét của kiểu đường nhiều nét `Standard` mà bộ ghi phát ra (offset +0.5 và −0.5). */
const MLINE_STYLE_ELEMENT_COUNT = 2;

/**
 * Khối mã nhóm mở đầu chung của mọi bản ghi trong bảng ký hiệu (SYMBOL TABLE) R2000.
 *
 * NGOẠI LỆ DIMSTYLE — quirk kinh điển của định dạng DXF: bản ghi DIMSTYLE là loại DUY NHẤT
 * dùng mã nhóm **105** cho handle thay vì mã 5 (di sản lịch sử: mã 5 trong ngữ cảnh DIMSTYLE
 * từng mang nghĩa khác từ đời DXF cũ). Ghi mã 5 thì AutoCAD không nhận ra handle của record,
 * lẫn sang handle của chính bảng DIMSTYLE và báo "Bad handle ...: already in use — Error in
 * DIMSTYLE Table — eHandleInUse" rồi huỷ cả bản vẽ — xác nhận thật 2026-08-24 bằng AutoCAD
 * của người dùng trên bản vẽ MEPF 65MB.
 */
function tableRecordHead(type: string, handle: string, owner: string, subClass: string): string {
  const handleCode = type === "DIMSTYLE" ? 105 : 5;
  return (
    `0\r\n${type}\r\n${handleCode}\r\n${handle}\r\n330\r\n${owner}\r\n` +
    `100\r\nAcDbSymbolTableRecord\r\n100\r\n${subClass}\r\n`
  );
}

/** Số thực ghi ra tệp DXF: luôn có phần thập phân để AutoCAD đọc đúng kiểu double. */
function real(v: number | undefined, fallback = 0): string {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/** Hàm cơ sở B-spline theo công thức truy hồi Cox–de Boor. */
function basisFunction(i: number, p: number, u: number, knots: number[]): number {
  if (p === 0) {
    // Đoạn cuối phải bao gồm cả biên phải, nếu không điểm cuối rơi ra ngoài mọi đoạn
    const cuoi = knots[knots.length - 1];
    if (u === cuoi) return knots[i] <= u && u <= knots[i + 1] && knots[i] < knots[i + 1] ? 1 : 0;
    return knots[i] <= u && u < knots[i + 1] ? 1 : 0;
  }
  let trai = 0;
  const mauTrai = knots[i + p] - knots[i];
  if (mauTrai !== 0) trai = ((u - knots[i]) / mauTrai) * basisFunction(i, p - 1, u, knots);
  let phai = 0;
  const mauPhai = knots[i + p + 1] - knots[i + 1];
  if (mauPhai !== 0)
    phai = ((knots[i + p + 1] - u) / mauPhai) * basisFunction(i + 1, p - 1, u, knots);
  return trai + phai;
}

/** Giải hệ tuyến tính A·x = b bằng khử Gauss có chọn trụ. Trả `null` nếu hệ suy biến. */
function solveLinearSystem(A: number[][], b: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...b[i]]);
  const soCot = b[0].length;

  for (let col = 0; col < n; col++) {
    let tru = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[tru][col])) tru = r;
    if (Math.abs(M[tru][col]) < 1e-12) return null;
    [M[col], M[tru]] = [M[tru], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const he = M[r][col] / M[col][col];
      if (he === 0) continue;
      for (let c = col; c < n + soCot; c++) M[r][c] -= he * M[col][c];
    }
  }

  // Sau khử Gauss–Jordan, hàng r chỉ còn trụ ở đúng cột r
  return M.map((row, r) => {
    const out: number[] = [];
    for (let c = 0; c < soCot; c++) out.push(row[n + c] / row[r]);
    return out;
  });
}

/**
 * Nội suy toàn cục một đường cong B-spline **đi qua đúng** các điểm khớp cho trước
 * (Piegl & Tiller, "The NURBS Book", thuật toán A9.1 dạng hệ vuông).
 *
 * Dùng khi bản vẽ nguồn chỉ khai điểm khớp mà không kèm vector knot: ghi ra một SPLINE thiếu knot
 * là tạo thực thể hỏng, còn hạ xuống đa tuyến là bẻ đường cong thành đoạn thẳng. Nội suy cho ra
 * đúng đường cong đi qua từng điểm khớp — giữ được hình, không bịa thêm dữ liệu nào.
 */
function interpolateSpline(
  fitPoints: Array<[number, number, number]>,
  degreeMongMuon = 3,
): { degree: number; knots: number[]; controlPoints: Array<[number, number, number]> } | null {
  const n = fitPoints.length - 1;
  if (n < 1) return null;
  const p = Math.min(degreeMongMuon, n);

  // Tham số hoá theo căn bậc hai độ dài dây cung (centripetal) — ổn định hơn dây cung thuần
  const khoang: number[] = [];
  let tong = 0;
  for (let k = 1; k <= n; k++) {
    const d = Math.hypot(
      fitPoints[k][0] - fitPoints[k - 1][0],
      fitPoints[k][1] - fitPoints[k - 1][1],
      fitPoints[k][2] - fitPoints[k - 1][2],
    );
    const c = Math.sqrt(d);
    khoang.push(c);
    tong += c;
  }
  if (tong === 0) return null;

  const u: number[] = [0];
  let luy = 0;
  for (let k = 0; k < n; k++) {
    luy += khoang[k];
    u.push(luy / tong);
  }
  u[n] = 1;

  // Vector knot kẹp hai đầu, các knot trong lấy trung bình trượt của tham số
  const knots: number[] = [];
  for (let i = 0; i <= p; i++) knots.push(0);
  for (let j = 1; j <= n - p; j++) {
    let s = 0;
    for (let i = j; i <= j + p - 1; i++) s += u[i];
    knots.push(s / p);
  }
  for (let i = 0; i <= p; i++) knots.push(1);

  // Hệ N·P = Q với N[k][i] = N_{i,p}(u_k)
  const N: number[][] = [];
  for (let k = 0; k <= n; k++) {
    const row: number[] = [];
    for (let i = 0; i <= n; i++) row.push(basisFunction(i, p, u[k], knots));
    N.push(row);
  }
  const Q = fitPoints.map((pt) => [pt[0], pt[1], pt[2]]);

  const P = solveLinearSystem(N, Q);
  if (!P) return null;

  return {
    degree: p,
    knots,
    controlPoints: P.map((row) => [row[0], row[1], row[2]] as [number, number, number]),
  };
}

/**
 * Ghi một thực thể đã phân tích thành khối mã nhóm DXF **R2000 (AC1015)**.
 *
 * Khác bản ghi R12 trước đây ở chỗ **không còn bước hạ cấp nào**: LWPOLYLINE, ELLIPSE, SPLINE,
 * HATCH, MTEXT, XLINE, RAY, MLINE, TOLERANCE, DIMENSION đều là thực thể hợp lệ của R2000 nên ghi
 * nguyên bản. Đường cong không còn bị bẻ thành đoạn thẳng, kích thước không còn bị tách thành
 * LINE + TEXT, chữ nhiều dòng không còn bị ép thành một dòng.
 *
 * Hai cam kết giữ nguyên từ trước:
 * 1. **Không bịa dữ liệu** — thiếu toạ độ/bán kính/góc thì không tự chế giá trị thay thế.
 * 2. **Không nuốt mất thực thể** — loại không dựng lại được vẫn để lại POINT tại điểm neo.
 */
function writeEntityR2000(
  ent: DxfEntityRaw,
  layer: string,
  defaultTextHeight: number,
  handles: HandleAllocator,
  owner: string,
  /** Khối `*D<n>` chứa hình của DIMENSION, do chỗ gọi cấp phát trước */
  dimBlockName?: string,
  /** Handle của kiểu chữ STANDARD và kiểu chú thích dẫn Standard, để MULTILEADER trỏ tới */
  textStyleHandle = "0",
  mleaderStyleHandle = "0",
  /** Handle của kiểu đường nhiều nét Standard, để MLINE trỏ tới */
  mlineStyleHandle = "0",
  /** Handle của IMAGEDEF (đã ánh xạ sang handle mới) và của IMAGEDEF_REACTOR đi kèm */
  imageDefHandle?: string,
  imageReactorHandle = "0",
): string {
  const c = ent.coordinates;
  const handle = handles.take();

  /** Khối mở đầu chung của mọi thực thể: handle, chủ sở hữu, lớp cơ sở AcDbEntity và thuộc tính chung. */
  const head = (type: string, subClass: string, h = handle): string => {
    let out = `0\r\n${type}\r\n5\r\n${h}\r\n330\r\n${owner}\r\n100\r\nAcDbEntity\r\n`;
    if (ent.isPaperSpace) out += `67\r\n1\r\n`;
    out += `8\r\n${layer}\r\n`;
    if (ent.lineType) out += `6\r\n${ent.lineType}\r\n`;
    if (ent.color) out += `62\r\n${ent.color}\r\n`;
    if (typeof ent.lineTypeScale === "number" && ent.lineTypeScale !== 1)
      out += `48\r\n${real(ent.lineTypeScale)}\r\n`;
    if (ent.isInvisible) out += `60\r\n1\r\n`;
    out += `100\r\n${subClass}\r\n`;
    if (typeof ent.thickness === "number" && ent.thickness !== 0)
      out += `39\r\n${real(ent.thickness)}\r\n`;
    return out;
  };

  /** Hướng đùn — ghi ở cuối nhóm thực thể theo đúng thứ tự đặc tả. */
  const extr = (): string =>
    ent.extrusion
      ? `210\r\n${real(ent.extrusion[0])}\r\n220\r\n${real(ent.extrusion[1])}\r\n230\r\n${real(ent.extrusion[2])}\r\n`
      : "";

  const pt = (codeBase: number, p?: [number, number, number]): string => {
    const [x, y, z] = ptXYZ(p);
    return `${codeBase}\r\n${real(x)}\r\n${codeBase + 10}\r\n${real(y)}\r\n${codeBase + 20}\r\n${real(z)}\r\n`;
  };

  /** Dấu vết tối giản tại điểm neo — thực thể không dựng được hình vẫn không biến mất im lặng. */
  const pointTrace = (): string => {
    const anchor = c.center || c.start || c.end || c.points?.[0] || c.corners?.[0];
    if (!anchor) return "";
    return head("POINT", "AcDbPoint") + pt(10, anchor) + extr();
  };

  const textBody = (
    type: "TEXT" | "ATTDEF" | "ATTRIB",
    value: string,
    pos: [number, number, number],
  ): string => {
    const align = ent.textAlign;
    const first = align && c.alignPoint ? c.alignPoint : pos;
    let out = head(type, "AcDbText");
    out += pt(10, first);
    out += `40\r\n${real(dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight)}\r\n`;
    out += `1\r\n${value}\r\n`;
    if (typeof ent.rotation === "number" && ent.rotation !== 0)
      out += `50\r\n${real(ent.rotation)}\r\n`;
    if (typeof ent.widthFactor === "number" && ent.widthFactor > 0 && ent.widthFactor !== 1)
      out += `41\r\n${real(ent.widthFactor)}\r\n`;
    out += `7\r\n${ent.textStyle || "STANDARD"}\r\n`;
    if (align) {
      out += `72\r\n${align.horizontal}\r\n`;
      out += pt(11, pos);
    }
    out += extr();
    // Quirk của đặc tả: TEXT/ATTDEF/ATTRIB khai lại lớp AcDbText lần hai trước mã 73
    if (type === "TEXT") {
      out += `100\r\nAcDbText\r\n`;
      if (align) out += `73\r\n${align.vertical}\r\n`;
    }
    return out;
  };

  switch (ent.type) {
    case "LINE": {
      if (!c.start || !c.end) return pointTrace();
      return head("LINE", "AcDbLine") + pt(10, c.start) + pt(11, c.end) + extr();
    }

    case "POINT": {
      if (!c.center) return "";
      return head("POINT", "AcDbPoint") + pt(10, c.center) + extr();
    }

    case "CIRCLE": {
      if (!c.center || !c.radius) return pointTrace();
      return (
        head("CIRCLE", "AcDbCircle") + pt(10, c.center) + `40\r\n${real(c.radius)}\r\n` + extr()
      );
    }

    case "ARC": {
      // Cung tròn bắt buộc có cả bán kính lẫn hai góc — thiếu thì không tự đặt 0°–180°
      if (!c.center || !c.radius || c.startAngle === undefined || c.endAngle === undefined) {
        return pointTrace();
      }
      let out = head("ARC", "AcDbCircle") + pt(10, c.center) + `40\r\n${real(c.radius)}\r\n`;
      out += extr();
      out += `100\r\nAcDbArc\r\n50\r\n${real(c.startAngle)}\r\n51\r\n${real(c.endAngle)}\r\n`;
      return out;
    }

    case "MLINE": {
      // R13 trở lên có MLINE thật — giữ nguyên nét kép và mối nối vát thay vì hạ thành đa tuyến
      const verts = ent.mlineVertices;
      if (!verts || verts.length < 2) {
        const pts = c.points || [];
        if (pts.length < 2) return pointTrace();
        let fallback = head("LWPOLYLINE", "AcDbPolyline");
        fallback += `90\r\n${pts.length}\r\n70\r\n${c.closed ? 1 : 0}\r\n`;
        pts.forEach((p) => {
          fallback += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
        });
        return fallback + extr();
      }
      // Kiểu đường nhiều nét Standard mà bộ ghi phát ra có 2 nét (offset +0.5 / −0.5). Mỗi đỉnh
      // phải mang ĐÚNG chừng ấy nhóm tham số, kể cả nhóm rỗng — lệch số là trình đọc coi đỉnh
      // hỏng và tự dựng lại hình học, tức mất mối nối vát gốc.
      const soNet = Math.max(MLINE_STYLE_ELEMENT_COUNT, ...verts.map((v) => v.elements.length));
      let out = head("MLINE", "AcDbMline");
      out += `2\r\n${ent.blockName || "STANDARD"}\r\n340\r\n${mlineStyleHandle}\r\n`;
      out += `40\r\n${real(ent.mlineScale ?? 1)}\r\n`;
      out += `70\r\n${ent.mlineJustification ?? 0}\r\n`;
      out += `71\r\n${c.closed ? 2 : 1}\r\n`;
      out += `72\r\n${verts.length}\r\n73\r\n${soNet}\r\n`;
      out += pt(10, verts[0].point);
      out += `210\r\n${real(ent.extrusion?.[0] ?? 0)}\r\n220\r\n${real(ent.extrusion?.[1] ?? 0)}\r\n230\r\n${real(ent.extrusion?.[2] ?? 1)}\r\n`;
      verts.forEach((v, idx) => {
        out += pt(11, v.point);
        // Hướng đoạn và hướng vát: giữ nguyên của tệp gốc; tệp không khai thì suy từ chính đỉnh
        // liền kề (đây là hình học xác định, không phải số liệu bịa).
        const ke = verts[idx + 1] ?? verts[idx - 1] ?? v;
        const dx = ke.point[0] - v.point[0];
        const dy = ke.point[1] - v.point[1];
        const len = Math.hypot(dx, dy) || 1;
        const dir = v.direction ?? [dx / len, dy / len, 0];
        const miter = v.miter ?? [-dir[1], dir[0], 0];
        out += `12\r\n${real(dir[0])}\r\n22\r\n${real(dir[1])}\r\n32\r\n${real(dir[2])}\r\n`;
        out += `13\r\n${real(miter[0])}\r\n23\r\n${real(miter[1])}\r\n33\r\n${real(miter[2])}\r\n`;
        for (let n = 0; n < soNet; n++) {
          const params = v.elements[n] ?? [];
          out += `74\r\n${params.length}\r\n`;
          for (const par of params) out += `41\r\n${real(par)}\r\n`;
          out += `75\r\n0\r\n`;
        }
      });
      return out;
    }

    case "LWPOLYLINE":
    case "POLYLINE":
    case "LEADER": {
      // R2000 có LWPOLYLINE thật — không phải dựng POLYLINE/VERTEX/SEQEND như R12, và độ cong
      // từng đoạn ghi thẳng bằng mã 42. Đa tuyến kiểu cũ được hiện đại hoá sang LWPOLYLINE,
      // đúng việc mà lệnh CONVERTPOLY của AutoCAD làm — giữ nguyên đỉnh, độ cong và cao độ.
      const pts = c.points || [];
      if (pts.length === 0) return pointTrace();
      if (pts.length === 1) return head("POINT", "AcDbPoint") + pt(10, pts[0]) + extr();

      // NGOẠI LỆ: đa tuyến 3D có cao độ khác nhau từng đỉnh — LWPOLYLINE là thực thể phẳng nên
      // chuyển sang đó sẽ ép bẹp tuyến ống về một cao độ. Giữ nguyên POLYLINE/VERTEX/SEQEND.
      const coCaoDoKhacNhau = pts.some((p) => p[2] !== pts[0][2]);
      if (c.is3d || coCaoDoKhacNhau) {
        let out = head("POLYLINE", "AcDb3dPolyline");
        out += `66\r\n1\r\n70\r\n${8 | (c.closed ? 1 : 0)}\r\n`;
        out += pt(10, [0, 0, dxfNum(pts[0][2])]);
        for (const p of pts) {
          out += `0\r\nVERTEX\r\n5\r\n${handles.take()}\r\n330\r\n${owner}\r\n`;
          out += `100\r\nAcDbEntity\r\n8\r\n${layer}\r\n100\r\nAcDbVertex\r\n100\r\nAcDb3dPolylineVertex\r\n`;
          out += pt(10, p);
          out += `70\r\n32\r\n`;
        }
        out += `0\r\nSEQEND\r\n5\r\n${handles.take()}\r\n330\r\n${owner}\r\n100\r\nAcDbEntity\r\n8\r\n${layer}\r\n`;
        return out;
      }
      let out = head("LWPOLYLINE", "AcDbPolyline");
      out += `90\r\n${pts.length}\r\n70\r\n${c.closed ? 1 : 0}\r\n`;
      if (c.elevation !== undefined) out += `38\r\n${real(c.elevation)}\r\n`;
      pts.forEach((p, idx) => {
        out += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
        const b = c.bulges?.[idx];
        if (typeof b === "number" && b !== 0) out += `42\r\n${real(b)}\r\n`;
      });
      return out + extr();
    }

    case "SPLINE": {
      const ctrl = c.controlPoints || [];
      const fit = c.points || [];
      // SPLINE nguyên bản cần vector knot; có đủ knot + điểm điều khiển thì ghi đúng đường cong,
      // thiếu thì hạ về đa tuyến qua các điểm khớp thay vì ghi ra một SPLINE hỏng.
      if (ctrl.length >= 2 && (c.knots?.length ?? 0) > 0) {
        const degree = c.degree ?? 3;
        let out = head("SPLINE", "AcDbSpline");
        out += extr();
        out += `70\r\n${(c.closed ? 1 : 0) | 8}\r\n71\r\n${degree}\r\n`;
        out += `72\r\n${c.knots!.length}\r\n73\r\n${ctrl.length}\r\n74\r\n${fit.length}\r\n`;
        for (const k of c.knots!) out += `40\r\n${real(k)}\r\n`;
        for (const p of ctrl) out += pt(10, p);
        for (const p of fit) out += pt(11, p);
        return out;
      }
      if (fit.length < 2) return pointTrace();

      // Bản vẽ chỉ khai điểm khớp: nội suy ra điểm điều khiển + vector knot để vẫn ghi được
      // SPLINE thật đi qua đúng từng điểm khớp, thay vì bẻ đường cong thành đoạn thẳng.
      const noiSuy = interpolateSpline(fit, c.degree ?? 3);
      if (noiSuy) {
        let out = head("SPLINE", "AcDbSpline");
        out += extr();
        out += `70\r\n${(c.closed ? 1 : 0) | 8}\r\n71\r\n${noiSuy.degree}\r\n`;
        out += `72\r\n${noiSuy.knots.length}\r\n73\r\n${noiSuy.controlPoints.length}\r\n74\r\n${fit.length}\r\n`;
        for (const k of noiSuy.knots) out += `40\r\n${real(k)}\r\n`;
        for (const p of noiSuy.controlPoints) out += pt(10, p);
        for (const p of fit) out += pt(11, p);
        return out;
      }

      // Nội suy thất bại (điểm trùng nhau, hệ suy biến) — hạ về đa tuyến còn hơn ghi SPLINE hỏng
      let out = head("LWPOLYLINE", "AcDbPolyline");
      out += `90\r\n${fit.length}\r\n70\r\n${c.closed ? 1 : 0}\r\n`;
      fit.forEach((p) => {
        out += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
      });
      return out + extr();
    }

    case "ELLIPSE": {
      // R2000 có ELLIPSE thật — không còn phải bẻ thành 48 đoạn thẳng như R12
      if (!c.center || !c.majorAxis) return pointTrace();
      let out = head("ELLIPSE", "AcDbEllipse") + pt(10, c.center);
      out += extr();
      out += pt(11, c.majorAxis);
      out += `40\r\n${real(c.axisRatio ?? 1)}\r\n`;
      out += `41\r\n${real(c.startParam ?? 0)}\r\n42\r\n${real(c.endParam ?? Math.PI * 2)}\r\n`;
      return out;
    }

    case "SOLID":
    case "TRACE":
    case "3DFACE": {
      const corners = c.corners || [];
      if (corners.length < 3) return pointTrace();
      const sub = ent.type === "3DFACE" ? "AcDbFace" : "AcDbTrace";
      let out = head(ent.type, sub);
      out += pt(10, corners[0]) + pt(11, corners[1]) + pt(12, corners[2]);
      out += pt(13, corners[3] || corners[2]);
      return out + extr();
    }

    case "XLINE":
    case "RAY": {
      // R2000 có XLINE/RAY thật — không còn phải cắt theo khung bao thành LINE hữu hạn
      if (!c.start || !c.direction) return pointTrace();
      const sub = ent.type === "XLINE" ? "AcDbXline" : "AcDbRay";
      return head(ent.type, sub) + pt(10, c.start) + pt(11, c.direction);
    }

    case "TEXT":
      return ent.decodedText || ent.textValue
        ? textBody("TEXT", ent.decodedText || ent.textValue || "", ptXYZ(c.center || c.alignPoint))
        : pointTrace();

    case "ATTDEF": {
      const pos = ptXYZ(c.center);
      let out = textBody("ATTDEF", ent.decodedText || ent.textValue || "", pos);
      out += `100\r\nAcDbAttributeDefinition\r\n`;
      out += `3\r\n${ent.attributePrompt || ent.attributeTag || ""}\r\n`;
      out += `2\r\n${ent.attributeTag || "TAG"}\r\n70\r\n0\r\n`;
      return out;
    }

    case "ATTRIB": {
      const pos = ptXYZ(c.center);
      let out = textBody("ATTRIB", ent.decodedText || ent.textValue || "", pos);
      out += `100\r\nAcDbAttribute\r\n2\r\n${ent.attributeTag || "TAG"}\r\n70\r\n0\r\n`;
      return out;
    }

    case "MTEXT": {
      // R2000 có MTEXT thật — chữ nhiều dòng giữ nguyên dạng thay vì ép xuống một dòng TEXT
      const value = ent.decodedText || ent.textValue || "";
      if (!value) return pointTrace();
      let out = head("MTEXT", "AcDbMText") + pt(10, c.center);
      out += `40\r\n${real(dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight)}\r\n`;
      out += `71\r\n1\r\n72\r\n5\r\n`;
      out += `1\r\n${value}\r\n7\r\n${ent.textStyle || "STANDARD"}\r\n`;
      out += extr();
      if (typeof ent.rotation === "number") out += `50\r\n${real(ent.rotation)}\r\n`;
      return out;
    }

    case "INSERT": {
      const bName = ent.blockName;
      if (!bName || !c.center) return pointTrace();
      const kem = ent.attribEntities && ent.attribEntities.length > 0;
      let out = head("INSERT", "AcDbBlockReference");
      if (kem) out += `66\r\n1\r\n`;
      out += `2\r\n${bName}\r\n` + pt(10, c.center);
      const [sx, sy, sz] = ent.scale ?? [1, 1, 1];
      out += `41\r\n${real(sx, 1)}\r\n42\r\n${real(sy, 1)}\r\n43\r\n${real(sz, 1)}\r\n`;
      out += `50\r\n${real(ent.rotation)}\r\n`;
      if (ent.insertArray) {
        out += `70\r\n${ent.insertArray.columns}\r\n71\r\n${ent.insertArray.rows}\r\n`;
        out += `44\r\n${real(ent.insertArray.columnSpacing)}\r\n45\r\n${real(ent.insertArray.rowSpacing)}\r\n`;
      }
      out += extr();
      // Thuộc tính khối: giữ nguyên vị trí và cỡ chữ của từng ATTRIB, đóng bằng SEQEND
      if (kem) {
        for (const att of ent.attribEntities!) {
          out += writeEntityR2000(att, layer, defaultTextHeight, handles, owner);
        }
        out += `0\r\nSEQEND\r\n5\r\n${handles.take()}\r\n330\r\n${owner}\r\n100\r\nAcDbEntity\r\n8\r\n${layer}\r\n`;
      }
      return out;
    }

    case "DIMENSION": {
      // R2000 có DIMENSION thật. Kích thước tham chiếu tới một khối `*D<n>` chứa hình của nó —
      // khối này do chỗ gọi dựng sẵn từ chính đường đo và chữ đo, nên bản vẽ mở ra thấy đúng
      // kích thước chứ không phải hai thực thể rời như bản ghi R12 trước đây.
      const measure = c.measurePoints;
      const label = (() => {
        const override = ent.decodedText || ent.textValue || "";
        if (override && override !== "<>") return override;
        return typeof ent.measurement === "number" ? formatMeasurement(ent.measurement) : "";
      })();
      const anchor =
        c.textMidPoint ||
        (measure
          ? ([
              (measure[0][0] + measure[1][0]) / 2,
              (measure[0][1] + measure[1][1]) / 2,
              (measure[0][2] + measure[1][2]) / 2,
            ] as [number, number, number])
          : c.center || c.start);
      // Không có hai đầu đo thì không dựng được kích thước thật — ghi ra một DIMENSION rỗng chỉ
      // tạo thực thể hỏng. Còn chữ ghi đè thì giữ lại chữ, không thì để POINT ở điểm neo.
      if (!measure) {
        if (label && anchor) {
          return writeEntityR2000(
            {
              id: `${ent.id}-TEXT`,
              type: "TEXT",
              layer: ent.layer,
              color: ent.color,
              coordinates: { center: anchor },
              decodedText: label,
              textHeight: ent.textHeight,
              textStyle: ent.textStyle,
            },
            layer,
            defaultTextHeight,
            handles,
            owner,
          );
        }
        return pointTrace();
      }

      let out = head("DIMENSION", "AcDbDimension");
      out += `2\r\n${dimBlockName || "*D1"}\r\n`;
      out += pt(10, c.center || anchor);
      out += pt(11, anchor);
      // Mã 70: bit 0-2 = kiểu kích thước (1 = thẳng hàng), bit 32 = khối do máy sinh
      out += `70\r\n${1 | 32}\r\n71\r\n5\r\n`;
      if (label) out += `1\r\n${label}\r\n`;
      out += `3\r\n${ent.dimStyle || "STANDARD"}\r\n`;
      if (measure) {
        out += `100\r\nAcDbAlignedDimension\r\n`;
        out += pt(13, measure[0]);
        out += pt(14, measure[1]);
      }
      return out;
    }

    case "HATCH": {
      // R2000 có HATCH thật — giữ cả vùng tô lẫn mẫu tô, không chỉ còn đường bao như R12
      const paths = (c.boundaryPaths || []).filter((p) => p.points.length >= 2);
      if (paths.length === 0) return pointTrace();
      const solid = ent.isSolidFill ? 1 : 0;
      let out = head("HATCH", "AcDbHatch");
      out += `10\r\n0.0\r\n20\r\n0.0\r\n30\r\n${real(c.elevation ?? 0)}\r\n`;
      out += `210\r\n0.0\r\n220\r\n0.0\r\n230\r\n1.0\r\n`;
      out += `2\r\n${ent.patternName || "SOLID"}\r\n70\r\n${solid}\r\n71\r\n0\r\n`;
      out += `91\r\n${paths.length}\r\n`;
      for (const path of paths) {
        // Đường bao có cạnh CÓ KIỂU thì ghi lại đúng kiểu — cung vẫn là cung, không bẻ thành
        // chuỗi đoạn thẳng như bản trước (vùng bảo ôn, vùng cắt qua cong sẽ méo nếu bẻ).
        if (path.edges && path.edges.length > 0) {
          out += `92\r\n1\r\n93\r\n${path.edges.length}\r\n`;
          for (const canh of path.edges) {
            if (canh.type === "line") {
              out += `72\r\n1\r\n`;
              out += `10\r\n${real(canh.start[0])}\r\n20\r\n${real(canh.start[1])}\r\n`;
              out += `11\r\n${real(canh.end[0])}\r\n21\r\n${real(canh.end[1])}\r\n`;
            } else if (canh.type === "arc") {
              out += `72\r\n2\r\n`;
              out += `10\r\n${real(canh.center[0])}\r\n20\r\n${real(canh.center[1])}\r\n`;
              out += `40\r\n${real(canh.radius)}\r\n50\r\n${real(canh.startAngle)}\r\n51\r\n${real(canh.endAngle)}\r\n`;
              out += `73\r\n${canh.ccw ? 1 : 0}\r\n`;
            } else if (canh.type === "ellipse") {
              out += `72\r\n3\r\n`;
              out += `10\r\n${real(canh.center[0])}\r\n20\r\n${real(canh.center[1])}\r\n`;
              out += `11\r\n${real(canh.majorAxis[0])}\r\n21\r\n${real(canh.majorAxis[1])}\r\n`;
              out += `40\r\n${real(canh.ratio)}\r\n50\r\n${real(canh.startAngle ?? 0)}\r\n51\r\n${real(canh.endAngle ?? 360)}\r\n`;
              out += `73\r\n1\r\n`;
            } else {
              out += `72\r\n4\r\n94\r\n${canh.degree ?? 3}\r\n73\r\n0\r\n74\r\n0\r\n`;
              out += `95\r\n0\r\n96\r\n${canh.points.length}\r\n`;
              for (const p of canh.points) out += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
            }
          }
          out += `97\r\n0\r\n`;
          continue;
        }

        const coBulge = path.bulges.some((b) => b !== 0) ? 1 : 0;
        // Mã 92: bit 1 = đường bao ngoài, bit 2 = đường bao dạng đa tuyến
        out += `92\r\n3\r\n72\r\n${coBulge}\r\n73\r\n1\r\n93\r\n${path.points.length}\r\n`;
        path.points.forEach((p, idx) => {
          out += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
          if (coBulge) out += `42\r\n${real(path.bulges[idx] ?? 0)}\r\n`;
        });
        out += `97\r\n0\r\n`;
      }
      out += `75\r\n1\r\n76\r\n1\r\n`;
      if (!solid) {
        out += `52\r\n${real(ent.hatchAngle ?? 0)}\r\n41\r\n${real(ent.hatchScale ?? 1)}\r\n77\r\n0\r\n`;
        const lines = ent.hatchPatternLines || [];
        out += `78\r\n${lines.length}\r\n`;
        for (const l of lines) {
          out += `53\r\n${real(l.angle)}\r\n43\r\n${real(l.baseX)}\r\n44\r\n${real(l.baseY)}\r\n`;
          out += `45\r\n${real(l.offsetX)}\r\n46\r\n${real(l.offsetY)}\r\n79\r\n${l.dashes.length}\r\n`;
          for (const d of l.dashes) out += `49\r\n${real(d)}\r\n`;
        }
      }
      // KHÔNG ghi mã 47 (pixel size) — spec liệt kê nó là tuỳ chọn trước mã 98, nhưng AutoCAD
      // thật từ chối thẳng: "in HATCH... Error: expected group code 98" rồi huỷ cả bản vẽ (xác
      // nhận 2026-08-24, vòng 6 chuỗi "drawing discarded"). Đối chiếu HATCH gốc do chính AutoCAD
      // R2018 ghi trong bản vẽ MEPF thật: không hề có mã 47, kết thúc bằng 98/1 + seed point
      // (0,0) ngay sau mã 76 — bắt chước đúng như vậy.
      out += `98\r\n1\r\n10\r\n0.0\r\n20\r\n0.0\r\n`;
      return out;
    }

    case "TOLERANCE": {
      if (!c.center) return pointTrace();
      let out = head("TOLERANCE", "AcDbFcf");
      out += `3\r\n${ent.dimStyle || "STANDARD"}\r\n`;
      out += pt(10, c.center);
      out += `1\r\n${ent.decodedText || ent.textValue || ""}\r\n`;
      return out + extr();
    }

    case "SHAPE": {
      if (!c.center || !ent.blockName) return pointTrace();
      let out = head("SHAPE", "AcDbShape");
      out += `40\r\n${real(dxfNum(ent.textHeight, defaultTextHeight))}\r\n`;
      out += pt(10, c.center);
      out += `2\r\n${ent.blockName}\r\n`;
      if (typeof ent.rotation === "number" && ent.rotation !== 0)
        out += `50\r\n${real(ent.rotation)}\r\n`;
      return out + extr();
    }

    case "MULTILEADER": {
      // R2007 (AC1021) có MULTILEADER thật — không còn phải tách thành đa tuyến + MTEXT.
      // Cấu trúc lồng ba mức: 300 CONTEXT_DATA{ … 301 } chứa 302 LEADER{ … 303 }, mỗi nhánh
      // chứa 304 LEADER_LINE{ … 305 }. Mã 304 mang hai nghĩa tuỳ mức lồng (chữ chú thích ở mức
      // ngữ cảnh, thẻ mở đường dẫn ở trong nhánh) — ghi sai mức là AutoCAD đọc nhầm chữ.
      const lines =
        c.leaderLines && c.leaderLines.length > 0 ? c.leaderLines : c.points ? [c.points] : [];
      const value = ent.decodedText || ent.textValue || "";
      if (lines.length === 0 && !value) return pointTrace();

      const cao = dxfNum(ent.textHeight, defaultTextHeight) || defaultTextHeight;
      const diemChu = ptXYZ(c.center || lines[0]?.[lines[0].length - 1]);
      const leaders = ent.mleaderContext?.leaders ?? [];

      let out = head("MULTILEADER", "AcDbMLeader");
      out += `270\r\n2\r\n`;
      out += `300\r\nCONTEXT_DATA{\r\n`;
      out += `40\r\n1.0\r\n`;
      out += pt(10, diemChu);
      out += `41\r\n${real(cao)}\r\n`;
      out += `140\r\n${real(cao * 0.72)}\r\n145\r\n${real(cao * 0.08)}\r\n`;
      out += `290\r\n${value ? 1 : 0}\r\n`;
      if (value) out += `304\r\n${value}\r\n`;
      out += `11\r\n0.0\r\n21\r\n0.0\r\n31\r\n1.0\r\n`;
      out += `340\r\n${textStyleHandle}\r\n`;
      out += pt(12, diemChu);
      out += `13\r\n1.0\r\n23\r\n0.0\r\n33\r\n0.0\r\n`;
      out += `42\r\n${real(ent.rotation)}\r\n43\r\n0.0\r\n44\r\n0.0\r\n45\r\n1.0\r\n`;
      out += `170\r\n1\r\n90\r\n-1056964608\r\n171\r\n1\r\n172\r\n0\r\n`;
      out += `91\r\n-1056964608\r\n141\r\n1.0\r\n92\r\n0\r\n291\r\n0\r\n292\r\n0\r\n`;
      out += `173\r\n0\r\n293\r\n0\r\n142\r\n0.0\r\n143\r\n0.0\r\n294\r\n0\r\n295\r\n0\r\n296\r\n0\r\n`;
      out += pt(110, diemChu);
      out += `111\r\n1.0\r\n121\r\n0.0\r\n131\r\n0.0\r\n`;
      out += `112\r\n0.0\r\n122\r\n1.0\r\n132\r\n0.0\r\n`;
      out += `297\r\n0\r\n`;

      lines.forEach((duong, idx) => {
        const nhanh = leaders[idx] ?? {};
        out += `302\r\nLEADER{\r\n`;
        out += `290\r\n1\r\n291\r\n1\r\n`;
        out += pt(10, nhanh.lastPoint ?? duong[duong.length - 1] ?? diemChu);
        const dogleg = nhanh.doglegVector ?? [1, 0, 0];
        out += `11\r\n${real(dogleg[0])}\r\n21\r\n${real(dogleg[1])}\r\n31\r\n${real(dogleg[2])}\r\n`;
        out += `90\r\n${idx}\r\n40\r\n${real(nhanh.doglegLength ?? cao * 2)}\r\n`;
        out += `304\r\nLEADER_LINE{\r\n`;
        for (const v of duong) out += pt(10, v);
        out += `91\r\n${idx}\r\n305\r\n}\r\n`;
        out += `271\r\n0\r\n303\r\n}\r\n`;
      });

      out += `301\r\n}\r\n`;
      out += `340\r\n${mleaderStyleHandle}\r\n`;
      out += `90\r\n0\r\n170\r\n1\r\n91\r\n-1056964608\r\n341\r\n0\r\n171\r\n-2\r\n`;
      out += `290\r\n1\r\n291\r\n1\r\n41\r\n${real(cao * 0.72)}\r\n42\r\n${real(cao * 0.08)}\r\n`;
      out += `172\r\n0\r\n343\r\n${textStyleHandle}\r\n173\r\n1\r\n95\r\n1\r\n`;
      out += `174\r\n1\r\n175\r\n0\r\n92\r\n-1056964608\r\n292\r\n0\r\n`;
      out += `93\r\n-1056964608\r\n10\r\n1.0\r\n20\r\n1.0\r\n30\r\n1.0\r\n`;
      out += `43\r\n0.0\r\n176\r\n0\r\n293\r\n0\r\n294\r\n0\r\n178\r\n0\r\n179\r\n1\r\n`;
      out += `45\r\n1.0\r\n271\r\n0\r\n272\r\n9\r\n273\r\n9\r\n295\r\n0\r\n`;
      return out;
    }

    case "VIEWPORT": {
      // Khung nhìn chỉ có nghĩa trên không gian giấy; bộ ghi dựng cả bố cục in nên giữ được
      if (!c.center) return pointTrace();
      const vp = ent.viewport;
      let out = `0\r\nVIEWPORT\r\n5\r\n${handle}\r\n330\r\n${owner}\r\n100\r\nAcDbEntity\r\n`;
      out += `67\r\n1\r\n8\r\n${layer}\r\n100\r\nAcDbViewport\r\n`;
      out += pt(10, c.center);
      out += `40\r\n${real(vp?.width ?? 0)}\r\n41\r\n${real(vp?.height ?? 0)}\r\n`;
      out += `68\r\n${vp?.status ?? 1}\r\n69\r\n${vp?.id ?? 2}\r\n`;
      out += `12\r\n${real(vp?.viewCenter?.[0] ?? 0)}\r\n22\r\n${real(vp?.viewCenter?.[1] ?? 0)}\r\n`;
      out += `13\r\n0.0\r\n23\r\n0.0\r\n14\r\n10.0\r\n24\r\n10.0\r\n15\r\n10.0\r\n25\r\n10.0\r\n`;
      out += `16\r\n0.0\r\n26\r\n0.0\r\n36\r\n1.0\r\n17\r\n0.0\r\n27\r\n0.0\r\n37\r\n0.0\r\n`;
      out += `42\r\n50.0\r\n43\r\n0.0\r\n44\r\n0.0\r\n`;
      out += `45\r\n${real(vp?.viewHeight ?? vp?.height ?? 0)}\r\n`;
      out += `50\r\n0.0\r\n51\r\n${real(vp?.twistAngle ?? 0)}\r\n72\r\n1000\r\n`;
      out += `90\r\n32864\r\n281\r\n0\r\n71\r\n1\r\n74\r\n0\r\n`;
      out += `110\r\n0.0\r\n120\r\n0.0\r\n130\r\n0.0\r\n`;
      out += `111\r\n1.0\r\n121\r\n0.0\r\n131\r\n0.0\r\n`;
      out += `112\r\n0.0\r\n122\r\n1.0\r\n132\r\n0.0\r\n`;
      out += `79\r\n0\r\n146\r\n0.0\r\n170\r\n0\r\n`;
      return out;
    }

    case "IMAGE":
    case "WIPEOUT": {
      // Ảnh chèn và vùng che giữ nguyên bản: thực thể trỏ tới IMAGEDEF (mã 340) trong section
      // OBJECTS — bộ ghi dựng lại cả đối tượng đó. Hạ xuống đa tuyến như trước là SAI về mặt
      // hiển thị: vùng che có nhiệm vụ CHE nền, còn đa tuyến lại vẽ ra một khung nhìn thấy được.
      const def = imageDefHandle;
      if (!c.center || !def) {
        if (c.points && c.points.length >= 2) {
          let fb = head("LWPOLYLINE", "AcDbPolyline");
          fb += `90\r\n${c.points.length}\r\n70\r\n${c.closed ? 1 : 0}\r\n`;
          c.points.forEach((p) => {
            fb += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
          });
          return fb + extr();
        }
        return pointTrace();
      }

      const sub = ent.type === "WIPEOUT" ? "AcDbWipeout" : "AcDbRasterImage";
      const u = ent.imageUVector ?? [1, 0, 0];
      const v = ent.imageVVector ?? [0, 1, 0];
      const px = ent.imageSizePx ?? [1, 1];
      const hienThi = ent.imageDisplay ?? { flags: 7, brightness: 50, contrast: 50, fade: 0 };

      let out = head(ent.type, sub);
      out += `90\r\n0\r\n`;
      out += pt(10, c.center);
      out += `11\r\n${real(u[0])}\r\n21\r\n${real(u[1])}\r\n31\r\n${real(u[2])}\r\n`;
      out += `12\r\n${real(v[0])}\r\n22\r\n${real(v[1])}\r\n32\r\n${real(v[2])}\r\n`;
      out += `13\r\n${real(px[0])}\r\n23\r\n${real(px[1])}\r\n`;
      out += `340\r\n${def}\r\n`;
      out += `70\r\n${hienThi.flags}\r\n280\r\n${c.points && c.points.length >= 3 ? 1 : 0}\r\n`;
      out += `281\r\n${hienThi.brightness}\r\n282\r\n${hienThi.contrast}\r\n283\r\n${hienThi.fade}\r\n`;
      out += `360\r\n${imageReactorHandle}\r\n`;
      // Đường bao cắt: 71 = 2 nghĩa là đa giác (0/1 là hình chữ nhật 2 điểm)
      const bao = c.points ?? [];
      out += `71\r\n${bao.length > 2 ? 2 : 1}\r\n`;
      out += `91\r\n${bao.length}\r\n`;
      for (const p of bao) out += `14\r\n${real(p[0])}\r\n24\r\n${real(p[1])}\r\n`;
      return out;
    }

    default:
      // Loại không dựng lại được hình: có đường bao thì giữ đường bao, không thì để lại POINT.
      if (c.points && c.points.length >= 2) {
        let out = head("LWPOLYLINE", "AcDbPolyline");
        out += `90\r\n${c.points.length}\r\n70\r\n${c.closed ? 1 : 0}\r\n`;
        c.points.forEach((p) => {
          out += `10\r\n${real(p[0])}\r\n20\r\n${real(p[1])}\r\n`;
        });
        return out + extr();
      }
      return pointTrace();
  }
}

/**
 * Xuất `DxfParseResult` thành chuỗi DXF ASCII hoàn chỉnh chuẩn **AutoCAD 2000 (AC1015)**, đủ các
 * phần HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, OBJECTS và EOF.
 *
 * Trước đây bộ ghi phát hành R12 (AC1009) — định dạng năm 1992 không có handle, không có section
 * OBJECTS và thiếu hẳn nhiều thực thể — nên mọi thứ R12 không biểu diễn được đều phải hạ cấp:
 * đường cong bẻ thành đoạn thẳng, kích thước tách thành LINE + TEXT, chữ nhiều dòng ép xuống một
 * dòng. Bản R2000 giữ nguyên bản tất cả những thứ đó.
 *
 * **Không bịa dữ liệu:** bản vẽ không có nét thì tệp xuất ra cũng không có nét.
 */
export function exportDxf(
  parsed: DxfParseResult,
  options?: { applyStandardLayers?: boolean; decodeUnicodeText?: boolean },
): string {
  const useStandardLayers = options?.applyStandardLayers ?? true;
  const layers = parsed.layers && parsed.layers.length > 0 ? parsed.layers : [];

  const layerMap = new Map<string, string>();
  layers.forEach((l) => {
    layerMap.set(l.name, useStandardLayers && l.standardName ? l.standardName : l.name);
  });
  const getLayer = (name: string) => layerMap.get(name) || name || "0";

  const entities = parsed.entities || [];
  const defaultTextHeight = resolveDefaultTextHeight(entities);
  const handles = new HandleAllocator();

  // ── Handle của các bảng, phải cấp trước vì mọi bản ghi đều trỏ về bảng chủ ──
  const hVportTab = handles.take();
  const hLtypeTab = handles.take();
  const hLayerTab = handles.take();
  const hStyleTab = handles.take();
  const hViewTab = handles.take();
  const hUcsTab = handles.take();
  const hAppidTab = handles.take();
  const hDimTab = handles.take();
  const hBlkRecTab = handles.take();

  // ── Khối: *Model_Space, *Paper_Space và các khối của bản vẽ ──
  const blockNames = new Set<string>();
  (parsed.blocks || []).forEach((b) => blockNames.add(b.name));
  entities.forEach((e) => {
    if (e.type === "INSERT" && e.blockName) blockNames.add(e.blockName);
  });
  // Mỗi DIMENSION cần một khối ẩn `*D<n>` chứa hình của nó
  const dimEntities = entities.filter((e) => e.type === "DIMENSION");
  const dimBlockNames = new Map<DxfEntityRaw, string>();
  dimEntities.forEach((e, idx) => dimBlockNames.set(e, `*D${idx + 1}`));

  // Handle của các đối tượng trong section OBJECTS, cấp TRƯỚC vì thực thể phải trỏ tới chúng
  const hRootDict = handles.take();
  const hGroupDict = handles.take();
  const hMLeaderStyleDict = handles.take();
  const hMLeaderStyle = handles.take();
  const hMLineStyleDict = handles.take();
  const hMLineStyle = handles.take();
  const hLayoutDict = handles.take();
  const hLayoutModel = handles.take();
  const hLayoutPaper = handles.take();
  // Bộ đối tượng chuẩn mà tệp AutoCAD 2004 trở lên nào cũng mang theo. Riêng ACAD_PLOTSTYLENAME
  // là bắt buộc thật: mỗi bản ghi LAYER trỏ về một kiểu in bằng mã 390 — bản trước ghi cứng
  // handle "F" vốn không tồn tại trong tệp, tức một tham chiếu treo.
  const hPlotStyleDict = handles.take();
  const hPlaceholder = handles.take();
  const hMaterialDict = handles.take();
  const hMaterialByLayer = handles.take();
  const hMaterialByBlock = handles.take();
  const hMaterialGlobal = handles.take();
  const hScaleListDict = handles.take();
  const hScale11 = handles.take();
  const hVisualStyleDict = handles.take();
  const hTableStyleDict = handles.take();
  const hPlotSettingsDict = handles.take();
  const hColorDict = handles.take();

  // Ảnh chèn: mỗi IMAGEDEF của bản vẽ gốc được cấp handle mới, kèm một IMAGEDEF_REACTOR.
  // Handle trong tệp mới khác tệp gốc (bộ cấp phát đánh số lại từ đầu) nên phải ánh xạ.
  const imageDefs = parsed.imageDefs ?? [];
  const hImageDict = imageDefs.length > 0 ? handles.take() : "0";
  const imageDefHandles = new Map<string, string>();
  const imageReactorHandles = new Map<string, string>();
  for (const def of imageDefs) {
    imageDefHandles.set(def.handle, handles.take());
    imageReactorHandles.set(def.handle, handles.take());
  }

  const hModelSpace = handles.take();
  const hPaperSpace = handles.take();
  const blockRecordHandles = new Map<string, string>();
  blockNames.forEach((n) => blockRecordHandles.set(n, handles.take()));
  dimBlockNames.forEach((n) => blockRecordHandles.set(n, handles.take()));

  let dxf = "";

  // ── 1. HEADER ──
  const bao = parsed.diagnostic?.boundingDimensions;

  const TY_LE_KHUNG_NHIN = 1.5;
  let tamX = 0;
  let tamY = 0;
  let caoKhungNhin = 1000;
  if (bao) {
    const rong = bao.maxX - bao.minX;
    const cao = bao.maxY - bao.minY;
    tamX = (bao.minX + bao.maxX) / 2;
    tamY = (bao.minY + bao.maxY) / 2;
    // Bản vẽ rỗng hoặc suy biến thành một điểm/đường thẳng → giữ mặc định, không chia cho 0.
    const canCao = Math.max(cao, rong / TY_LE_KHUNG_NHIN);
    if (canCao > 0) caoKhungNhin = canCao * 1.1;
  }

  let header = "0\r\nSECTION\r\n2\r\nHEADER\r\n";
  // AC1021 = AutoCAD 2007 — phiên bản mới nhất XÉT RIÊNG BẢN VẼ 2D. Từ 2007 trở đi không bản nào
  // thêm loại thực thể 2D dùng được cho bản vẽ MEPF (2010 thêm MESH 3D, 2013 thêm đối tượng mặt
  // cắt), nên khai cao hơn không giữ thêm được gì.
  //
  // DXF tương thích XUÔI chứ không ngược: tệp AC1021 mở được từ AutoCAD 2007 cho tới 2026, kể cả
  // máy đời cũ ở công trường; còn tệp AC1032 (2018) thì bản 2017 trở về trước không mở được.
  header += "9\r\n$ACADVER\r\n1\r\nAC1021\r\n";
  header += "9\r\n$ACADMAINTVER\r\n70\r\n0\r\n";
  header += `9\r\n$INSUNITS\r\n70\r\n${parsed.header?.insUnits ?? 4}\r\n`;
  header += `9\r\n$MEASUREMENT\r\n70\r\n${parsed.header?.measurement ?? 1}\r\n`;
  header += `9\r\n$LTSCALE\r\n40\r\n${real(parsed.header?.ltScale ?? 1)}\r\n`;
  // Bộ biến hệ thống mà tệp thật nào cũng mang: thiếu thì AutoCAD tự điền mặc định của MÁY ĐANG
  // MỞ, nên cùng một tệp mở ở hai máy có thể ra hai kiểu hiển thị khác nhau.
  header += "9\r\n$CLAYER\r\n8\r\n0\r\n";
  header += "9\r\n$CELTYPE\r\n6\r\nByLayer\r\n";
  header += "9\r\n$CECOLOR\r\n62\r\n256\r\n";
  header += "9\r\n$CELTSCALE\r\n40\r\n1.0\r\n";
  header += "9\r\n$CELWEIGHT\r\n370\r\n-1\r\n";
  header += "9\r\n$PSLTSCALE\r\n70\r\n1\r\n";
  header += "9\r\n$TILEMODE\r\n70\r\n1\r\n";
  header += "9\r\n$TEXTSTYLE\r\n7\r\nSTANDARD\r\n";
  header += "9\r\n$DIMSTYLE\r\n2\r\nSTANDARD\r\n";
  header += "9\r\n$CMLSTYLE\r\n2\r\nSTANDARD\r\n";
  header += "9\r\n$CMLJUST\r\n70\r\n0\r\n";
  header += "9\r\n$CMLSCALE\r\n40\r\n1.0\r\n";
  header += "9\r\n$PDMODE\r\n70\r\n0\r\n";
  header += "9\r\n$PDSIZE\r\n40\r\n0.0\r\n";
  header += "9\r\n$SPLINESEGS\r\n70\r\n8\r\n";
  header += "9\r\n$DIMASSOC\r\n280\r\n2\r\n";
  header += "9\r\n$UCSORG\r\n10\r\n0.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n";
  header += "9\r\n$UCSXDIR\r\n10\r\n1.0\r\n20\r\n0.0\r\n30\r\n0.0\r\n";
  header += "9\r\n$UCSYDIR\r\n10\r\n0.0\r\n20\r\n1.0\r\n30\r\n0.0\r\n";
  if (bao) {
    header += `9\r\n$EXTMIN\r\n10\r\n${real(bao.minX)}\r\n20\r\n${real(bao.minY)}\r\n30\r\n0.0\r\n`;
    header += `9\r\n$EXTMAX\r\n10\r\n${real(bao.maxX)}\r\n20\r\n${real(bao.maxY)}\r\n30\r\n0.0\r\n`;
    header += `9\r\n$LIMMIN\r\n10\r\n${real(bao.minX)}\r\n20\r\n${real(bao.minY)}\r\n`;
    header += `9\r\n$LIMMAX\r\n10\r\n${real(bao.maxX)}\r\n20\r\n${real(bao.maxY)}\r\n`;
  }
  // $VIEWCTR/$VIEWSIZE lặp lại khung nhìn của VPORT "*ACTIVE" ở HEADER — AutoCAD đọc cả hai chỗ,
  // để lệch nhau thì khung nhìn lúc mở phụ thuộc vào chỗ nào được đọc sau.
  header += `9\r\n$VIEWCTR\r\n10\r\n${real(tamX)}\r\n20\r\n${real(tamY)}\r\n`;
  header += `9\r\n$VIEWSIZE\r\n40\r\n${real(caoKhungNhin)}\r\n`;

  // ── 2. CLASSES — khai các lớp KHÔNG thuộc lõi DXF mà tệp này có dùng.
  // Thiếu khai báo thì AutoCAD coi thực thể tương ứng là đối tượng lạ và bỏ qua khi mở tệp.
  const dungLoai = new Set(entities.map((e) => e.type));
  (parsed.blocks || []).forEach((b) => b.entities?.forEach((e) => dungLoai.add(e.type)));
  // Các lớp luôn có mặt trong tệp bản 2004 trở lên vì bộ ghi phát ra đúng những đối tượng này
  const lopCanKhai: Array<[string, string, string, number]> = [
    ["ACDBDICTIONARYWDFLT", "AcDbDictionaryWithDefault", "ObjectDBX Classes", 0],
    ["ACDBPLACEHOLDER", "AcDbPlaceHolder", "ObjectDBX Classes", 0],
    ["LAYOUT", "AcDbLayout", "ObjectDBX Classes", 0],
    ["MATERIAL", "AcDbMaterial", "ObjectDBX Classes", 0],
    ["SCALE", "AcDbScale", "ObjectDBX Classes", 0],
    ["VISUALSTYLE", "AcDbVisualStyle", "ObjectDBX Classes", 0],
  ];
  if (dungLoai.has("MULTILEADER")) {
    lopCanKhai.push(["MULTILEADER", "AcDbMLeader", "ACDB_MLEADER_CLASS", 1]);
    lopCanKhai.push(["MLEADERSTYLE", "AcDbMLeaderStyle", "ACDB_MLEADERSTYLE_CLASS", 0]);
  }
  if (dungLoai.has("IMAGE")) {
    lopCanKhai.push(["IMAGE", "AcDbRasterImage", "ISM", 1]);
    lopCanKhai.push(["IMAGEDEF", "AcDbRasterImageDef", "ISM", 0]);
    lopCanKhai.push(["IMAGEDEF_REACTOR", "AcDbRasterImageDefReactor", "ISM", 0]);
  }
  if (dungLoai.has("WIPEOUT")) {
    lopCanKhai.push(["WIPEOUT", "AcDbWipeout", "WipeOut|Product Desc", 1]);
  }

  let than = "0\r\nSECTION\r\n2\r\nCLASSES\r\n";
  for (const [ten, lopCpp, ungDung, laThucThe] of lopCanKhai) {
    than += `0\r\nCLASS\r\n1\r\n${ten}\r\n2\r\n${lopCpp}\r\n3\r\n${ungDung}\r\n`;
    than += `90\r\n${laThucThe ? 1153 : 1152}\r\n91\r\n0\r\n280\r\n0\r\n281\r\n${laThucThe}\r\n`;
  }
  than += "0\r\nENDSEC\r\n";

  // ── 3. TABLES ──
  than += "0\r\nSECTION\r\n2\r\nTABLES\r\n";

  const openTable = (name: string, handle: string, count: number, extra = ""): string =>
    `0\r\nTABLE\r\n2\r\n${name}\r\n5\r\n${handle}\r\n330\r\n0\r\n100\r\nAcDbSymbolTable\r\n70\r\n${count}\r\n${extra}`;

  // Khung nhìn lúc mở tệp — PHẢI bám khung bao thật của bản vẽ.
  //
  // Vì sao đây là chỗ dễ sai mà không công cụ nào bắt được: AutoCAD khôi phục đúng khung nhìn
  // ghi ở bản ghi VPORT "*ACTIVE" khi mở tệp. Bản trước cắm cứng tâm (0,0) cao 1000 — với bản vẽ
  // MEPF trải 0…33000 × 0…17000 thì khung đó rơi vào một mẩu trống cạnh gốc toạ độ, người dùng
  // mở lên thấy **màn hình trắng trơn** dù 16 thực thể vẫn nằm nguyên trong tệp. `ezdxf` Auditor
  // báo 0 lỗi 0 fix vì tệp hoàn toàn hợp lệ — nó không quan tâm khung nhìn. Lỗi này chỉ lộ ra khi
  // mở bằng chính AutoCAD (người dùng báo, 2026-08-24).
  //
  // Mã 12/22 = tâm khung nhìn, 40 = chiều cao khung nhìn, 41 = tỷ lệ rộng/cao. Chiều cao phải đủ
  // phủ CẢ chiều cao lẫn chiều rộng khung bao (chiều rộng thấy được = cao × tỷ lệ), cộng 10% lề.
  than += openTable("VPORT", hVportTab, 1);
  than += tableRecordHead("VPORT", handles.take(), hVportTab, "AcDbViewportTableRecord");
  than += "2\r\n*ACTIVE\r\n70\r\n0\r\n10\r\n0.0\r\n20\r\n0.0\r\n11\r\n1.0\r\n21\r\n1.0\r\n";
  than += `12\r\n${real(tamX)}\r\n22\r\n${real(tamY)}\r\n40\r\n${real(caoKhungNhin)}\r\n41\r\n${real(TY_LE_KHUNG_NHIN)}\r\n`;
  than += "0\r\nENDTAB\r\n";

  // Hai bản ghi đầu BẮT BUỘC theo spec R2000: "ByBlock" và "ByLayer" — không phải linetype vẽ
  // được mà là mục đặc biệt AutoCAD đòi phải TỒN TẠI TRONG TỆP. ezdxf đánh lừa ở đúng chỗ này:
  // nó tự cấp 2 bản ghi ảo khi đọc (liệt kê "ByBlock"/"ByLayer" như thể có trong tệp, audit 0
  // lỗi) nên kiểm bằng ezdxf không phát hiện thiếu; AutoCAD thật thì báo thẳng "Missing Default
  // entry ByLayer in SymbolTable:LTYPE" rồi huỷ cả bản vẽ — xác nhận thật 2026-08-24.
  const lineTypes: Array<[string, string, number[]]> = [
    ["ByBlock", "", []],
    ["ByLayer", "", []],
    ["CONTINUOUS", "Solid line", []],
    ["CENTER", "Center ____ _ ____ _ ____", [30, -5, 10, -5]],
    ["HIDDEN", "Hidden __ __ __ __", [5, -5]],
    ["DASHED", "Dashed __ __ __ __", [15, -5]],
  ];
  // Layer/thực thể có thể tham chiếu linetype ngoài 4 loại dựng sẵn (VD linetype nhập từ XREF
  // như "Grid Line", "IMPORT-xref-..."). PHẢI khai thêm các tên đó vào bảng LTYPE — không có
  // định nghĩa gốc của chúng nên dựng bằng nét liền (CONTINUOUS) làm hình mẫu, còn hơn để lại
  // tham chiếu treo (AutoCAD từ chối mở tệp có LAYER/thực thể trỏ tới LTYPE chưa khai báo, cùng
  // lớp lỗi với bảng STYLE thiếu kiểu chữ — xem ghi chú styleNames phía trên).
  //
  // So khớp KHÔNG PHÂN BIỆT HOA/THƯỜNG: tên linetype trong AutoCAD không phân biệt hoa/thường
  // (bản ghi gốc thường là "Continuous", mảng dựng sẵn ở đây viết "CONTINUOUS" toàn hoa) — so
  // khớp phân biệt hoa/thường từng làm AutoCAD tự "Skipping duplicate definition of Continuous"
  // lúc mở, khiến số bản ghi THẬT ít hơn số khai trong header bảng LTYPE, lệch nhịp đọc và làm
  // hỏng lây bảng LAYER ngay sau đó ("drawing discarded" — xác nhận thật bằng AutoCAD 2026-08-24).
  const knownLineTypeNamesUpper = new Set(lineTypes.map(([name]) => name.toUpperCase()));
  const extraLineTypeNames = new Map<string, string>(); // key hoa toàn bộ → tên gốc giữ lại
  const collectLineType = (name?: string) => {
    if (!name) return;
    const key = name.toUpperCase();
    if (!knownLineTypeNamesUpper.has(key) && !extraLineTypeNames.has(key)) {
      extraLineTypeNames.set(key, name);
    }
  };
  layers.forEach((l) => collectLineType(l.lineType));
  entities.forEach((e) => collectLineType(e.lineType));
  (parsed.blocks || []).forEach((b) => b.entities?.forEach((e) => collectLineType(e.lineType)));
  extraLineTypeNames.forEach((name) => lineTypes.push([name, name, []]));

  than += openTable("LTYPE", hLtypeTab, lineTypes.length);
  for (const [name, desc, dashes] of lineTypes) {
    than += tableRecordHead("LTYPE", handles.take(), hLtypeTab, "AcDbLinetypeTableRecord");
    than += `2\r\n${name}\r\n70\r\n0\r\n3\r\n${desc}\r\n72\r\n65\r\n73\r\n${dashes.length}\r\n`;
    than += `40\r\n${real(dashes.reduce((a, d) => a + Math.abs(d), 0))}\r\n`;
    for (const d of dashes) than += `49\r\n${real(d)}\r\n74\r\n0\r\n`;
  }
  than += "0\r\nENDTAB\r\n";

  // Bảng LAYER — giữ nguyên trạng thái thật: đóng băng, khoá, tắt (mã 62 âm), bề rộng nét
  const uniqueLayers = new Map<
    string,
    { color: number; lineType: string; flags: number; lineWeight?: number }
  >();
  uniqueLayers.set("0", { color: 7, lineType: "CONTINUOUS", flags: 0 });
  layers.forEach((l) => {
    const finalName = useStandardLayers && l.standardName ? l.standardName : l.name;
    uniqueLayers.set(finalName, {
      color: l.isOff ? -Math.abs(l.colorNumber || 7) : l.colorNumber || 7,
      lineType: l.lineType || "CONTINUOUS",
      flags: (l.isFrozen ? 1 : 0) | (l.isLocked ? 4 : 0),
      lineWeight: l.lineWeight,
    });
  });
  than += openTable("LAYER", hLayerTab, uniqueLayers.size);
  uniqueLayers.forEach((val, name) => {
    than += tableRecordHead("LAYER", handles.take(), hLayerTab, "AcDbLayerTableRecord");
    than += `2\r\n${name}\r\n70\r\n${val.flags}\r\n62\r\n${val.color}\r\n6\r\n${val.lineType}\r\n`;
    // Mã 290 (cờ in/plot) — AutoCAD chấp nhận thiếu mã này ở layer thường (mặc định coi là có
    // in), nhưng đòi hỏi TƯỜNG MINH ở layer đặc biệt "Defpoints" (do chính AutoCAD tự quản lý,
    // luôn không in). Thiếu mã này riêng cho Defpoints khiến AutoCAD báo "Invalid
    // AcDbLayerTableRecord plot flag" ngay khi đọc xong record rồi huỷ cả bản vẽ — xác nhận thật
    // 2026-08-24 bằng chính AutoCAD của người dùng.
    than += `290\r\n${name.toUpperCase() === "DEFPOINTS" ? 0 : 1}\r\n`;
    than += `370\r\n${typeof val.lineWeight === "number" ? val.lineWeight : -3}\r\n`;
    than += `390\r\n${hPlaceholder}\r\n`;
    than += `347\r\n${hMaterialByLayer}\r\n`;
  });
  than += "0\r\nENDTAB\r\n";

  // Bảng STYLE — gom đủ kiểu chữ mà bản vẽ thật sự dùng, không chỉ mỗi STANDARD.
  // PHẢI quét cả entity bên trong định nghĩa BLOCK, không chỉ entity cấp model-space: block
  // thiết bị (thường xuất từ Revit, VD "VHT_Tag_T...") mang theo MTEXT nội bộ dùng style riêng
  // (Arial_2, RomanS...) không hề xuất hiện trong `entities`. Bỏ sót bước này khiến BLOCKS
  // section ghi thực thể tham chiếu tới STYLE chưa từng khai báo trong bảng — AutoCAD từ chối
  // mở tệp (dangling reference), trong khi `ezdxf` chỉ âm thầm xoá tham chiếu lỗi nên không lộ
  // ra khi kiểm bằng ezdxf. Xác nhận thật trên bản vẽ MEPF 65MB: thiếu 20+ style, AutoCAD không
  // mở lên được cho tới khi vá bằng đúng dòng quét thêm này.
  // So khớp không phân biệt hoa/thường — cùng lý do đã sửa ở LTYPE phía trên (tên style trong
  // AutoCAD cũng không phân biệt hoa/thường; định nghĩa trùng dù khác hoa/thường vẫn làm lệch
  // nhịp đọc bảng theo đúng cơ chế đã xác nhận thật).
  const styleNamesUpperSeen = new Set<string>(["STANDARD"]);
  const styleNames = new Set<string>(["STANDARD"]);
  const addStyleName = (name?: string) => {
    if (!name) return;
    const key = name.toUpperCase();
    if (!styleNamesUpperSeen.has(key)) {
      styleNamesUpperSeen.add(key);
      styleNames.add(name);
    }
  };
  entities.forEach((e) => addStyleName(e.textStyle));
  (parsed.blocks || []).forEach((b) => {
    b.entities?.forEach((e) => addStyleName(e.textStyle));
  });
  than += openTable("STYLE", hStyleTab, styleNames.size);
  const styleHandles = new Map<string, string>();
  styleNames.forEach((name) => {
    const hStyle = handles.take();
    styleHandles.set(name, hStyle);
    than += tableRecordHead("STYLE", hStyle, hStyleTab, "AcDbTextStyleTableRecord");
    than += `2\r\n${name}\r\n70\r\n0\r\n40\r\n0.0\r\n41\r\n1.0\r\n50\r\n0.0\r\n71\r\n0\r\n`;
    than += `42\r\n${real(defaultTextHeight)}\r\n3\r\ntxt\r\n4\r\n\r\n`;
  });
  than += "0\r\nENDTAB\r\n";

  than += openTable("VIEW", hViewTab, 0) + "0\r\nENDTAB\r\n";

  than += openTable("UCS", hUcsTab, 0) + "0\r\nENDTAB\r\n";

  than += openTable("APPID", hAppidTab, 1);
  than += tableRecordHead("APPID", handles.take(), hAppidTab, "AcDbRegAppTableRecord");
  than += "2\r\nACAD\r\n70\r\n0\r\n";
  than += "0\r\nENDTAB\r\n";

  // Bảng DIMSTYLE khai lớp riêng (AcDbDimStyleTable) và đếm bằng mã 71 — cùng lỗi "tham chiếu
  // treo" như STYLE/LTYPE ở trên: DIMENSION/LEADER (mã 3) có thể trỏ tới dimstyle khác STANDARD
  // (VD dimstyle riêng do Revit xuất), phải khai đủ thay vì chỉ mỗi STANDARD.
  // Cũng so khớp không phân biệt hoa/thường — cùng lý do đã sửa ở STYLE/LTYPE phía trên.
  const dimStyleNamesUpperSeen = new Set<string>(["STANDARD"]);
  const dimStyleNames = new Set<string>(["STANDARD"]);
  const collectDimStyle = (name?: string) => {
    if (!name) return;
    const key = name.toUpperCase();
    if (!dimStyleNamesUpperSeen.has(key)) {
      dimStyleNamesUpperSeen.add(key);
      dimStyleNames.add(name);
    }
  };
  entities.forEach((e) => collectDimStyle(e.dimStyle));
  (parsed.blocks || []).forEach((b) => b.entities?.forEach((e) => collectDimStyle(e.dimStyle)));

  than += `0\r\nTABLE\r\n2\r\nDIMSTYLE\r\n5\r\n${hDimTab}\r\n330\r\n0\r\n100\r\nAcDbSymbolTable\r\n70\r\n1\r\n100\r\nAcDbDimStyleTable\r\n71\r\n${dimStyleNames.size}\r\n`;
  dimStyleNames.forEach((name) => {
    than += tableRecordHead("DIMSTYLE", handles.take(), hDimTab, "AcDbDimStyleTableRecord");
    than += `2\r\n${name}\r\n70\r\n0\r\n40\r\n1.0\r\n140\r\n${real(defaultTextHeight)}\r\n`;
  });
  than += "0\r\nENDTAB\r\n";

  than += openTable("BLOCK_RECORD", hBlkRecTab, blockRecordHandles.size + 2);
  const blockRecord = (name: string, handle: string, layoutHandle?: string): string => {
    let out =
      tableRecordHead("BLOCK_RECORD", handle, hBlkRecTab, "AcDbBlockTableRecord") +
      `2\r\n${name}\r\n70\r\n0\r\n280\r\n1\r\n281\r\n0\r\n`;
    // Hai không gian trỏ ngược về đối tượng bố cục của mình (mã 340) — mối liên kết hai chiều
    // này là thứ cho AutoCAD biết thẻ Model / Layout1 gắn với khối nào.
    if (layoutHandle) out += `340\r\n${layoutHandle}\r\n`;
    return out;
  };
  than += blockRecord("*Model_Space", hModelSpace, hLayoutModel);
  than += blockRecord("*Paper_Space", hPaperSpace, hLayoutPaper);
  blockRecordHandles.forEach((handle, name) => {
    than += blockRecord(name, handle);
  });
  than += "0\r\nENDTAB\r\n0\r\nENDSEC\r\n";

  // ── 4. BLOCKS ──
  than += "0\r\nSECTION\r\n2\r\nBLOCKS\r\n";
  const blockDefById = new Map((parsed.blocks || []).map((b) => [b.name, b]));

  /** Một cặp BLOCK … ENDBLK đầy đủ handle/chủ sở hữu/lớp con của R2000. */
  const writeBlock = (
    name: string,
    ownerHandle: string,
    basePoint: [number, number, number],
    body: string,
    paperSpace = false,
  ): string => {
    let out = `0\r\nBLOCK\r\n5\r\n${handles.take()}\r\n330\r\n${ownerHandle}\r\n100\r\nAcDbEntity\r\n`;
    if (paperSpace) out += `67\r\n1\r\n`;
    out += `8\r\n0\r\n100\r\nAcDbBlockBegin\r\n2\r\n${name}\r\n70\r\n0\r\n`;
    out += `10\r\n${real(basePoint[0])}\r\n20\r\n${real(basePoint[1])}\r\n30\r\n${real(basePoint[2])}\r\n`;
    out += `3\r\n${name}\r\n1\r\n\r\n`;
    out += body;
    out += `0\r\nENDBLK\r\n5\r\n${handles.take()}\r\n330\r\n${ownerHandle}\r\n100\r\nAcDbEntity\r\n`;
    if (paperSpace) out += `67\r\n1\r\n`;
    out += `8\r\n0\r\n100\r\nAcDbBlockEnd\r\n`;
    return out;
  };

  than += writeBlock("*Model_Space", hModelSpace, [0, 0, 0], "");
  than += writeBlock("*Paper_Space", hPaperSpace, [0, 0, 0], "", true);

  // Khối của bản vẽ — ghi lại ĐÚNG hình học đọc được; khối không có định nghĩa thì để rỗng,
  // tuyệt đối không chèn hình "đại diện" do máy vẽ.
  blockNames.forEach((name) => {
    const handle = blockRecordHandles.get(name)!;
    const def = blockDefById.get(name);
    let body = "";
    for (const sub of def?.entities || []) {
      body += writeEntityR2000(
        sub,
        getLayer(sub.layer),
        defaultTextHeight,
        handles,
        handle,
        undefined,
        styleHandles.get(sub.textStyle || "STANDARD") || "0",
        hMLeaderStyle,
        hMLineStyle,
        sub.imageDefHandle ? imageDefHandles.get(sub.imageDefHandle) : undefined,
        sub.imageDefHandle ? (imageReactorHandles.get(sub.imageDefHandle) ?? "0") : "0",
      );
    }
    than += writeBlock(name, handle, def?.basePoint ?? [0, 0, 0], body);
  });

  // Khối ẩn của kích thước: chứa đường đo và chữ đo để AutoCAD hiển thị đúng kích thước
  dimBlockNames.forEach((blockName, dim) => {
    const handle = blockRecordHandles.get(blockName)!;
    const layer = getLayer(dim.layer);
    let body = "";
    const measure = dim.coordinates.measurePoints;
    if (measure) {
      body += writeEntityR2000(
        {
          id: `${dim.id}-LINE`,
          type: "LINE",
          layer: dim.layer,
          color: dim.color,
          coordinates: { start: measure[0], end: measure[1] },
        },
        layer,
        defaultTextHeight,
        handles,
        handle,
      );
    }
    const override = dim.decodedText || dim.textValue || "";
    const label =
      override && override !== "<>"
        ? override
        : typeof dim.measurement === "number"
          ? formatMeasurement(dim.measurement)
          : "";
    if (label) {
      const anchor =
        dim.coordinates.textMidPoint ||
        (measure
          ? ([
              (measure[0][0] + measure[1][0]) / 2,
              (measure[0][1] + measure[1][1]) / 2,
              (measure[0][2] + measure[1][2]) / 2,
            ] as [number, number, number])
          : dim.coordinates.center);
      body += writeEntityR2000(
        {
          id: `${dim.id}-TEXT`,
          type: "TEXT",
          layer: dim.layer,
          color: dim.color,
          coordinates: { center: anchor },
          decodedText: label,
          textHeight: dim.textHeight,
          textStyle: dim.textStyle,
        },
        layer,
        defaultTextHeight,
        handles,
        handle,
      );
    }
    than += writeBlock(blockName, handle, [0, 0, 0], body);
  });

  than += "0\r\nENDSEC\r\n";

  // ── 5. ENTITIES ──
  than += "0\r\nSECTION\r\n2\r\nENTITIES\r\n";
  for (const ent of entities) {
    const owner = ent.isPaperSpace ? hPaperSpace : hModelSpace;
    than += writeEntityR2000(
      ent,
      getLayer(ent.layer),
      defaultTextHeight,
      handles,
      owner,
      dimBlockNames.get(ent),
      styleHandles.get(ent.textStyle || "STANDARD") || "0",
      hMLeaderStyle,
      hMLineStyle,
      ent.imageDefHandle ? imageDefHandles.get(ent.imageDefHandle) : undefined,
      ent.imageDefHandle ? (imageReactorHandles.get(ent.imageDefHandle) ?? "0") : "0",
    );
  }
  than += "0\r\nENDSEC\r\n";

  // ── 6. OBJECTS — từ điển gốc, thứ R12 hoàn toàn không có ──
  than += "0\r\nSECTION\r\n2\r\nOBJECTS\r\n";
  than += `0\r\nDICTIONARY\r\n5\r\n${hRootDict}\r\n330\r\n0\r\n100\r\nAcDbDictionary\r\n`;
  than += `3\r\nACAD_GROUP\r\n350\r\n${hGroupDict}\r\n`;
  than += `3\r\nACAD_MLEADERSTYLE\r\n350\r\n${hMLeaderStyleDict}\r\n`;
  than += `3\r\nACAD_MLINESTYLE\r\n350\r\n${hMLineStyleDict}\r\n`;
  if (imageDefs.length > 0) than += `3\r\nACAD_IMAGE_DICT\r\n350\r\n${hImageDict}\r\n`;
  than += `3\r\nACAD_LAYOUT\r\n350\r\n${hLayoutDict}\r\n`;
  than += `3\r\nACAD_COLOR\r\n350\r\n${hColorDict}\r\n`;
  than += `3\r\nACAD_MATERIAL\r\n350\r\n${hMaterialDict}\r\n`;
  than += `3\r\nACAD_PLOTSETTINGS\r\n350\r\n${hPlotSettingsDict}\r\n`;
  than += `3\r\nACAD_PLOTSTYLENAME\r\n350\r\n${hPlotStyleDict}\r\n`;
  than += `3\r\nACAD_SCALELIST\r\n350\r\n${hScaleListDict}\r\n`;
  than += `3\r\nACAD_TABLESTYLE\r\n350\r\n${hTableStyleDict}\r\n`;
  than += `3\r\nACAD_VISUALSTYLE\r\n350\r\n${hVisualStyleDict}\r\n`;
  than += `0\r\nDICTIONARY\r\n5\r\n${hGroupDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;

  // MULTILEADER bắt buộc trỏ tới một kiểu chú thích dẫn; thiếu đối tượng này thì AutoCAD
  // không dựng được chú thích dù thực thể ghi đúng.
  than += `0\r\nDICTIONARY\r\n5\r\n${hMLeaderStyleDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
  than += `3\r\nStandard\r\n350\r\n${hMLeaderStyle}\r\n`;
  const hStandardStyle = styleHandles.get("STANDARD") || "0";
  than += `0\r\nMLEADERSTYLE\r\n5\r\n${hMLeaderStyle}\r\n330\r\n${hMLeaderStyleDict}\r\n100\r\nAcDbMLeaderStyle\r\n`;
  than += `179\r\n2\r\n170\r\n2\r\n171\r\n1\r\n172\r\n0\r\n90\r\n2\r\n40\r\n0.0\r\n41\r\n0.0\r\n`;
  than += `173\r\n1\r\n91\r\n-1056964608\r\n340\r\n0\r\n92\r\n-2\r\n`;
  than += `290\r\n1\r\n42\r\n${real(defaultTextHeight * 0.72)}\r\n`;
  than += `291\r\n1\r\n43\r\n${real(defaultTextHeight * 2)}\r\n3\r\nStandard\r\n`;
  // Thứ tự mã nhóm của MLEADERSTYLE: 340 kiểu nét dẫn, 341 đầu mũi tên, 342 KIỂU CHỮ, 343 khối.
  than += `341\r\n0\r\n44\r\n${real(defaultTextHeight * 0.08)}\r\n`;
  than += `300\r\n\r\n342\r\n${hStandardStyle}\r\n174\r\n1\r\n178\r\n1\r\n175\r\n1\r\n176\r\n0\r\n`;
  than += `93\r\n-1056964608\r\n45\r\n${real(defaultTextHeight)}\r\n292\r\n0\r\n`;
  than += `297\r\n0\r\n46\r\n1.0\r\n294\r\n0\r\n295\r\n0\r\n296\r\n0\r\n`;
  than += `143\r\n${real(defaultTextHeight * 0.09)}\r\n271\r\n0\r\n272\r\n9\r\n273\r\n9\r\n`;
  // MLINE bắt buộc trỏ tới một kiểu đường nhiều nét; thiếu đối tượng này AutoCAD không dựng được
  than += `0\r\nDICTIONARY\r\n5\r\n${hMLineStyleDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
  than += `3\r\nStandard\r\n350\r\n${hMLineStyle}\r\n`;
  than += `0\r\nMLINESTYLE\r\n5\r\n${hMLineStyle}\r\n330\r\n${hMLineStyleDict}\r\n100\r\nAcDbMlineStyle\r\n`;
  than += `2\r\nSTANDARD\r\n70\r\n0\r\n3\r\n\r\n62\r\n256\r\n51\r\n90.0\r\n52\r\n90.0\r\n`;
  than += `71\r\n2\r\n49\r\n0.5\r\n62\r\n256\r\n6\r\nBYLAYER\r\n49\r\n-0.5\r\n62\r\n256\r\n6\r\nBYLAYER\r\n`;
  // Kiểu in: ACAD_PLOTSTYLENAME là từ điển CÓ MẶC ĐỊNH (ACDBDICTIONARYWDFLT), mục "Normal" trỏ
  // tới một ACDBPLACEHOLDER — chính là thứ mã 390 của mỗi layer tham chiếu tới.
  than += `0\r\nACDBDICTIONARYWDFLT\r\n5\r\n${hPlotStyleDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
  than += `281\r\n1\r\n3\r\nNormal\r\n350\r\n${hPlaceholder}\r\n`;
  than += `100\r\nAcDbDictionaryWithDefault\r\n340\r\n${hPlaceholder}\r\n`;
  than += `0\r\nACDBPLACEHOLDER\r\n5\r\n${hPlaceholder}\r\n330\r\n${hPlotStyleDict}\r\n`;

  // Vật liệu: mỗi layer trỏ về ByLayer qua mã 347
  than += `0\r\nDICTIONARY\r\n5\r\n${hMaterialDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
  than += `3\r\nByBlock\r\n350\r\n${hMaterialByBlock}\r\n3\r\nByLayer\r\n350\r\n${hMaterialByLayer}\r\n`;
  than += `3\r\nGlobal\r\n350\r\n${hMaterialGlobal}\r\n`;
  for (const [h, ten] of [
    [hMaterialByBlock, "ByBlock"],
    [hMaterialByLayer, "ByLayer"],
    [hMaterialGlobal, "Global"],
  ] as const) {
    than += `0\r\nMATERIAL\r\n5\r\n${h}\r\n330\r\n${hMaterialDict}\r\n100\r\nAcDbMaterial\r\n`;
    than += `1\r\n${ten}\r\n2\r\n\r\n`;
  }

  // Danh sách tỷ lệ chú thích: bản 2008 trở lên đọc từ đây khi in theo tỷ lệ
  than += `0\r\nDICTIONARY\r\n5\r\n${hScaleListDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
  than += `281\r\n1\r\n3\r\nA0\r\n350\r\n${hScale11}\r\n`;
  than += `0\r\nSCALE\r\n5\r\n${hScale11}\r\n330\r\n${hScaleListDict}\r\n100\r\nAcDbScale\r\n`;
  than += `70\r\n0\r\n300\r\n1:1\r\n140\r\n1.0\r\n141\r\n1.0\r\n290\r\n1\r\n`;

  // Bốn từ điển còn lại luôn có mặt trong tệp thật, để rỗng là hợp lệ
  for (const h of [hVisualStyleDict, hTableStyleDict, hPlotSettingsDict, hColorDict]) {
    than += `0\r\nDICTIONARY\r\n5\r\n${h}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n281\r\n1\r\n`;
  }

  // Bố cục in: thiếu đối tượng LAYOUT thì không gian giấy (khung tên, khung in, khung nhìn)
  // không có chỗ bám — AutoCAD mở tệp ra chỉ thấy model space.
  than += `0\r\nDICTIONARY\r\n5\r\n${hLayoutDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
  than += `3\r\nModel\r\n350\r\n${hLayoutModel}\r\n3\r\nLayout1\r\n350\r\n${hLayoutPaper}\r\n`;

  const layoutObject = (
    handle: string,
    ten: string,
    thuTuTab: number,
    blockRecord: string,
  ): string => {
    let out = `0\r\nLAYOUT\r\n5\r\n${handle}\r\n330\r\n${hLayoutDict}\r\n100\r\nAcDbPlotSettings\r\n`;
    out += `1\r\n\r\n2\r\n\r\n4\r\nISO_A3_(420.00_x_297.00_MM)\r\n6\r\n\r\n`;
    out += `40\r\n7.5\r\n41\r\n20.0\r\n42\r\n7.5\r\n43\r\n20.0\r\n44\r\n420.0\r\n45\r\n297.0\r\n`;
    out += `46\r\n0.0\r\n47\r\n0.0\r\n48\r\n0.0\r\n49\r\n0.0\r\n140\r\n0.0\r\n141\r\n0.0\r\n`;
    out += `142\r\n1.0\r\n143\r\n1.0\r\n70\r\n688\r\n72\r\n1\r\n73\r\n0\r\n74\r\n5\r\n`;
    out += `7\r\n\r\n75\r\n16\r\n147\r\n1.0\r\n148\r\n0.0\r\n149\r\n0.0\r\n`;
    out += `100\r\nAcDbLayout\r\n1\r\n${ten}\r\n70\r\n1\r\n71\r\n${thuTuTab}\r\n`;
    out += `10\r\n0.0\r\n20\r\n0.0\r\n11\r\n420.0\r\n21\r\n297.0\r\n`;
    out += `12\r\n0.0\r\n22\r\n0.0\r\n32\r\n0.0\r\n`;
    out += `14\r\n${real(bao?.minX ?? 0)}\r\n24\r\n${real(bao?.minY ?? 0)}\r\n34\r\n0.0\r\n`;
    out += `15\r\n${real(bao?.maxX ?? 0)}\r\n25\r\n${real(bao?.maxY ?? 0)}\r\n35\r\n0.0\r\n`;
    out += `146\r\n0.0\r\n13\r\n0.0\r\n23\r\n0.0\r\n33\r\n0.0\r\n`;
    out += `16\r\n1.0\r\n26\r\n0.0\r\n36\r\n0.0\r\n17\r\n0.0\r\n27\r\n1.0\r\n37\r\n0.0\r\n`;
    out += `76\r\n0\r\n330\r\n${blockRecord}\r\n`;
    return out;
  };
  than += layoutObject(hLayoutModel, "Model", 0, hModelSpace);
  than += layoutObject(hLayoutPaper, "Layout1", 1, hPaperSpace);

  // Ảnh chèn / vùng che: dựng lại từ điển ảnh, từng IMAGEDEF và IMAGEDEF_REACTOR đi kèm
  if (imageDefs.length > 0) {
    than += `0\r\nDICTIONARY\r\n5\r\n${hImageDict}\r\n330\r\n${hRootDict}\r\n100\r\nAcDbDictionary\r\n`;
    imageDefs.forEach((def, idx) => {
      than += `3\r\nAnh_${idx + 1}\r\n350\r\n${imageDefHandles.get(def.handle)}\r\n`;
    });
    for (const def of imageDefs) {
      const h = imageDefHandles.get(def.handle)!;
      const hReactor = imageReactorHandles.get(def.handle)!;
      than += `0\r\nIMAGEDEF\r\n5\r\n${h}\r\n330\r\n${hImageDict}\r\n100\r\nAcDbRasterImageDef\r\n`;
      than += `90\r\n0\r\n1\r\n${def.path}\r\n`;
      than += `10\r\n${real(def.sizePx?.[0] ?? 1)}\r\n20\r\n${real(def.sizePx?.[1] ?? 1)}\r\n`;
      than += `11\r\n${real(def.pixelSize?.[0] ?? 1)}\r\n21\r\n${real(def.pixelSize?.[1] ?? 1)}\r\n`;
      than += `280\r\n1\r\n281\r\n0\r\n`;
      than += `0\r\nIMAGEDEF_REACTOR\r\n5\r\n${hReactor}\r\n330\r\n${h}\r\n100\r\nAcDbRasterImageDefReactor\r\n90\r\n2\r\n330\r\n${h}\r\n`;
    }
  }

  than += "0\r\nENDSEC\r\n";

  // $HANDSEED phải lớn hơn mọi handle đã cấp — nên chốt sau cùng
  header += `9\r\n$HANDSEED\r\n5\r\n${handles.seed}\r\n`;
  header += "0\r\nENDSEC\r\n";

  dxf = header + than + "0\r\nEOF\r\n";
  return dxf;
}

/** Bốn section bắt buộc trong mọi tệp DXF ASCII, ở bất kỳ phiên bản nào */
const REQUIRED_DXF_SECTIONS = ["HEADER", "TABLES", "BLOCKS", "ENTITIES"];

/**
 * Section bắt buộc thêm khi tệp khai R2000 (AC1015) trở lên: OBJECTS chứa từ điển gốc, thiếu nó
 * AutoCAD báo tệp hỏng. Không áp cho tệp khai phiên bản cũ hơn — tệp R12 hợp lệ vẫn không có
 * OBJECTS, và người dùng vẫn có quyền tải lên tệp cũ.
 */
const OBJECTS_SECTION_FROM = "AC1015";

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

    // Tệp khai R2000 trở lên mà thiếu OBJECTS là tệp hỏng — AutoCAD không mở được
    const acadVer = /\$ACADVER\r?\n\s*1\r?\n\s*(AC\d{4})/.exec(content)?.[1];
    if (acadVer && acadVer >= OBJECTS_SECTION_FROM && !foundSections.has("OBJECTS")) {
      errors.push(`Tệp khai ${acadVer} (R2000 trở lên) nhưng thiếu section OBJECTS.`);
    }

    const meaningfulLines = body.map((l) => l.trim()).filter((l) => l.length > 0);
    const n = meaningfulLines.length;
    if (n < 2 || meaningfulLines[n - 1] !== "EOF" || meaningfulLines[n - 2] !== "0") {
      errors.push('Tệp DXF phải kết thúc bằng cặp mã "0" + "EOF".');
    }
  }

  return { valid: errors.length === 0, errors };
}
