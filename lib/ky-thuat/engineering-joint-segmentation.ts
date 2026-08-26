// lib/ky-thuat/engineering-joint-segmentation.ts — M105: engine chia đốt MEPF theo kiểu kết nối
/**
 * Engine THUẦN (không chạm DB, không biết HTTP) mirror bản C#
 * `plugin-autocad/XBoss.Cad.Core/Draw/JointSegmenter.cs` (PR2). Mọi tham số chia đốt đến từ khối
 * `drawTools.systems[].lines[].jointRules` của rule pack (xem `drawTools.jointRulesNote` trong
 * `lib/ky-thuat/cad/rule-packs/v9.json`) — engine KHÔNG hard-code bất kỳ con số nghiệp vụ nào.
 *
 * Hai engine (TS ở web + C# trong plugin) bị khóa với nhau bằng bộ test vector JSON dùng chung
 * `plugin-autocad/testdata/joint-segmentation/*.json` (M105 NFR1/AC12) — sửa công thức ở đây thì
 * phải sửa cả bản C# và chạy lại đúng bộ vector đó.
 */
import { RULE_PACK_HIEN_HANH } from "@/lib/ky-thuat/cad/rule-pack-hien-hanh";

// ============================================================================
// 1. KIỂU DỮ LIỆU (contract dùng chung với rule pack, API và bản C#)
// ============================================================================

/** Cách khai cỡ của tuyến: ống gió/máng cáp `WxH` (mm), ống nước/PCCC `DN`. */
export type SizeKind = "WxH" | "DN";

/** `deu` = chia đều n đốt bằng nhau (ống gió); `cay_nguyen` = tối đa hóa cây/thanh nguyên rồi để
 *  phần dư ở đốt cuối (ống nước/PCCC/máng cáp — cắt từ cây thương phẩm). */
export type DivideMode = "deu" | "cay_nguyen";

/** Một dòng trong bảng chọn kiểu nối tự động (`jointRules.selection`), xét theo THỨ TỰ khai báo. */
export interface JointSelectionRow {
  jointType: string;
  /** Ngưỡng CẠNH LỚN max(W,H) — chỉ dùng cho tuyến `WxH`. `null`/thiếu = bắt hết phần còn lại. */
  maxSideMm?: number | null;
  /** Ngưỡng DN — chỉ dùng cho tuyến `DN`. `null`/thiếu = bắt hết phần còn lại. */
  maxDn?: number | null;
  /** Chiều dài đốt tối đa (mm). */
  maxLenMm: number;
  /** Khe mối nối (gioăng/rãnh) CỘNG THÊM giữa 2 đốt liền kề (mm). */
  jointGapMm: number;
}

/** Một dòng định mức phụ kiện cho MỖI MỐI NỐI. */
export interface JointHardwareSpec {
  item: string;
  /** Số, hoặc biểu thức mini theo biến `W`/`H`/`DN` (mm) — xem `tinhBieuThucDinhMuc`. */
  perJoint: number | string;
  /** `"m"` quy đổi mm→m khi tổng hợp; đơn vị khác (vd `"cái"`) giữ nguyên trị biểu thức. */
  unit: string;
}

/** Kiểu dáng layer vạch chia. Hậu tố nối THẲNG vào layer tim, KHÔNG có dấu phân tách đứng đầu
 *  (nếu có thì layer vạch chia sẽ khớp `takeoff.layerMatchAny` và bị bóc trùng — M105 FR5). */
export interface JointLayerStyle {
  suffix: string;
  color?: number;
  linetype?: string;
}

/** Bảng định mức phụ kiện theo kiểu nối. Giá trị có thể `undefined` vì mỗi tuyến chỉ khai đúng
 *  những kiểu nối của nó (kiểu nối lạ → `explodeJointHardware` ném lỗi rõ ràng). */
export type JointHardwareTable = Readonly<Record<string, readonly JointHardwareSpec[] | undefined>>;

/** Khối `jointRules` của MỘT tuyến trong rule pack. */
export interface JointRules {
  selection: readonly JointSelectionRow[];
  divideMode: string;
  minPieceLenMm: number;
  layerStyle: JointLayerStyle;
  hardware: JointHardwareTable;
}

/** Cỡ tuyến đã parse — cũng chính là bộ biến của biểu thức định mức phụ kiện. */
export interface SizeVars {
  W?: number;
  H?: number;
  DN?: number;
}

/** Một đoạn thẳng của tim tuyến: giữa 2 điểm gãy polyline (mỗi vertex là ranh giới đốt bắt buộc —
 *  M105 FR4) hoặc giữa 2 mép phụ kiện. */
export interface SegmentInput {
  lengthMm: number;
  /** Đoạn có cung tròn (bulge): FR4 — từ chối chia, giữ nguyên 1 đốt kèm cảnh báo. */
  hasBulge?: boolean;
}

/** Đầu vào chia đốt cho MỘT tuyến (một polyline tim). */
export interface RunSegmentationInput {
  systemId: string;
  itemId: string;
  /** Cỡ đọc từ XData: `"800x400"` hoặc `"DN80"`. */
  size: string;
  sizeKind: SizeKind;
  rules: JointRules;
  segments: readonly SegmentInput[];
  /** Số thứ tự tuyến trong bản vẽ (1-based) — vào tag đốt, 3 chữ số. */
  runIndex: number;
  /** Kỹ sư ghi đè kiểu nối tự chọn (FR1). Phải là một `jointType` mà tuyến có khai. */
  overrideJointType?: string;
}

/** Một đốt chế tạo/lắp đặt. */
export interface PieceResult {
  /** Chỉ số đoạn thẳng chứa đốt (0-based) — dùng để vẽ vạch chia đúng đoạn. */
  segmentIndex: number;
  /** Số thứ tự đốt trong TUYẾN (1-based, chạy liên tục qua mọi đoạn). */
  pieceIndex: number;
  lengthMm: number;
  tag: string;
}

/** Kết quả chia đốt một tuyến. */
export interface RunSegmentationResult {
  systemId: string;
  itemId: string;
  size: string;
  sizeKind: SizeKind;
  sizeVars: SizeVars;
  jointType: string;
  overridden: boolean;
  divideMode: DivideMode;
  maxLenMm: number;
  jointGapMm: number;
  minPieceLenMm: number;
  runIndex: number;
  totalLengthMm: number;
  pieceCount: number;
  /** Σ(nᵢ − 1) trên mọi đoạn — mối tại vertex là ranh giới, không tính mối. */
  jointCount: number;
  pieces: PieceResult[];
  warnings: JointWarning[];
}

/** Một dòng phụ kiện mối nối đã tổng hợp. */
export interface JointHardwareLine {
  item: string;
  unit: string;
  quantity: number;
}

/** Cảnh báo nghiệp vụ — trả slug để 2 engine so khớp được, nhãn tiếng Việt tra ở `NHAN_CANH_BAO`. */
export type JointWarning =
  | "dot_ngan_hon_toi_thieu"
  | "sai_lech_tong_chieu_dai"
  | "doan_cong_khong_chia_duoc"
  | "vuot_nguong_canh_lon";

/** Nhãn tiếng Việt của cảnh báo — cho UI/báo cáo phiên vẽ hiển thị. */
export const NHAN_CANH_BAO: Record<JointWarning, string> = {
  dot_ngan_hon_toi_thieu:
    "Đoạn ngắn hơn đốt tối thiểu — giữ nguyên 1 đốt, kiểm tra khả năng chế tạo",
  sai_lech_tong_chieu_dai: "Tổng chiều dài đốt + khe mối nối lệch khỏi chiều dài đoạn",
  doan_cong_khong_chia_duoc: "Đoạn có cung tròn (bulge) — không chia đốt, giữ nguyên cả đoạn",
  vuot_nguong_canh_lon: "Cạnh lớn vượt ngưỡng của kiểu nối đang chọn",
};

/** Sai số cho phép của bất biến `Σ pieceLen + (n−1)·gap = L` (M105 FR2). */
export const SAI_SO_TONG_CHIEU_DAI_MM = 0.5;

// ============================================================================
// 2. TIỆN ÍCH SỐ HỌC
// ============================================================================

/**
 * Làm tròn tới 0,1 mm theo quy tắc **nửa lên, ra xa 0** (half away from zero).
 * Bản C# PHẢI dùng `Math.Round(x, 1, MidpointRounding.AwayFromZero)` — mặc định của .NET là làm
 * tròn ngân hàng (về số chẵn) nên sẽ lệch ở đúng các ca 0,x5.
 */
function lamTron01(mm: number): number {
  const dau = mm < 0 ? -1 : 1;
  return (dau * Math.round(Math.abs(mm) * 10)) / 10;
}

/** Làm tròn tới 0,001 khi tổng hợp khối lượng phụ kiện (khử nhiễu dấu phẩy động). */
function lamTron001(v: number): number {
  const dau = v < 0 ? -1 : 1;
  return (dau * Math.round(Math.abs(v) * 1000)) / 1000;
}

function laSoHopLe(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ============================================================================
// 3. PARSE CỠ & CHỌN KIỂU NỐI (FR1)
// ============================================================================

const RE_WXH = /^(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)$/;
const RE_DN = /^DN\s*(\d+(?:[.,]\d+)?)$/i;

function doiSo(s: string): number {
  return Number(s.replace(",", "."));
}

/**
 * Parse cỡ ghi trong XData thành bộ biến `W`/`H` hoặc `DN` (mm).
 * Chấp nhận `"800x400"`, `"800X400"`, `"800 x 400"`, `"DN80"`, `"dn 80"`.
 * Trả `null` khi không đọc được (cỡ `custom` lạ — caller cảnh báo rồi bỏ qua tuyến).
 */
export function parseSize(size: string, sizeKind: SizeKind): SizeVars | null {
  const s = (size ?? "").trim();
  if (!s) return null;
  if (sizeKind === "WxH") {
    const m = RE_WXH.exec(s);
    if (!m?.[1] || !m[2]) return null;
    const W = doiSo(m[1]);
    const H = doiSo(m[2]);
    return W > 0 && H > 0 ? { W, H } : null;
  }
  const m = RE_DN.exec(s);
  if (!m?.[1]) return null;
  const DN = doiSo(m[1]);
  return DN > 0 ? { DN } : null;
}

/** Khóa so sánh của bảng `selection`: tuyến `WxH` xét CẠNH LỚN, tuyến `DN` xét số DN. */
function khoaChon(vars: SizeVars, sizeKind: SizeKind): number | null {
  if (sizeKind === "WxH") {
    return laSoHopLe(vars.W) && laSoHopLe(vars.H) ? Math.max(vars.W, vars.H) : null;
  }
  return laSoHopLe(vars.DN) ? vars.DN : null;
}

/** Ngưỡng của một dòng selection theo `sizeKind`; `null`/thiếu = mục bắt hết phần còn lại. */
function nguong(row: JointSelectionRow, sizeKind: SizeKind): number | null {
  const v = sizeKind === "WxH" ? row.maxSideMm : row.maxDn;
  return laSoHopLe(v) ? v : null;
}

/**
 * Chọn kiểu nối TỰ ĐỘNG theo cỡ (FR1): xét `selection` THEO THỨ TỰ, mục đầu tiên khớp thì thắng.
 * Trả `null` khi cỡ không parse được hoặc không mục nào phủ (rule pack khai thiếu mục bắt hết).
 */
export function chonKieuNoi(
  size: string,
  sizeKind: SizeKind,
  selection: readonly JointSelectionRow[],
): JointSelectionRow | null {
  const vars = parseSize(size, sizeKind);
  if (!vars) return null;
  const khoa = khoaChon(vars, sizeKind);
  if (khoa === null) return null;
  for (const row of selection) {
    const nguongRow = nguong(row, sizeKind);
    if (nguongRow === null || khoa <= nguongRow) return row;
  }
  return null;
}

// ============================================================================
// 4. CHIA MỘT ĐOẠN THẲNG (FR2, FR3)
// ============================================================================

export interface SegmentSegmentationResult {
  /** Chiều dài từng đốt (mm), đã làm tròn 0,1 mm; đốt cuối gánh phần dư để tổng khớp đúng. */
  pieces: number[];
  warnings: JointWarning[];
}

/**
 * Chia MỘT đoạn thẳng dài `lengthMm` theo kiểu nối `rule`.
 *
 * - `deu`: `n = ceil(L / (maxLen + gap))`, `pieceLen = (L − (n−1)·gap) / n` (làm tròn 0,1 mm),
 *   đốt cuối nhận phần dư để tổng khớp đúng.
 * - `cay_nguyen`: lặp đốt `maxLen` (mỗi đốt sau đốt đầu tiêu tốn thêm `gap`), đốt cuối là phần dư;
 *   phần dư > 0 nhưng < `minPieceLenMm` thì gộp vào đốt trước rồi chia đôi đều 2 đốt cuối (FR3).
 * - `L < minPieceLenMm` → 1 đốt duy nhất + cảnh báo `dot_ngan_hon_toi_thieu`.
 *
 * Bất biến (tự kiểm, phòng thủ): `Σ pieceLen + (n−1)·gap = L` trong sai số ±0,5 mm.
 */
export function segmentSegment(
  lengthMm: number,
  rule: Pick<JointSelectionRow, "maxLenMm" | "jointGapMm">,
  mode: DivideMode,
  minPieceLenMm: number,
): SegmentSegmentationResult {
  if (!laSoHopLe(lengthMm) || lengthMm <= 0) {
    throw new Error(`Chiều dài đoạn không hợp lệ: ${String(lengthMm)}`);
  }
  if (!laSoHopLe(rule.maxLenMm) || rule.maxLenMm <= 0) {
    throw new Error(`maxLenMm không hợp lệ: ${String(rule.maxLenMm)}`);
  }
  if (!laSoHopLe(rule.jointGapMm) || rule.jointGapMm < 0) {
    throw new Error(`jointGapMm không hợp lệ: ${String(rule.jointGapMm)}`);
  }

  const gap = rule.jointGapMm;
  const warnings: JointWarning[] = [];

  // Đoạn ngắn hơn đốt tối thiểu → giữ nguyên 1 đốt, cảnh báo cho kỹ sư tự quyết (FR3).
  if (laSoHopLe(minPieceLenMm) && lengthMm < minPieceLenMm) {
    return { pieces: [lamTron01(lengthMm)], warnings: ["dot_ngan_hon_toi_thieu"] };
  }

  const pieces =
    mode === "deu"
      ? chiaDeu(lengthMm, rule.maxLenMm, gap)
      : chiaCayNguyen(lengthMm, rule.maxLenMm, gap, minPieceLenMm);

  // Bất biến FR2 — không bao giờ nên vi phạm; có thì rule pack/đầu vào sai, phải lộ ra ngay.
  const tong = pieces.reduce((s, v) => s + v, 0) + (pieces.length - 1) * gap;
  if (Math.abs(tong - lengthMm) > SAI_SO_TONG_CHIEU_DAI_MM) {
    warnings.push("sai_lech_tong_chieu_dai");
  }
  if (minPieceLenMm > 0 && pieces.some((p) => p < minPieceLenMm)) {
    warnings.push("dot_ngan_hon_toi_thieu");
  }

  return { pieces, warnings };
}

/** FR2 — chia đều: mọi đốt bằng nhau, đốt cuối gánh phần dư làm tròn. */
function chiaDeu(lengthMm: number, maxLenMm: number, gap: number): number[] {
  const n = Math.max(1, Math.ceil(lengthMm / (maxLenMm + gap)));
  const huuIch = lengthMm - (n - 1) * gap; // tổng chiều dài tôn/ống thực cắt
  const dot = lamTron01(huuIch / n);
  const pieces: number[] = [];
  for (let i = 0; i < n - 1; i += 1) pieces.push(dot);
  pieces.push(lamTron01(huuIch - dot * (n - 1)));
  return pieces;
}

/** FR2/FR3 — tối đa hóa cây/thanh nguyên, phần dư ở đốt cuối; dư quá ngắn thì dồn 2 đốt cuối. */
function chiaCayNguyen(
  lengthMm: number,
  maxLenMm: number,
  gap: number,
  minPieceLenMm: number,
): number[] {
  const pieces: number[] = [];
  let conLai = lengthMm;
  for (;;) {
    const con = conLai - (pieces.length > 0 ? gap : 0); // đốt sau đốt đầu tốn thêm 1 khe
    if (con <= maxLenMm) {
      pieces.push(lamTron01(con));
      break;
    }
    pieces.push(maxLenMm);
    conLai = con - maxLenMm;
  }

  // Đốt lẻ cuối ngắn hơn đốt tối thiểu → dồn ngược vào đốt trước, chia đều 2 đốt cuối (FR3).
  // `cuoi <= 0` là ca biên: phần dư nhỏ hơn cả khe mối nối (vd L = maxLen + 2 với khe 3) —
  // cũng phải dồn, nếu không sẽ sinh đốt dài 0/âm dù rule pack khai minPieceLenMm = 0.
  const cuoi = pieces[pieces.length - 1];
  const truoc = pieces[pieces.length - 2];
  if (
    pieces.length >= 2 &&
    laSoHopLe(cuoi) &&
    laSoHopLe(truoc) &&
    (cuoi < minPieceLenMm || cuoi <= 0)
  ) {
    const huuIch = truoc + cuoi; // khe giữa 2 đốt vẫn còn nguyên → không cộng/trừ gap
    const nua = lamTron01(huuIch / 2);
    pieces[pieces.length - 2] = nua;
    pieces[pieces.length - 1] = lamTron01(huuIch - nua);
  }
  return pieces;
}

// ============================================================================
// 5. CHIA CẢ TUYẾN (FR4, FR6 — tag đốt)
// ============================================================================

/** Tag đốt `D-<itemId>-<số tuyến 3 chữ số>-<số đốt 2 chữ số>` (FR5). */
export function tagDot(itemId: string, runIndex: number, pieceIndex: number): string {
  return `D-${itemId}-${String(runIndex).padStart(3, "0")}-${String(pieceIndex).padStart(2, "0")}`;
}

/** Layer vạch chia = layer tim + hậu tố (nối thẳng, không dấu phân tách — xem `JointLayerStyle`). */
export function layerVachChia(layerTim: string, layerStyle: JointLayerStyle): string {
  return `${layerTim}${layerStyle.suffix}`;
}

function epDivideMode(v: string): DivideMode {
  if (v === "deu" || v === "cay_nguyen") return v;
  throw new Error(`divideMode không hợp lệ: "${v}" (chỉ nhận "deu" hoặc "cay_nguyen")`);
}

/**
 * Chia đốt cả một tuyến: mỗi đoạn thẳng (giữa 2 vertex polyline) chia ĐỘC LẬP vì mỗi vertex là
 * ranh giới đốt bắt buộc (FR4); số đốt đánh liên tục toàn tuyến để tag không trùng.
 */
export function segmentRunIntoPieces(run: RunSegmentationInput): RunSegmentationResult {
  const { rules } = run;
  const mode = epDivideMode(rules.divideMode);
  const vars = parseSize(run.size, run.sizeKind);
  if (!vars) {
    throw new Error(
      `Không đọc được cỡ "${run.size}" của tuyến ${run.itemId} (sizeKind ${run.sizeKind})`,
    );
  }

  const tuDong = chonKieuNoi(run.size, run.sizeKind, rules.selection);
  if (!tuDong) {
    throw new Error(
      `Bảng selection của tuyến ${run.itemId} không phủ cỡ "${run.size}" — rule pack thiếu mục bắt hết`,
    );
  }

  let rule = tuDong;
  let overridden = false;
  if (run.overrideJointType && run.overrideJointType !== tuDong.jointType) {
    const ghiDe = rules.selection.find((r) => r.jointType === run.overrideJointType);
    if (!ghiDe) {
      throw new Error(
        `Tuyến ${run.itemId} không khai kiểu nối "${run.overrideJointType}" để ghi đè`,
      );
    }
    rule = ghiDe;
    overridden = true;
  }

  const warnings: JointWarning[] = [];
  // FR9 — cạnh lớn vượt ngưỡng của kiểu đang chọn (chỉ xảy ra khi kỹ sư ghi đè tay).
  const khoa = khoaChon(vars, run.sizeKind);
  const nguongRule = nguong(rule, run.sizeKind);
  if (khoa !== null && nguongRule !== null && khoa > nguongRule) {
    warnings.push("vuot_nguong_canh_lon");
  }

  const pieces: PieceResult[] = [];
  let jointCount = 0;
  let totalLengthMm = 0;
  let pieceIndex = 0;

  run.segments.forEach((seg, segmentIndex) => {
    totalLengthMm += seg.lengthMm;
    let lenPieces: number[];
    if (seg.hasBulge) {
      // FR4 — đoạn cung tròn: từ chối chia, giữ nguyên cả đoạn làm 1 đốt kèm cảnh báo.
      lenPieces = [lamTron01(seg.lengthMm)];
      warnings.push("doan_cong_khong_chia_duoc");
    } else {
      const kq = segmentSegment(seg.lengthMm, rule, mode, rules.minPieceLenMm);
      lenPieces = kq.pieces;
      warnings.push(...kq.warnings);
    }
    jointCount += lenPieces.length - 1;
    for (const lengthMm of lenPieces) {
      pieceIndex += 1;
      pieces.push({
        segmentIndex,
        pieceIndex,
        lengthMm,
        tag: tagDot(run.itemId, run.runIndex, pieceIndex),
      });
    }
  });

  return {
    systemId: run.systemId,
    itemId: run.itemId,
    size: run.size,
    sizeKind: run.sizeKind,
    sizeVars: vars,
    jointType: rule.jointType,
    overridden,
    divideMode: mode,
    maxLenMm: rule.maxLenMm,
    jointGapMm: rule.jointGapMm,
    minPieceLenMm: rules.minPieceLenMm,
    runIndex: run.runIndex,
    totalLengthMm: lamTron01(totalLengthMm),
    pieceCount: pieces.length,
    jointCount,
    pieces,
    // Gộp trùng, giữ thứ tự xuất hiện — 2 engine so khớp danh sách slug cho gọn.
    warnings: [...new Set(warnings)],
  };
}

// ============================================================================
// 6. BIỂU THỨC ĐỊNH MỨC & PHỤ KIỆN MỐI NỐI (FR7)
// ============================================================================

type Token =
  | { t: "so"; v: number }
  | { t: "ten"; v: string }
  | { t: "dau"; v: "+" | "-" | "*" | "/" | "(" | ")" };

const TEN_BIEN = ["W", "H", "DN"] as const;

function tachToken(bt: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < bt.length) {
    const c = bt[i] as string;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < bt.length && /[0-9.]/.test(bt[j] as string)) j += 1;
      const raw = bt.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v))
        throw new Error(`Số không hợp lệ trong biểu thức định mức: "${raw}"`);
      out.push({ t: "so", v });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < bt.length && /[A-Za-z]/.test(bt[j] as string)) j += 1;
      out.push({ t: "ten", v: bt.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "(" || c === ")") {
      out.push({ t: "dau", v: c });
      i += 1;
      continue;
    }
    throw new Error(`Ký tự không hợp lệ trong biểu thức định mức: "${c}"`);
  }
  return out;
}

/**
 * Tính biểu thức định mức mini (FR7) bằng bộ phân tích đệ quy tự viết — **không** dùng
 * `eval`/`new Function`. Ngữ pháp chỉ chấp nhận: số thập phân, biến `W`/`H`/`DN` (mm), 4 phép
 * `+ - * /`, dấu ngoặc và hàm `ceil()`. Mọi thứ khác → ném lỗi tiếng Việt.
 */
export function tinhBieuThucDinhMuc(bieuThuc: string, vars: SizeVars): number {
  const tokens = tachToken(bieuThuc);
  if (tokens.length === 0) throw new Error("Biểu thức định mức rỗng");
  let pos = 0;

  const xem = (): Token | undefined => tokens[pos];
  const anDau = (v: string): boolean => {
    const tk = xem();
    if (tk?.t === "dau" && tk.v === v) {
      pos += 1;
      return true;
    }
    return false;
  };

  // expr := term (('+' | '-') term)*
  const doiExpr = (): number => {
    let v = doiTerm();
    for (;;) {
      if (anDau("+")) v += doiTerm();
      else if (anDau("-")) v -= doiTerm();
      else return v;
    }
  };

  // term := factor (('*' | '/') factor)*
  const doiTerm = (): number => {
    let v = doiFactor();
    for (;;) {
      if (anDau("*")) {
        v *= doiFactor();
      } else if (anDau("/")) {
        const mau = doiFactor();
        if (mau === 0) throw new Error(`Biểu thức định mức chia cho 0: "${bieuThuc}"`);
        v /= mau;
      } else {
        return v;
      }
    }
  };

  // factor := ('+' | '-')? primary
  const doiFactor = (): number => {
    if (anDau("-")) return -doiFactor();
    if (anDau("+")) return doiFactor();
    return doiPrimary();
  };

  // primary := SỐ | BIẾN | 'ceil' '(' expr ')' | '(' expr ')'
  const doiPrimary = (): number => {
    const tk = xem();
    if (!tk) throw new Error(`Biểu thức định mức thiếu vế: "${bieuThuc}"`);
    if (tk.t === "so") {
      pos += 1;
      return tk.v;
    }
    if (tk.t === "ten") {
      pos += 1;
      if (tk.v === "ceil") {
        if (!anDau("(")) throw new Error(`Hàm ceil() thiếu dấu mở ngoặc: "${bieuThuc}"`);
        const v = doiExpr();
        if (!anDau(")")) throw new Error(`Hàm ceil() thiếu dấu đóng ngoặc: "${bieuThuc}"`);
        return Math.ceil(v);
      }
      if ((TEN_BIEN as readonly string[]).includes(tk.v)) {
        const v = vars[tk.v as keyof SizeVars];
        if (!laSoHopLe(v)) {
          throw new Error(`Biểu thức định mức dùng biến "${tk.v}" mà cỡ tuyến không có giá trị`);
        }
        return v;
      }
      throw new Error(
        `Biểu thức định mức có tên không hợp lệ: "${tk.v}" (chỉ nhận W, H, DN, ceil)`,
      );
    }
    if (anDau("(")) {
      const v = doiExpr();
      if (!anDau(")")) throw new Error(`Biểu thức định mức thiếu dấu đóng ngoặc: "${bieuThuc}"`);
      return v;
    }
    throw new Error(`Biểu thức định mức sai cú pháp tại "${tk.v}": "${bieuThuc}"`);
  };

  const ketQua = doiExpr();
  if (pos !== tokens.length) {
    throw new Error(`Biểu thức định mức thừa ký tự sau vị trí ${pos}: "${bieuThuc}"`);
  }
  if (!Number.isFinite(ketQua))
    throw new Error(`Biểu thức định mức cho kết quả không hợp lệ: "${bieuThuc}"`);
  return ketQua;
}

/** Suy `sizeKind` khi caller không truyền: chuỗi bắt đầu bằng `DN` là ống, còn lại là `WxH`. */
function suyRaSizeKind(ctx: { size?: string; sizeKind?: SizeKind }): SizeKind {
  if (ctx.sizeKind) return ctx.sizeKind;
  return RE_DN.test((ctx.size ?? "").trim()) ? "DN" : "WxH";
}

/** Trị của một dòng định mức cho MỘT mối nối (số thì lấy thẳng, chuỗi thì tính biểu thức). */
function dinhMucMotMoi(spec: JointHardwareSpec, vars: SizeVars): number {
  if (typeof spec.perJoint === "number") {
    if (!Number.isFinite(spec.perJoint)) {
      throw new Error(`Định mức "${spec.item}" có perJoint không hợp lệ`);
    }
    return spec.perJoint;
  }
  return tinhBieuThucDinhMuc(spec.perJoint, vars);
}

/** Đầu vào tối thiểu để bung phụ kiện: chính là `RunSegmentationResult`, hoặc một dòng bảng đốt
 *  đọc lại từ DB (khi đó chỉ có chuỗi `size`, engine tự parse ra biến `W`/`H`/`DN`). */
export interface JointHardwareContext {
  jointType: string;
  jointCount: number;
  sizeVars?: SizeVars;
  size?: string;
  sizeKind?: SizeKind;
  itemId?: string;
}

/**
 * Bung phụ kiện mối nối của một tuyến (FR7): mỗi mối nối sinh định mức theo `jointType`, tổng hợp
 * theo `item` + `unit`. Đơn vị `"m"` quy đổi mm→m; đơn vị khác (vd `"cái"`) giữ nguyên trị.
 * Tuyến 0 mối nối → không phát sinh phụ kiện.
 */
export function explodeJointHardware(
  runResult: JointHardwareContext,
  hardwareTable: JointHardwareTable,
): JointHardwareLine[] {
  const specs = hardwareTable[runResult.jointType];
  if (!specs) {
    throw new Error(
      `Rule pack thiếu định mức phụ kiện cho kiểu nối "${runResult.jointType}"` +
        (runResult.itemId ? ` (tuyến ${runResult.itemId})` : ""),
    );
  }
  if (runResult.jointCount <= 0) return [];
  const vars = runResult.sizeVars ?? parseSize(runResult.size ?? "", suyRaSizeKind(runResult));
  if (!vars) {
    throw new Error(`Không đọc được cỡ "${runResult.size ?? ""}" để tính định mức phụ kiện`);
  }

  const gop = new Map<string, JointHardwareLine>();
  for (const spec of specs) {
    const moiMoi = dinhMucMotMoi(spec, vars);
    const quyDoi = spec.unit === "m" ? moiMoi / 1000 : moiMoi;
    const khoa = `${spec.item}|${spec.unit}`;
    const cu = gop.get(khoa);
    if (cu) cu.quantity += quyDoi * runResult.jointCount;
    else
      gop.set(khoa, { item: spec.item, unit: spec.unit, quantity: quyDoi * runResult.jointCount });
  }
  return [...gop.values()]
    .map((d) => ({ ...d, quantity: lamTron001(d.quantity) }))
    .sort((a, b) => a.item.localeCompare(b.item) || a.unit.localeCompare(b.unit));
}

// ============================================================================
// 7. ĐỌC THAM SỐ TỪ RULE PACK
// ============================================================================

/** Hình dạng tối thiểu của rule pack mà engine chia đốt cần đọc (v9 trở đi). */
export interface RulePackCoJointRules {
  drawTools: {
    systems: readonly {
      id: string;
      lines: readonly {
        itemId: string;
        layer: string;
        sizeKind: string;
        jointRules?: JointRules;
      }[];
    }[];
  };
}

/** Thông tin tuyến cần cho việc chia đốt, lấy từ rule pack. */
export interface LineJointInfo {
  layer: string;
  sizeKind: SizeKind;
  jointRules: JointRules;
}

/**
 * Đọc tuyến `itemId` của hệ `systemId` trong rule pack (mặc định là rule pack đang phát hành).
 * Trả `null` khi không tìm thấy tuyến, tuyến không khai `jointRules`, hoặc `sizeKind` lạ —
 * caller **bỏ qua tuyến đó kèm thông báo**, không đoán mặc định ngầm (M105 FR/AC10).
 */
export function docTuyenTuRulePack(
  rulePack: RulePackCoJointRules | null | undefined,
  systemId: string,
  itemId: string,
): LineJointInfo | null {
  const pack = rulePack ?? (RULE_PACK_HIEN_HANH as unknown as RulePackCoJointRules);
  const sys = pack.drawTools.systems.find((s) => s.id === systemId);
  const line = sys?.lines.find((l) => l.itemId === itemId);
  if (!line?.jointRules) return null;
  if (line.sizeKind !== "WxH" && line.sizeKind !== "DN") return null;
  return { layer: line.layer, sizeKind: line.sizeKind, jointRules: line.jointRules };
}

/** Như `docTuyenTuRulePack` nhưng chỉ lấy khối `jointRules`. */
export function docJointRulesTuRulePack(
  rulePack: RulePackCoJointRules | null | undefined,
  systemId: string,
  itemId: string,
): JointRules | null {
  return docTuyenTuRulePack(rulePack, systemId, itemId)?.jointRules ?? null;
}
