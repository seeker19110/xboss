// Bộ ghi + bộ kiểm DXF cho luồng chuẩn hóa bản vẽ 2D (/engineering/chuan-hoa-ban-ve).
//
// Vì sao R12 (AC1009): bản vẽ chuẩn hóa của XBoss chỉ cần hình học 2D. Định dạng
// R2000 (AC1015) đòi handle + subclass marker (100/AcDbEntity, AcDbPolyline...) +
// section OBJECTS cho MỌI thực thể; thiếu một chỗ là AutoCAD từ chối mở cả file.
// R12 không yêu cầu những thứ đó nên bộ ghi thuần chuỗi vừa ngắn vừa chắc, và mọi
// phiên bản AutoCAD đều đọc được.
import type { DxfParseResult, DxfLayerInfo } from "./dxf-parser";

const NL = "\r\n";

// Một cặp (mã nhóm, giá trị) trong file DXF ASCII.
const tag = (code: number | string, value: string | number) => `${code}${NL}${value}${NL}`;

// DXF không chấp nhận NaN/Infinity — quy về 0 để 1 điểm lỗi không hỏng cả file.
function num(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(4) : "0.0";
}

// Toạ độ: LUÔN ghi Z = 0. Bản vẽ chuẩn hóa là 2D thuần — giữ cao độ Z của file gốc
// sẽ tạo hình học "nổi" trong không gian, sai mục tiêu chuẩn hóa.
const point2d = (baseCode: number, x: unknown, y: unknown) =>
  tag(baseCode, num(x)) + tag(baseCode + 10, num(y)) + tag(baseCode + 20, "0.0");

// Tên bảng (layer/block/style) trong DXF không được chứa khoảng trắng và ký tự đặc
// biệt — AutoCAD từ chối bảng có tên sai.
export function sanitizeDxfName(name: string, fallback: string): string {
  const s = (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_$\-.]/g, "_")
    .slice(0, 255);
  return s || fallback;
}

// Chuỗi TEXT trong DXF R12 theo codepage, không phải UTF-8 — ký tự tiếng Việt phải
// escape thành \U+XXXX thì AutoCAD mới hiện đúng dấu. Ghi thẳng UTF-8 sẽ ra ký tự
// rác, đúng loại lỗi font mà Font Doctor sinh ra để sửa.
export function encodeDxfText(text: string): string {
  return (text || "")
    .replace(/\r?\n/g, " ")
    .replace(
      /[^\x20-\x7E]/g,
      (ch) => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
    );
}

// Màu AutoCAD Color Index hợp lệ: 1..255 (0 = ByBlock, 256 = ByLayer).
function colorIndex(v: unknown, fallback = 7): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 256 ? n : fallback;
}

const LINE_TYPES = [
  { name: "CONTINUOUS", desc: "Solid line", pattern: [] as number[] },
  { name: "CENTER", desc: "Center ____ _ ____ _ ____", pattern: [30.0, -5.0, 10.0, -5.0] },
  { name: "HIDDEN", desc: "Hidden __ __ __ __", pattern: [5.0, -5.0] },
  { name: "DASHED", desc: "Dashed __ __ __ __", pattern: [15.0, -5.0] },
];
const LINE_TYPE_NAMES = new Set(LINE_TYPES.map((l) => l.name));

function writeLtypeTable(): string {
  let s = tag(0, "TABLE") + tag(2, "LTYPE") + tag(70, LINE_TYPES.length);
  for (const lt of LINE_TYPES) {
    const total = lt.pattern.reduce((a, b) => a + Math.abs(b), 0);
    s +=
      tag(0, "LTYPE") +
      tag(2, lt.name) +
      tag(70, 0) +
      tag(3, lt.desc) +
      tag(72, 65) +
      tag(73, lt.pattern.length) +
      tag(40, num(total));
    for (const d of lt.pattern) s += tag(49, num(d));
  }
  return s + tag(0, "ENDTAB");
}

/**
 * Xuất DxfParseResult thành file DXF R12 ASCII 2D thuần, mở lại được trên AutoCAD.
 */
export function writeDxfR12(
  parsed: DxfParseResult,
  options?: { applyStandardLayers?: boolean },
): string {
  const useStandardLayers = options?.applyStandardLayers ?? true;
  const sourceLayers: DxfLayerInfo[] =
    parsed.layers && parsed.layers.length > 0 ? parsed.layers : [];

  // Ánh xạ tên layer gốc → tên layer ghi ra file (đã chuẩn hóa + hợp lệ với DXF).
  const layerMap = new Map<string, string>();
  const layerDefs = new Map<string, { color: number; lineType: string }>();
  layerDefs.set("0", { color: 7, lineType: "CONTINUOUS" });
  for (const l of sourceLayers) {
    const raw = useStandardLayers && l.standardName ? l.standardName : l.name;
    const finalName = sanitizeDxfName(raw, "LAYER_0");
    layerMap.set(l.name, finalName);
    const lineType = sanitizeDxfName(l.lineType || "CONTINUOUS", "CONTINUOUS").toUpperCase();
    layerDefs.set(finalName, {
      color: colorIndex(l.colorNumber),
      // Chỉ nhận kiểu nét có định nghĩa trong bảng LTYPE — tham chiếu kiểu nét lạ
      // làm AutoCAD báo lỗi khi mở.
      lineType: LINE_TYPE_NAMES.has(lineType) ? lineType : "CONTINUOUS",
    });
  }
  const getLayer = (name: string) => layerMap.get(name) || sanitizeDxfName(name, "0");

  // Layer của thực thể phải tồn tại trong bảng LAYER — bổ sung layer chưa khai báo.
  for (const ent of parsed.entities || []) {
    const lyr = getLayer(ent.layer);
    if (!layerDefs.has(lyr)) layerDefs.set(lyr, { color: 7, lineType: "CONTINUOUS" });
  }

  // Danh mục block: gộp block khai báo sẵn và block được INSERT tham chiếu.
  const blockMap = new Map<string, string>();
  for (const b of parsed.blocks || []) {
    blockMap.set(b.name, sanitizeDxfName(b.name, "BLOCK_0"));
  }
  for (const ent of parsed.entities || []) {
    if (ent.type === "INSERT" && ent.blockName && !blockMap.has(ent.blockName)) {
      blockMap.set(ent.blockName, sanitizeDxfName(ent.blockName, "BLOCK_0"));
    }
  }

  // ── 1. HEADER ──
  let dxf = tag(0, "SECTION") + tag(2, "HEADER");
  dxf += tag(9, "$ACADVER") + tag(1, "AC1009");
  dxf += tag(9, "$INSUNITS") + tag(70, 4); // 4 = milimét (hệ mét xây dựng MEPF)
  dxf += tag(9, "$MEASUREMENT") + tag(70, 1); // 1 = hệ mét
  const b = parsed.diagnostic?.boundingDimensions;
  const minX = b ? b.minX || 0 : 0;
  const minY = b ? b.minY || 0 : 0;
  const maxX = b ? b.maxX || 10000 : 10000;
  const maxY = b ? b.maxY || 10000 : 10000;
  dxf += tag(9, "$EXTMIN") + point2d(10, minX, minY);
  dxf += tag(9, "$EXTMAX") + point2d(10, maxX, maxY);
  dxf += tag(9, "$LIMMIN") + tag(10, num(minX)) + tag(20, num(minY));
  dxf += tag(9, "$LIMMAX") + tag(10, num(maxX)) + tag(20, num(maxY));
  dxf += tag(0, "ENDSEC");

  // ── 2. TABLES ──
  dxf += tag(0, "SECTION") + tag(2, "TABLES");
  dxf += writeLtypeTable();

  dxf += tag(0, "TABLE") + tag(2, "LAYER") + tag(70, layerDefs.size);
  layerDefs.forEach((def, name) => {
    dxf += tag(0, "LAYER") + tag(2, name) + tag(70, 0) + tag(62, def.color) + tag(6, def.lineType);
  });
  dxf += tag(0, "ENDTAB");

  // Bảng STYLE — mọi TEXT tham chiếu style STANDARD nên style này bắt buộc tồn tại.
  dxf += tag(0, "TABLE") + tag(2, "STYLE") + tag(70, 1);
  dxf +=
    tag(0, "STYLE") +
    tag(2, "STANDARD") +
    tag(70, 0) +
    tag(40, "0.0") +
    tag(41, "1.0") +
    tag(50, "0.0") +
    tag(71, 0) +
    tag(42, "2.5") +
    tag(3, "txt") +
    tag(4, "");
  dxf += tag(0, "ENDTAB");

  dxf += tag(0, "ENDSEC");

  // ── 3. BLOCKS ──
  dxf += tag(0, "SECTION") + tag(2, "BLOCKS");
  blockMap.forEach((name) => {
    // BLOCK trong R12 bắt buộc có mã 8 (layer), 2 và 3 (tên), 1 (đường dẫn xref).
    dxf +=
      tag(0, "BLOCK") +
      tag(8, "0") +
      tag(2, name) +
      tag(70, 0) +
      point2d(10, 0, 0) +
      tag(3, name) +
      tag(1, "");
    dxf += tag(0, "ENDBLK") + tag(8, "0");
  });
  dxf += tag(0, "ENDSEC");

  // ── 4. ENTITIES ──
  dxf += tag(0, "SECTION") + tag(2, "ENTITIES");
  for (const ent of parsed.entities || []) {
    const lyr = getLayer(ent.layer);
    const head = (type: string) => {
      let h = tag(0, type) + tag(8, lyr);
      const c = Number(ent.color);
      if (Number.isInteger(c) && c >= 1 && c <= 255) h += tag(62, c);
      return h;
    };
    const c = ent.coordinates || {};

    if (ent.type === "LINE" && c.start && c.end) {
      dxf += head("LINE") + point2d(10, c.start[0], c.start[1]) + point2d(11, c.end[0], c.end[1]);
    } else if (
      (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
      c.points &&
      c.points.length > 0
    ) {
      // R12 KHÔNG có LWPOLYLINE — phải ghi POLYLINE + VERTEX + SEQEND, nếu không
      // AutoCAD (và mọi bộ đọc đúng chuẩn) hỏng ngay tại thực thể này.
      dxf += head("POLYLINE") + tag(66, 1) + point2d(10, 0, 0) + tag(70, 0);
      for (const p of c.points) {
        dxf += tag(0, "VERTEX") + tag(8, lyr) + point2d(10, p[0], p[1]);
      }
      dxf += tag(0, "SEQEND") + tag(8, lyr);
    } else if (ent.type === "CIRCLE" && c.center) {
      dxf += head("CIRCLE") + point2d(10, c.center[0], c.center[1]) + tag(40, num(c.radius ?? 100));
    } else if (ent.type === "ARC" && c.center) {
      dxf +=
        head("ARC") +
        point2d(10, c.center[0], c.center[1]) +
        tag(40, num(c.radius ?? 100)) +
        tag(50, "0.0") +
        tag(51, "180.0");
    } else if (ent.type === "TEXT" || ent.type === "MTEXT") {
      // MTEXT là thực thể R13+ — hạ về TEXT để giữ được nội dung trong file R12.
      const x = c.center ? c.center[0] : 0;
      const y = c.center ? c.center[1] : 0;
      dxf +=
        head("TEXT") +
        point2d(10, x, y) +
        tag(40, num(250)) +
        tag(1, encodeDxfText(ent.decodedText || ent.textValue || "")) +
        tag(7, "STANDARD");
    } else if (ent.type === "INSERT" && ent.blockName) {
      const x = c.center ? c.center[0] : 0;
      const y = c.center ? c.center[1] : 0;
      dxf +=
        head("INSERT") +
        tag(2, blockMap.get(ent.blockName) || sanitizeDxfName(ent.blockName, "BLOCK_0")) +
        point2d(10, x, y) +
        tag(41, "1.0") +
        tag(42, "1.0") +
        tag(43, "1.0") +
        tag(50, "0.0");
    } else if (ent.type === "DIMENSION" && c.start && c.end) {
      // DIMENSION R12 cần block hình học đi kèm (*D<n>) mới mở được; bản vẽ chuẩn
      // hóa không dựng lại được block đó từ dữ liệu đã parse, nên giữ lại phần có ý
      // nghĩa với hồ sơ: đường kích thước + chữ số đo, dưới dạng LINE + TEXT cùng
      // layer. Ghi DIMENSION thiếu block sẽ làm hỏng cả file.
      dxf += head("LINE") + point2d(10, c.start[0], c.start[1]) + point2d(11, c.end[0], c.end[1]);
      const mx = (Number(c.start[0]) + Number(c.end[0])) / 2;
      const my = (Number(c.start[1]) + Number(c.end[1])) / 2;
      dxf +=
        tag(0, "TEXT") +
        tag(8, lyr) +
        point2d(10, mx, my) +
        tag(40, num(250)) +
        tag(1, encodeDxfText(ent.decodedText || ent.textValue || "")) +
        tag(7, "STANDARD");
    }
  }
  dxf += tag(0, "ENDSEC");

  // ── 5. EOF ──
  dxf += tag(0, "EOF");
  return dxf;
}

// ── Bộ kiểm DXF: chạy NGAY LÚC CONVERT, trước khi file tới tay người dùng ──
// Bài học: file hỏng chỉ lộ ra khi kỹ sư mở trên AutoCAD ngoài công trường, lúc đó
// đã muộn. Bộ kiểm này bắt các lỗi cấu trúc khiến AutoCAD từ chối mở, để luồng
// convert/lưu trả lỗi rõ ràng thay vì ghi ra một file không mở được.

export type DxfValidationIssue = { code: string; message: string };
export type DxfValidationResult = {
  valid: boolean;
  errors: DxfValidationIssue[]; // AutoCAD sẽ không mở được → chặn
  warnings: DxfValidationIssue[]; // mở được nhưng lệch chuẩn 2D → chỉ cảnh báo
};

// Thực thể chỉ tồn tại từ R13 trở lên — có mặt trong file khai AC1009 là hỏng.
const NON_R12_ENTITIES = ["LWPOLYLINE", "MTEXT", "ELLIPSE", "REGION", "MULTILEADER", "HATCH"];

export function validateDxf(content: string): DxfValidationResult {
  const errors: DxfValidationIssue[] = [];
  const warnings: DxfValidationIssue[] = [];
  const push = (list: DxfValidationIssue[], code: string, message: string) =>
    list.push({ code, message });

  if (!content || !content.trim()) {
    return { valid: false, errors: [{ code: "EMPTY", message: "Tệp DXF rỗng" }], warnings };
  }

  // Tách thành cặp (mã nhóm, giá trị) — đúng cách AutoCAD đọc file DXF ASCII.
  const lines = content.split(/\r\n|\r|\n/);
  const pairs: Array<{ code: number; value: string }> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) {
      push(errors, "BAD_GROUP_CODE", `Mã nhóm không hợp lệ tại dòng ${i + 1}: "${lines[i]}"`);
      return { valid: false, errors, warnings };
    }
    pairs.push({ code, value: lines[i + 1] });
  }
  if (!pairs.length) {
    return { valid: false, errors: [{ code: "EMPTY", message: "Tệp DXF rỗng" }], warnings };
  }

  // Cấu trúc SECTION/ENDSEC phải cân và file phải kết thúc bằng EOF.
  const sections: string[] = [];
  let depth = 0;
  let sawEof = false;
  let version = "";
  const entityTypes: string[] = [];
  const declaredLayers = new Set<string>(["0"]);
  const usedLayers = new Set<string>();
  const declaredBlocks = new Set<string>();
  const usedBlocks = new Set<string>();
  const declaredStyles = new Set<string>();
  const usedStyles = new Set<string>();
  let currentSection = "";
  let inTables = false;
  let currentTable = "";
  let nonZeroZ = 0;

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];
    const v = (value ?? "").trim();

    if (code === 0) {
      if (v === "SECTION") {
        depth++;
        currentSection = (pairs[i + 1]?.value ?? "").trim();
        sections.push(currentSection);
        inTables = currentSection === "TABLES";
      } else if (v === "ENDSEC") {
        depth--;
        currentSection = "";
        inTables = false;
      } else if (v === "EOF") {
        sawEof = true;
      } else if (inTables && v === "TABLE") {
        currentTable = (pairs[i + 1]?.value ?? "").trim();
      } else if (inTables && v === "ENDTAB") {
        currentTable = "";
      } else if (inTables && v === "LAYER") {
        declaredLayers.add((pairs[i + 1]?.value ?? "").trim());
      } else if (inTables && v === "STYLE") {
        declaredStyles.add((pairs[i + 1]?.value ?? "").trim().toUpperCase());
      } else if (currentSection === "BLOCKS" && v === "BLOCK") {
        for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j++) {
          if (pairs[j].code === 2) declaredBlocks.add((pairs[j].value ?? "").trim());
        }
      } else if (currentSection === "ENTITIES") {
        entityTypes.push(v);
        if (NON_R12_ENTITIES.includes(v)) {
          push(
            errors,
            "ENTITY_NOT_IN_R12",
            `Thực thể ${v} không tồn tại trong DXF R12 — AutoCAD sẽ báo lỗi cấu trúc khi mở`,
          );
        }
        // Đọc thuộc tính của thực thể tới thực thể kế tiếp.
        for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j++) {
          const { code: ac, value: av } = pairs[j];
          const at = (av ?? "").trim();
          if (ac === 8) usedLayers.add(at);
          else if (ac === 7) usedStyles.add(at.toUpperCase());
          else if (ac === 2 && v === "INSERT") usedBlocks.add(at);
          else if (ac === 30 || ac === 31 || ac === 32) {
            if (Number(at) !== 0) nonZeroZ++;
          }
          if ((ac >= 10 && ac <= 59) || ac === 40) {
            if (at !== "" && !Number.isFinite(Number(at))) {
              push(errors, "BAD_NUMERIC", `Giá trị số không hợp lệ ở ${v}, mã ${ac}: "${at}"`);
            }
          }
        }
      }
    } else if (code === 9 && v === "$ACADVER") {
      version = (pairs[i + 1]?.value ?? "").trim();
    }
  }

  if (depth !== 0) {
    push(errors, "UNBALANCED_SECTION", `SECTION/ENDSEC không cân (lệch ${depth})`);
  }
  if (!sawEof) push(errors, "NO_EOF", "Thiếu dấu kết thúc EOF — AutoCAD coi tệp bị cắt cụt");
  if (!sections.includes("HEADER")) push(errors, "NO_HEADER", "Thiếu section HEADER");
  if (!sections.includes("TABLES")) push(errors, "NO_TABLES", "Thiếu section TABLES");
  if (!sections.includes("ENTITIES")) push(errors, "NO_ENTITIES", "Thiếu section ENTITIES");
  if (!version) push(errors, "NO_ACADVER", "Thiếu biến $ACADVER trong HEADER");

  // Khai R2000+ mà không có handle/subclass marker là lỗi kinh điển làm AutoCAD từ
  // chối mở — chính là bug đã gặp ở bộ ghi cũ.
  if (version && version >= "AC1015" && !content.includes("AcDbEntity")) {
    push(
      errors,
      "VERSION_WITHOUT_SUBCLASS",
      `Tệp khai $ACADVER ${version} (R2000+) nhưng thiếu subclass marker/handle — AutoCAD sẽ không mở được. Bản vẽ 2D nên xuất ở R12 (AC1009).`,
    );
  }

  for (const l of usedLayers) {
    if (!declaredLayers.has(l)) {
      push(errors, "UNDECLARED_LAYER", `Thực thể dùng layer "${l}" chưa khai trong bảng LAYER`);
    }
  }
  for (const b of usedBlocks) {
    if (!declaredBlocks.has(b)) {
      push(errors, "UNDECLARED_BLOCK", `INSERT tham chiếu block "${b}" chưa có định nghĩa BLOCK`);
    }
  }
  for (const s of usedStyles) {
    if (!declaredStyles.has(s)) {
      push(errors, "UNDECLARED_STYLE", `TEXT dùng style "${s}" chưa khai trong bảng STYLE`);
    }
  }
  if (!entityTypes.length) {
    push(warnings, "NO_ENTITY", "Bản vẽ không có thực thể nào — tệp mở được nhưng trống");
  }
  // Mục tiêu là bản vẽ 2D thuần: còn cao độ Z khác 0 là chưa chuẩn hóa xong.
  if (nonZeroZ > 0) {
    push(
      warnings,
      "NOT_FLAT_2D",
      `Còn ${nonZeroZ} toạ độ Z khác 0 — bản vẽ chưa phải 2D thuần trên mặt phẳng XY`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
