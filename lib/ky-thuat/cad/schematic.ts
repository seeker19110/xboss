// lib/ky-thuat/cad/schematic.ts — M117 PR1, TẦNG 1: đọc bản vẽ SƠ ĐỒ NGUYÊN LÝ (schematic) thành
// ĐỒ THỊ KẾT NỐI bằng luật tất định (M117 §6 bước 2, §7 FR2, §8 AC1).
//
// Module này THUẦN: không mạng, không DB, không AI — chạy được cả khi thiếu `ANTHROPIC_API_KEY`
// (guardrail M117 §2c). Thư viện block truyền vào dưới dạng DỮ LIỆU (`BlockManifestEntry[]`),
// người gọi tự nạp bằng khối `block-lib` của `lib/ky-thuat/cad/block.ts` — đúng ba dòng mà
// `app/api/engineering/cad/block-lib/route.ts` đang dùng:
//
//   const toanCuc = await layBlockLibHienHanh();
//   const cuaDuAn = await withProjectScope(projectId, () => layBlockLibHienHanh(projectId));
//   const thuVien = tronThuVienBlock(toanCuc, cuaDuAn);
//
// Vì sao không tự nạp trong này: nạp thư viện là việc CÓ ngữ cảnh dự án (RLS/`withProjectScope`)
// — nhét vào đây thì tầng 1 hết thuần, test phải dựng DB, mà luật đọc hình học thì chẳng cần
// dòng DB nào. Route/dịch vụ của PR2 nạp một lần rồi truyền vào.
//
// NGUYÊN TẮC XUYÊN SUỐT — KHÔNG ĐOÁN (kế thừa nguyên văn tầng 1 của M108):
//   • Suy được chắc chắn từ hình học + thư viện block ⇒ `nguon = "luat"`.
//   • Mơ hồ (block lạ, chữ không khớp mẫu size, chữ nằm giữa hai cạnh, nhánh đứt) ⇒
//     `nguon = "chua_quyet"` kèm `thieu`/`lyDo` để tầng 2 (AI) và người duyệt biết phải bù gì.
//   • Tầng 1 KHÔNG bịa nút, KHÔNG nối hộ nhánh đứt, KHÔNG suy hướng dòng chảy (hướng do kỹ sư
//     chỉ điểm nguồn ở PR4) — `from`/`to` chỉ là thứ tự ổn định để so sánh/hiển thị.
//   • `doTinCay` luôn `null` ở tầng 1: khớp luật là chắc chắn, không phải xác suất (giống
//     `KetQuaPhanLoai` của khối `block-phan-loai-luat`).

import { parseDxf, type DxfEntityRaw } from "@/lib/ky-thuat/cad/dxf-parser";
import type { BlockManifestEntry, LoaiBlock, NguonQuyetDinh } from "@/lib/ky-thuat/cad/block";

// ── Hình dạng dữ liệu (hợp đồng JSONB cột `cad_schematic_graphs.graph`, M117 §9) ─────────────

/** Phiên bản hình dạng JSONB. Đọc graph có version lạ ⇒ không đoán, báo lỗi (PR2/PR3). */
export const PHIEN_BAN_GRAPH = 1;

/**
 * Vai trò của một nút trong sơ đồ:
 *   • `thiet_bi` — một khối (INSERT) trên schematic: máy, van, phụ kiện…
 *   • `nut_re`   — điểm rẽ nhánh hình học (từ 3 nhánh trở lên gặp nhau), không có khối nào.
 *   • `dau_ho`   — đầu dây cụt: nhánh đứt/vẽ hụt, không chạm thiết bị nào (M117 §6 "nhánh đứt").
 */
export const LOAI_NUT = ["thiet_bi", "nut_re", "dau_ho"] as const;
export type LoaiNut = (typeof LOAI_NUT)[number];

/** Thứ còn thiếu ở một cạnh — đây chính là phần việc tầng 2/người duyệt phải bù. */
export const THIEU_SOT = ["size", "noi"] as const;
export type ThieuSot = (typeof THIEU_SOT)[number];

export type NutSchematic = {
  /** `n1`, `n2`… — ổn định giữa hai lần chạy trên cùng tệp (sắp theo toạ độ). */
  id: string;
  loai: LoaiNut;
  /** Loại block theo thư viện — `null` khi chưa quyết được (block lạ / nút hình học). */
  kind: LoaiBlock | null;
  blockName: string | null;
  tag: string | null;
  /** Hệ sở hữu block theo thư viện (`BlockManifestEntry.system`). */
  systemId: string | null;
  /** Toạ độ trên schematic (đơn vị bản vẽ) — để vẽ SVG sơ hoạ ở màn duyệt và đối chiếu chữ. */
  x: number;
  y: number;
  nguon: NguonQuyetDinh;
  doTinCay: number | null;
  /** Một dòng tiếng Việt giải thích vì sao — hiện thẳng trên bảng duyệt, không phải log. */
  lyDo: string;
  /**
   * TUỲ CHỌN (M117 §6 bước 3, thêm ở PR2 — không phá hình dạng version 1): AI có điền nút này với
   * `doTinCay` dưới ngưỡng không. `true` ⇒ màn duyệt phải bắt người xem lại, không tick sẵn.
   */
  canNguoiXem?: boolean;
};

export type CanhSchematic = {
  /** `e1`, `e2`… — ổn định giữa hai lần chạy trên cùng tệp. */
  id: string;
  from: string;
  to: string;
  /** Kích thước đọc từ chữ gần cạnh, đã chuẩn hoá (`600x300`, `DN100`, `Ø32`); `null` = chưa đọc được. */
  size: string | null;
  nguon: NguonQuyetDinh;
  doTinCay: number | null;
  thieu: ThieuSot[];
  /** Đường gấp khúc thật của cạnh trên schematic — vẽ SVG (PR3) và đo khoảng cách tới chữ. */
  diem: Array<[number, number]>;
  lyDo: string;
  /** TUỲ CHỌN (PR2): AI điền với độ tin cậy dưới ngưỡng ⇒ cần người xem lại. */
  canNguoiXem?: boolean;
};

/**
 * TUỲ CHỌN (PR2, M117 §6 bước 3): đề xuất NỐI hai đầu hở do AI đưa ra. Cố ý KHÔNG sinh cạnh mới:
 * AI không được vẽ hình học — người duyệt xem đề xuất rồi tự chấp nhận ở màn duyệt (PR3).
 */
export type GoiYNoiSchematic = {
  tu: string;
  den: string;
  doTinCay: number;
  lyDo: string;
};

export type ThongKeGraph = {
  tongNut: number;
  tongCanh: number;
  thietBi: number;
  nutRe: number;
  dauHo: number;
  nutChuaQuyet: number;
  canhChuaQuyet: number;
  canhCoSize: number;
};

export type GraphSchematic = {
  version: number;
  nodes: NutSchematic[];
  edges: CanhSchematic[];
  thongKe: ThongKeGraph;
  /** Ghi chú tiếng Việt về những gì tầng 1 cố ý bỏ qua — hiện cho người duyệt, không nuốt im lặng. */
  canhBao: string[];
  /** TUỲ CHỌN (PR2): đề xuất nối đầu hở của tầng 2 — chưa phải cạnh, chờ người duyệt. */
  goiYNoi?: GoiYNoiSchematic[];
};

// ── Tham số heuristic (tham số hoá theo yêu cầu M117 PR1) ────────────────────────────────────

/**
 * Mọi ngưỡng khoảng cách tính theo **đơn vị bản vẽ** của chính tệp schematic (thường là mm).
 * Mặc định đặt cho schematic vẽ theo mm ở tỷ lệ thường gặp; bản vẽ dùng đơn vị khác (m, inch)
 * thì người gọi truyền tham số riêng — module không tự suy đơn vị từ `$INSUNITS` (suy sai một lần
 * là hỏng toàn bộ đồ thị, còn truyền tay thì kỹ sư kiểm được trên màn duyệt).
 */
export type ThamSoSchematic = {
  /** Dung sai gộp hai điểm thành MỘT nút (đầu dây vẽ hụt/chồng vài đơn vị vẫn coi là chạm nhau). */
  dungSaiNut: number;
  /** Bán kính bắt thiết bị: đầu dây nằm trong bán kính này quanh tâm khối ⇒ nối vào khối đó. */
  banKinhChamBlock: number;
  /** Khoảng cách tối đa từ chữ tới cạnh để nhận chữ đó là nhãn size của cạnh. */
  nguongTextCanh: number;
  /** Khoảng cách tối đa từ chữ tới tâm khối để nhận chữ đó là tag của thiết bị. */
  nguongTextTag: number;
  /**
   * Hệ số phân định nhập nhằng: ứng viên gần NHÌ phải xa hơn ứng viên gần nhất ít nhất bấy nhiêu
   * lần thì mới dám chọn. Không đạt ⇒ bỏ, để `chua_quyet` (chữ nằm giữa hai ống song song là ca
   * kinh điển làm đọc sai size).
   */
  heSoNhapNhang: number;
  /** Thẻ ATTRIB được coi là tag thiết bị, xét theo đúng thứ tự này (không phân biệt hoa thường). */
  theTag: readonly string[];
};

export const THAM_SO_MAC_DINH: ThamSoSchematic = {
  dungSaiNut: 20,
  banKinhChamBlock: 300,
  nguongTextCanh: 500,
  nguongTextTag: 400,
  heSoNhapNhang: 1.5,
  theTag: ["TAG", "KY_HIEU", "KYHIEU", "MA_THIET_BI"],
};

/**
 * Loại block KHÔNG bao giờ là một mắt xích của sơ đồ nguyên lý: khung tên và ký hiệu chú thích
 * (mũi tên, tam giác revision…). Bỏ khỏi đồ thị để không đẻ nút rác cạnh khung tên.
 */
const KIND_NGOAI_MANG: ReadonlySet<LoaiBlock> = new Set<LoaiBlock>(["titleblock", "annotation"]);

// ── Đọc chữ: size và tag ─────────────────────────────────────────────────────────────────────

/** Ống chữ nhật: `600x300`, `600 X 300`, `600×300`. */
const RX_SIZE_CHU_NHAT = /(\d{2,5})\s*[x×]\s*(\d{2,5})/i;
/**
 * Ống tròn: `DN100`, `Ø150`, `PHI 50`, `D 32` (`%%c` đã được `decodeCadText` đổi thành `Ø`).
 *
 * Hai lớp chống đọc nhầm mã hiệu thiết bị thành size:
 *   • tiền tố phải đứng đầu từ (không dính chữ/số phía trước) — `AHU-01` không có cửa;
 *   • riêng tiền tố trần `D` đòi ÍT NHẤT 2 chữ số, vì `AHU-D2`/`P-D3` là ký hiệu vị trí chứ không
 *     phải đường kính (ống DN dưới 10mm không tồn tại trong MEPF).
 */
const RX_SIZE_TRON = /(?<![\p{L}\p{N}])(?:(DN|PHI|%%C|Ø)\s*(\d{1,4})|D\s*(\d{2,4}))(?!\d)/iu;
/**
 * Tag thiết bị: `AHU-01`, `FCU-2-05`, `P_01`, `CH 1`. Một chữ cái thì bắt buộc có dấu phân cách
 * (`P-01`) để không nhận nhầm `D100` — dù thứ tự xử lý đã đọc size trước, hàm này còn được dùng
 * riêng nên phải tự đứng vững.
 */
const RX_TAG = /^(?:\p{Lu}{2,8}[-_ ]?|\p{Lu}[-_ ])\d{1,3}(?:[-.]\d{1,3})*$/u;

/**
 * Đọc kích thước từ một dòng chữ, trả chuỗi đã CHUẨN HOÁ (`600x300` / `DN100` / `Ø32`) hoặc
 * `null` khi dòng chữ không mang size. Ống chữ nhật xét trước vì `600x300` cũng chứa cụm số có
 * thể lọt mẫu ống tròn.
 *
 * Chuẩn hoá cố ý KHÔNG đổi `Ø` thành `DN` (và ngược lại): đường kính ngoài và đường kính danh
 * nghĩa là hai đại lượng khác nhau — đổi hộ là bịa dữ liệu kỹ thuật.
 */
export function docSizeTuChu(chu: string): string | null {
  const s = chu.trim();
  if (!s) return null;
  const cn = RX_SIZE_CHU_NHAT.exec(s);
  if (cn) return `${Number(cn[1])}x${Number(cn[2])}`;
  const tron = RX_SIZE_TRON.exec(s);
  if (!tron) return null;
  const tienTo = (tron[1] ?? "").toUpperCase() === "DN" ? "DN" : "Ø";
  return `${tienTo}${Number(tron[2] ?? tron[3])}`;
}

/** Dòng chữ có đúng dạng tag thiết bị không (đã loại chữ mang size trước khi gọi). */
export function laTagThietBi(chu: string): boolean {
  return RX_TAG.test(chu.trim().toUpperCase());
}

// ── Hình học phẳng (schematic là bản vẽ 2D — mọi phép tính bỏ cao độ z) ──────────────────────

type Diem = { x: number; y: number };

function khoangCach(a: Diem, b: Diem): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Khoảng cách từ điểm tới ĐOẠN thẳng, kèm tham số chiếu `t` (0 = đầu A, 1 = đầu B). */
function chieuLenDoan(p: Diem, a: Diem, b: Diem): { d: number; t: number; diem: Diem } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return { d: khoangCach(p, a), t: 0, diem: a };
  const tTho = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  const t = Math.min(1, Math.max(0, tTho));
  const diem = { x: a.x + t * vx, y: a.y + t * vy };
  return { d: khoangCach(p, diem), t, diem };
}

/** Khoảng cách từ điểm tới một đường gấp khúc. */
function khoangCachToiDuong(p: Diem, duong: readonly Diem[]): number {
  let min = Infinity;
  for (let i = 0; i + 1 < duong.length; i++) {
    const d = chieuLenDoan(p, duong[i], duong[i + 1]).d;
    if (d < min) min = d;
  }
  return min;
}

/**
 * Gộp các điểm nằm trong dung sai thành MỘT nút, dùng lưới ô vuông để không phải so từng cặp
 * (schematic 500 nút vẫn phải chạy dưới 5s — NFR M117 §7).
 */
class GomDiem {
  readonly diem: Diem[] = [];
  private readonly luoi = new Map<string, number[]>();
  private readonly canhO: number;

  constructor(private readonly dungSai: number) {
    this.canhO = Math.max(dungSai, 1e-9);
  }

  /** Trả chỉ số của nút đại diện (tạo mới nếu chưa có nút nào trong dung sai). */
  them(p: Diem): number {
    const cx = Math.floor(p.x / this.canhO);
    const cy = Math.floor(p.y / this.canhO);
    let tot = -1;
    let gan = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const i of this.luoi.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const d = khoangCach(this.diem[i], p);
          if (d <= this.dungSai && d < gan) {
            gan = d;
            tot = i;
          }
        }
      }
    }
    if (tot >= 0) return tot;
    const id = this.diem.push({ x: p.x, y: p.y }) - 1;
    const khoa = `${cx}:${cy}`;
    const o = this.luoi.get(khoa);
    if (o) o.push(id);
    else this.luoi.set(khoa, [id]);
    return id;
  }
}

/**
 * Chọn ứng viên gần nhất trong danh sách khoảng cách, áp luật nhập nhằng: gần nhì phải xa hơn
 * gần nhất ít nhất `heSo` lần. Không đạt ⇒ `null` (không đoán).
 */
function chonGanNhat<T>(
  ungVien: ReadonlyArray<{ item: T; d: number }>,
  nguong: number,
  heSo: number,
): T | null {
  const trong = ungVien.filter((u) => u.d <= nguong).sort((a, b) => a.d - b.d);
  if (trong.length === 0) return null;
  if (trong.length > 1 && trong[1].d < trong[0].d * heSo) return null;
  return trong[0].item;
}

// ── Đọc thực thể DXF ─────────────────────────────────────────────────────────────────────────

/** Loại thực thể được coi là "dây nối" trên schematic — chỉ đoạn thẳng, đúng nguyên tắc không đoán. */
const LOAI_DAY = new Set<DxfEntityRaw["type"]>(["LINE", "LWPOLYLINE", "POLYLINE"]);
/** Loại thực thể cong: tầng 1 không dựng lại đường cong, chỉ đếm để cảnh báo. */
const LOAI_CONG = new Set<DxfEntityRaw["type"]>(["ARC", "SPLINE", "ELLIPSE", "CIRCLE"]);

function diem2d(p: readonly number[] | undefined): Diem | null {
  if (!p || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return { x: p[0], y: p[1] };
}

/** Điểm chèn của khối / chữ (mã 10/20, đã tính canh lề của TEXT trong `dxf-parser`). */
function diemChen(e: DxfEntityRaw): Diem | null {
  return diem2d(e.coordinates.center) ?? diem2d(e.coordinates.start);
}

/** Đường gấp khúc của một thực thể dây nối; `null` khi không đủ 2 đỉnh. */
function duongCuaDay(e: DxfEntityRaw): Diem[] | null {
  if (e.type === "LINE") {
    const a = diem2d(e.coordinates.start);
    const b = diem2d(e.coordinates.end);
    return a && b ? [a, b] : null;
  }
  const dinh = (e.coordinates.points ?? [])
    .map((p) => diem2d(p))
    .filter((p): p is Diem => p !== null);
  if (e.coordinates.closed && dinh.length > 2) dinh.push(dinh[0]);
  return dinh.length >= 2 ? dinh : null;
}

// ── Tầng 1: dựng graph ───────────────────────────────────────────────────────────────────────

type ThietBi = {
  chiSo: number;
  blockName: string;
  tam: Diem;
  entry: BlockManifestEntry | null;
  tagAttrib: string | null;
};

/**
 * TẦNG 1 — dựng đồ thị kết nối từ một tệp DXF schematic bằng luật tất định.
 *
 * Các bước (mỗi bước chỉ dùng dữ liệu chắc chắn của bước trước):
 *   1. Đọc DXF (`parseDxf` — không nhân đôi bộ đọc), bỏ thực thể không gian giấy và thực thể ẩn.
 *   2. Gộp đỉnh của LINE/POLYLINE trong `dungSaiNut` thành các điểm chung.
 *   3. Cắt đoạn tại chỗ đầu dây khác chạm vào GIỮA đoạn (mối nối chữ T) và tại chỗ khối nằm
 *      ngay trên đường (van/damper vẽ đè lên ống).
 *   4. Gắn điểm vào thiết bị theo `banKinhChamBlock`.
 *   5. Rút gọn chuỗi điểm bậc 2 thành CẠNH giữa hai mốc (thiết bị / nút rẽ / đầu hở).
 *   6. Đọc size cho cạnh và tag cho thiết bị từ chữ ở gần, có luật chống nhập nhằng.
 *
 * @param dxf tệp DXF (chuỗi hoặc buffer — cùng kiểu đầu vào của `parseDxf`)
 * @param thuVien các mục thư viện block hiện hành (toàn cục đã trộn bộ của dự án)
 */
export function dungGraphSchematic(
  dxf: Parameters<typeof parseDxf>[0],
  thuVien: readonly BlockManifestEntry[] = [],
  thamSoTuyChon: Partial<ThamSoSchematic> = {},
): GraphSchematic {
  const ts: ThamSoSchematic = { ...THAM_SO_MAC_DINH, ...thamSoTuyChon };
  const canhBao: string[] = [];

  const kq = parseDxf(dxf);
  const ents = kq.entities.filter((e) => !e.isPaperSpace && !e.isInvisible);
  if (ents.length === 0) {
    canhBao.push("Không đọc được thực thể nào trong tệp — kiểm tra lại tệp DXF.");
    return graphRong(canhBao);
  }

  // (1) Thiết bị: mỗi INSERT là một ứng viên nút, đối chiếu thư viện block theo TÊN BLOCK
  //     (AutoCAD không phân biệt hoa thường nên khớp theo chữ hoa).
  const theoTen = new Map(thuVien.map((b) => [b.blockName.trim().toUpperCase(), b] as const));
  const thietBis: ThietBi[] = [];
  let soNgoaiMang = 0;
  for (const e of ents) {
    if (e.type !== "INSERT" || !e.blockName) continue;
    const tam = diemChen(e);
    if (!tam) continue;
    const entry = theoTen.get(e.blockName.trim().toUpperCase()) ?? null;
    if (entry && KIND_NGOAI_MANG.has(entry.kind)) {
      soNgoaiMang++;
      continue;
    }
    thietBis.push({
      chiSo: thietBis.length,
      blockName: e.blockName,
      tam,
      entry,
      tagAttrib: tagTuAttrib(e.attributes, ts.theTag),
    });
  }
  if (soNgoaiMang > 0) {
    canhBao.push(
      `Bỏ qua ${soNgoaiMang} khối khung tên/ký hiệu chú thích — không phải mắt xích của sơ đồ.`,
    );
  }

  // (2) Dây nối → đỉnh gộp → đoạn.
  const gom = new GomDiem(ts.dungSaiNut);
  const doanTho: Array<{ a: number; b: number }> = [];
  let soCong = 0;
  let soCungTron = 0;
  for (const e of ents) {
    if (LOAI_CONG.has(e.type)) soCong++;
    if (!LOAI_DAY.has(e.type)) continue;
    const duong = duongCuaDay(e);
    if (!duong) continue;
    if ((e.coordinates.bulges ?? []).some((b) => b !== 0)) soCungTron++;
    const chiSo = duong.map((p) => gom.them(p));
    for (let i = 0; i + 1 < chiSo.length; i++) {
      if (chiSo[i] !== chiSo[i + 1]) doanTho.push({ a: chiSo[i], b: chiSo[i + 1] });
    }
  }
  if (soCong > 0) {
    canhBao.push(
      `Bỏ qua ${soCong} thực thể cong (ARC/SPLINE/ELLIPSE/CIRCLE) — tầng 1 chỉ dựng cạnh từ đoạn thẳng.`,
    );
  }
  if (soCungTron > 0) {
    canhBao.push(
      `${soCungTron} đa tuyến có đoạn cong (mã 42) được coi như đoạn thẳng nối hai đỉnh — kiểm lại nếu bản vẽ dùng cung để nối.`,
    );
  }
  if (doanTho.length === 0) {
    canhBao.push("Không có đường nối (LINE/POLYLINE) nào — không dựng được cạnh.");
  }

  // (3a) Khối nằm ngay TRÊN đường (van/damper vẽ đè lên ống): chiếu tâm khối xuống đoạn để tách
  //      đoạn tại đó. Dùng dung sai CHẶT (`dungSaiNut`) chứ không phải bán kính bắt thiết bị —
  //      nới rộng ở đây sẽ cắt nhầm ống song song chạy gần thiết bị.
  for (const tb of thietBis) {
    const coDauDayGan = gom.diem.some((p) => khoangCach(p, tb.tam) <= ts.banKinhChamBlock);
    if (coDauDayGan) continue;
    const ungVien = doanTho
      .map((d) => ({ item: d, ...chieuLenDoan(tb.tam, gom.diem[d.a], gom.diem[d.b]) }))
      .filter((u) => u.t > 0 && u.t < 1)
      .map((u) => ({ item: u.diem, d: u.d }));
    const cat = chonGanNhat(ungVien, ts.dungSaiNut, ts.heSoNhapNhang);
    if (cat) gom.them(cat);
  }

  // (3b) Cắt đoạn tại mọi điểm nằm giữa nó (mối nối chữ T + điểm chiếu ở bước 3a).
  const doan = catDoanTaiDiemGiua(doanTho, gom.diem, ts.dungSaiNut);

  // (4) Gắn điểm vào thiết bị. Một điểm chỉ thuộc về MỘT thiết bị; hai thiết bị tranh nhau một
  //     đầu dây (nhập nhằng) thì không gắn ai cả — đầu dây đó thành đầu hở để người duyệt xử lý.
  const dungTrongDoan = new Set<number>();
  for (const d of doan) {
    dungTrongDoan.add(d.a);
    dungTrongDoan.add(d.b);
  }
  const thietBiCuaDiem = new Map<number, number>();
  let soTranhChap = 0;
  for (const i of dungTrongDoan) {
    const p = gom.diem[i];
    const chon = chonGanNhat(
      thietBis.map((tb) => ({ item: tb, d: khoangCach(p, tb.tam) })),
      ts.banKinhChamBlock,
      ts.heSoNhapNhang,
    );
    if (chon) thietBiCuaDiem.set(i, chon.chiSo);
    else if (thietBis.some((tb) => khoangCach(p, tb.tam) <= ts.banKinhChamBlock)) soTranhChap++;
  }
  if (soTranhChap > 0) {
    canhBao.push(
      `${soTranhChap} đầu dây nằm giữa hai thiết bị ở khoảng cách xấp xỉ nhau — để đầu hở, không đoán nối vào thiết bị nào.`,
    );
  }

  // (5) Rút gọn chuỗi điểm bậc 2 thành cạnh giữa các mốc.
  const ke = dungKeCan(doan);
  const laMoc = (i: number) => thietBiCuaDiem.has(i) || (ke.get(i)?.length ?? 0) !== 2;
  const { chuoi, doanBoQua } = rutGonChuoi(doan, ke, laMoc, gom.diem);
  if (doanBoQua > 0) {
    canhBao.push(
      `${doanBoQua} đoạn nằm trong vòng dây khép kín không chạm thiết bị nào — bỏ qua vì không xác định được hai đầu.`,
    );
  }

  // (6) Dựng nút: thiết bị + các mốc hình học có tham gia cạnh.
  const diemLaMoc = new Set<number>();
  for (const c of chuoi) {
    diemLaMoc.add(c.dau);
    diemLaMoc.add(c.cuoi);
  }
  const { nodes, nodeCuaThietBi, nodeCuaDiem } = dungNut(
    thietBis,
    diemLaMoc,
    thietBiCuaDiem,
    ke,
    gom.diem,
  );

  const edges = dungCanh(chuoi, thietBiCuaDiem, nodeCuaThietBi, nodeCuaDiem, nodes);

  // (7) Chữ: size cho cạnh, tag cho thiết bị.
  const chuThichs = ents
    .filter((e) => e.type === "TEXT" || e.type === "MTEXT")
    .map((e) => ({ chu: (e.decodedText ?? e.textValue ?? "").trim(), diem: diemChen(e) }))
    .filter((c): c is { chu: string; diem: Diem } => c.chu !== "" && c.diem !== null);
  const chuConLai = ganSizeChoCanh(edges, chuThichs, ts, canhBao);
  ganTagChoNut(nodes, thietBis, nodeCuaThietBi, chuConLai, ts);

  // (8) Chốt nguồn/lý do của cạnh sau khi đã biết size và hai đầu.
  chotNguonCanh(edges, nodes);

  // Thiết bị "mồ côi": vẫn giữ trong đồ thị (nó CÓ trên bản vẽ) nhưng phải nói rõ cho người duyệt,
  // vì đây thường là dấu hiệu bản vẽ vẽ hụt hoặc ngưỡng bắt thiết bị chưa hợp với tỷ lệ tệp.
  const daNoi = new Set(thietBiCuaDiem.values());
  const moCoi = thietBis.filter((tb) => !daNoi.has(tb.chiSo)).length;
  if (moCoi > 0) {
    canhBao.push(
      `${moCoi} thiết bị không có đường nối nào chạm tới — kiểm tra lại bản vẽ hoặc nới bán kính bắt thiết bị.`,
    );
  }

  return { version: PHIEN_BAN_GRAPH, nodes, edges, thongKe: thongKe(nodes, edges), canhBao };
}

function graphRong(canhBao: string[]): GraphSchematic {
  return {
    version: PHIEN_BAN_GRAPH,
    nodes: [],
    edges: [],
    thongKe: thongKe([], []),
    canhBao,
  };
}

export function thongKe(
  nodes: readonly NutSchematic[],
  edges: readonly CanhSchematic[],
): ThongKeGraph {
  return {
    tongNut: nodes.length,
    tongCanh: edges.length,
    thietBi: nodes.filter((n) => n.loai === "thiet_bi").length,
    nutRe: nodes.filter((n) => n.loai === "nut_re").length,
    dauHo: nodes.filter((n) => n.loai === "dau_ho").length,
    nutChuaQuyet: nodes.filter((n) => n.nguon === "chua_quyet").length,
    canhChuaQuyet: edges.filter((e) => e.nguon === "chua_quyet").length,
    canhCoSize: edges.filter((e) => e.size !== null).length,
  };
}

/**
 * Tag đọc từ ATTRIB của chính khối — nguồn chắc chắn nhất, ưu tiên trước chữ rời gần khối.
 * Chỉ nhận đúng các thẻ khai trong `theTag` (theo thứ tự khai): giá trị ATTRIB khác (MODEL, LUU_LUONG…)
 * không phải mã hiệu thiết bị, lấy bừa là ghi sai tag.
 */
function tagTuAttrib(
  attributes: Record<string, string> | undefined,
  theTag: readonly string[],
): string | null {
  if (!attributes) return null;
  const theoThe = new Map(
    Object.entries(attributes).map(([k, v]) => [k.trim().toUpperCase(), v.trim()] as const),
  );
  for (const the of theTag) {
    const gt = theoThe.get(the.trim().toUpperCase());
    if (gt) return gt;
  }
  return null;
}

/**
 * Cắt các đoạn tại điểm nằm GIỮA chúng (mối nối chữ T: đầu dây này chạm thân dây kia). Không cắt
 * thì hai nhánh chỉ "chạm nhau trên hình" mà rời nhau trên đồ thị — lỗi kinh điển khi đọc schematic.
 */
function catDoanTaiDiemGiua(
  doanTho: ReadonlyArray<{ a: number; b: number }>,
  diem: readonly Diem[],
  dungSai: number,
): Array<{ a: number; b: number }> {
  const ra: Array<{ a: number; b: number }> = [];
  const daCo = new Set<string>();
  for (const d of doanTho) {
    const A = diem[d.a];
    const B = diem[d.b];
    const minX = Math.min(A.x, B.x) - dungSai;
    const maxX = Math.max(A.x, B.x) + dungSai;
    const minY = Math.min(A.y, B.y) - dungSai;
    const maxY = Math.max(A.y, B.y) + dungSai;
    const giua: Array<{ i: number; t: number }> = [];
    for (let i = 0; i < diem.length; i++) {
      if (i === d.a || i === d.b) continue;
      const p = diem[i];
      // Lọc thô bằng khung bao trước khi tính khoảng cách — giữ chi phí ở mức chấp nhận được với
      // bản vẽ vài nghìn đỉnh (NFR: 500 nút < 5s).
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const { d: kc, t } = chieuLenDoan(p, A, B);
      if (kc <= dungSai && t > 0 && t < 1) giua.push({ i, t });
    }
    giua.sort((x, y) => x.t - y.t);
    const chuoi = [d.a, ...giua.map((g) => g.i), d.b];
    for (let i = 0; i + 1 < chuoi.length; i++) {
      const u = chuoi[i];
      const v = chuoi[i + 1];
      if (u === v) continue;
      // Bỏ đoạn trùng (hai dây vẽ chồng nhau) — giữ một bản để bậc của nút phản ánh đúng số nhánh.
      const khoa = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (daCo.has(khoa)) continue;
      daCo.add(khoa);
      ra.push({ a: u, b: v });
    }
  }
  return ra;
}

type KeCan = Map<number, Array<{ khac: number; doan: number }>>;

function dungKeCan(doan: ReadonlyArray<{ a: number; b: number }>): KeCan {
  const ke: KeCan = new Map();
  doan.forEach((d, i) => {
    if (!ke.has(d.a)) ke.set(d.a, []);
    if (!ke.has(d.b)) ke.set(d.b, []);
    ke.get(d.a)!.push({ khac: d.b, doan: i });
    ke.get(d.b)!.push({ khac: d.a, doan: i });
  });
  return ke;
}

/**
 * Nuốt các điểm bậc 2 (điểm gấp khúc thuần tuý) để mỗi CẠNH nối đúng hai mốc có nghĩa: thiết bị,
 * nút rẽ (bậc ≥ 3) hoặc đầu hở (bậc 1).
 */
function rutGonChuoi(
  doan: ReadonlyArray<{ a: number; b: number }>,
  ke: KeCan,
  laMoc: (i: number) => boolean,
  diem: readonly Diem[],
): { chuoi: Array<{ dau: number; cuoi: number; duong: Diem[] }>; doanBoQua: number } {
  const daDi = new Set<number>();
  const chuoi: Array<{ dau: number; cuoi: number; duong: Diem[] }> = [];
  const moc = [...ke.keys()].filter(laMoc).sort((a, b) => sapDiem(diem[a], diem[b]));
  for (const p of moc) {
    for (const canh of ke.get(p) ?? []) {
      if (daDi.has(canh.doan)) continue;
      daDi.add(canh.doan);
      const duong = [diem[p], diem[canh.khac]];
      let hienTai = canh.khac;
      while (!laMoc(hienTai)) {
        const tiep = (ke.get(hienTai) ?? []).find((k) => !daDi.has(k.doan));
        if (!tiep) break;
        daDi.add(tiep.doan);
        hienTai = tiep.khac;
        duong.push(diem[hienTai]);
      }
      if (!laMoc(hienTai)) continue; // chuỗi cụt bất thường — bỏ, không đoán
      chuoi.push({ dau: p, cuoi: hienTai, duong });
    }
  }
  // Đoạn còn sót = vòng dây khép kín toàn điểm bậc 2 (không có mốc nào để bắt đầu đi).
  return { chuoi, doanBoQua: doan.length - daDi.size };
}

/** Thứ tự ổn định của điểm/nút: trái→phải, dưới→trên (làm tròn để nhiễu số thực không đảo thứ tự). */
function sapDiem(a: Diem, b: Diem): number {
  const ax = Math.round(a.x * 1000);
  const bx = Math.round(b.x * 1000);
  if (ax !== bx) return ax - bx;
  return Math.round(a.y * 1000) - Math.round(b.y * 1000);
}

function dungNut(
  thietBis: readonly ThietBi[],
  diemLaMoc: ReadonlySet<number>,
  thietBiCuaDiem: ReadonlyMap<number, number>,
  ke: KeCan,
  diem: readonly Diem[],
): {
  nodes: NutSchematic[];
  nodeCuaThietBi: Map<number, string>;
  nodeCuaDiem: Map<number, string>;
} {
  type UngVien =
    | { kieu: "tb"; tb: ThietBi; tam: Diem }
    | { kieu: "diem"; chiSo: number; tam: Diem; bac: number };

  const ungViens: UngVien[] = thietBis.map((tb) => ({ kieu: "tb", tb, tam: tb.tam }));
  for (const i of diemLaMoc) {
    if (thietBiCuaDiem.has(i)) continue;
    ungViens.push({ kieu: "diem", chiSo: i, tam: diem[i], bac: ke.get(i)?.length ?? 0 });
  }
  ungViens.sort((a, b) => sapDiem(a.tam, b.tam));

  const nodes: NutSchematic[] = [];
  const nodeCuaThietBi = new Map<number, string>();
  const nodeCuaDiem = new Map<number, string>();
  ungViens.forEach((u, i) => {
    const id = `n${i + 1}`;
    if (u.kieu === "tb") {
      nodeCuaThietBi.set(u.tb.chiSo, id);
      nodes.push(nutThietBi(id, u.tb));
    } else {
      nodeCuaDiem.set(u.chiSo, id);
      nodes.push(nutHinhHoc(id, u.tam, u.bac));
    }
  });
  return { nodes, nodeCuaThietBi, nodeCuaDiem };
}

function nutThietBi(id: string, tb: ThietBi): NutSchematic {
  const chung = {
    id,
    loai: "thiet_bi" as const,
    blockName: tb.blockName,
    tag: tb.tagAttrib,
    x: tb.tam.x,
    y: tb.tam.y,
    doTinCay: null,
  };
  if (!tb.entry) {
    return {
      ...chung,
      kind: null,
      systemId: null,
      nguon: "chua_quyet",
      lyDo: `Tên khối "${tb.blockName}" không có trong thư viện block hiện hành — chưa biết đây là thiết bị gì.`,
    };
  }
  return {
    ...chung,
    kind: tb.entry.kind,
    systemId: tb.entry.system ?? null,
    nguon: "luat",
    lyDo: `Khớp block "${tb.entry.id}" (${tb.entry.kind}) của thư viện theo đúng tên khối.`,
  };
}

function nutHinhHoc(id: string, tam: Diem, bac: number): NutSchematic {
  const laRe = bac >= 3;
  return {
    id,
    loai: laRe ? "nut_re" : "dau_ho",
    kind: null,
    blockName: null,
    tag: null,
    systemId: null,
    x: tam.x,
    y: tam.y,
    // Nút rẽ là SỰ THẬT hình học (ba nhánh gặp nhau tại một điểm) nên là "luat"; đầu hở thì ngược
    // lại — chưa biết nhánh đó đi đâu, đúng ca "nhánh đứt" tầng 2 phải nối (M117 §6 bước 3).
    nguon: laRe ? "luat" : "chua_quyet",
    doTinCay: null,
    lyDo: laRe
      ? `Điểm rẽ nhánh: ${bac} nhánh gặp nhau tại đây, không có khối nào.`
      : "Đầu dây cụt: không chạm thiết bị và cũng không nối vào nhánh nào khác.",
  };
}

function dungCanh(
  chuoi: ReadonlyArray<{ dau: number; cuoi: number; duong: Diem[] }>,
  thietBiCuaDiem: ReadonlyMap<number, number>,
  nodeCuaThietBi: ReadonlyMap<number, string>,
  nodeCuaDiem: ReadonlyMap<number, string>,
  nodes: readonly NutSchematic[],
): CanhSchematic[] {
  const idNut = (i: number): string | null => {
    const tb = thietBiCuaDiem.get(i);
    if (tb !== undefined) return nodeCuaThietBi.get(tb) ?? null;
    return nodeCuaDiem.get(i) ?? null;
  };
  const soCuaNut = new Map(nodes.map((n, i) => [n.id, i] as const));

  const tho = chuoi
    .map((c) => {
      const a = idNut(c.dau);
      const b = idNut(c.cuoi);
      if (!a || !b || a === b) return null; // vòng về chính nút mình: không mang thông tin nối
      const dao = (soCuaNut.get(a) ?? 0) > (soCuaNut.get(b) ?? 0);
      return {
        from: dao ? b : a,
        to: dao ? a : b,
        duong: dao ? [...c.duong].reverse() : c.duong,
      };
    })
    .filter((c): c is { from: string; to: string; duong: Diem[] } => c !== null)
    .sort((x, y) => {
      const dx = (soCuaNut.get(x.from) ?? 0) - (soCuaNut.get(y.from) ?? 0);
      if (dx !== 0) return dx;
      const dy = (soCuaNut.get(x.to) ?? 0) - (soCuaNut.get(y.to) ?? 0);
      if (dy !== 0) return dy;
      return sapDiem(x.duong[0], y.duong[0]);
    });

  return tho.map((c, i) => ({
    id: `e${i + 1}`,
    from: c.from,
    to: c.to,
    size: null,
    nguon: "luat" as NguonQuyetDinh,
    doTinCay: null,
    thieu: [],
    diem: c.duong.map((p) => [p.x, p.y] as [number, number]),
    lyDo: "",
  }));
}

/**
 * Gán size cho cạnh từ chữ ở gần. Trả về danh sách chữ CHƯA dùng (không mang size) để bước sau
 * xét làm tag thiết bị.
 */
function ganSizeChoCanh(
  edges: CanhSchematic[],
  chuThichs: ReadonlyArray<{ chu: string; diem: Diem }>,
  ts: ThamSoSchematic,
  canhBao: string[],
): Array<{ chu: string; diem: Diem }> {
  const conLai: Array<{ chu: string; diem: Diem }> = [];
  const gan = new Map<string, Set<string>>();
  let soNhapNhang = 0;
  for (const ct of chuThichs) {
    const size = docSizeTuChu(ct.chu);
    if (!size) {
      conLai.push(ct);
      continue;
    }
    const ungVien = edges.map((e) => ({
      item: e,
      d: khoangCachToiDuong(
        ct.diem,
        e.diem.map(([x, y]) => ({ x, y })),
      ),
    }));
    const canh = chonGanNhat(ungVien, ts.nguongTextCanh, ts.heSoNhapNhang);
    if (!canh) {
      if (ungVien.some((u) => u.d <= ts.nguongTextCanh)) soNhapNhang++;
      continue;
    }
    const bo = gan.get(canh.id) ?? new Set<string>();
    bo.add(size);
    gan.set(canh.id, bo);
  }
  if (soNhapNhang > 0) {
    canhBao.push(
      `${soNhapNhang} nhãn kích thước nằm gần từ hai cạnh trở lên ở khoảng cách xấp xỉ nhau — bỏ qua, không đoán gán cho cạnh nào.`,
    );
  }
  for (const e of edges) {
    const bo = gan.get(e.id);
    if (!bo || bo.size === 0) continue;
    if (bo.size > 1) {
      canhBao.push(
        `Cạnh ${e.id} có hai nhãn kích thước mâu thuẫn (${[...bo].join(", ")}) — để trống chờ người duyệt.`,
      );
      continue;
    }
    e.size = [...bo][0];
  }
  return conLai;
}

/** Tag cho thiết bị chưa có ATTRIB: lấy chữ có dạng mã hiệu nằm gần tâm khối nhất. */
function ganTagChoNut(
  nodes: NutSchematic[],
  thietBis: readonly ThietBi[],
  nodeCuaThietBi: ReadonlyMap<number, string>,
  chuThichs: ReadonlyArray<{ chu: string; diem: Diem }>,
  ts: ThamSoSchematic,
): void {
  const theoId = new Map(nodes.map((n) => [n.id, n] as const));
  const canTag = thietBis.filter((tb) => {
    const id = nodeCuaThietBi.get(tb.chiSo);
    return id ? !theoId.get(id)?.tag : false;
  });
  if (canTag.length === 0) return;
  for (const ct of chuThichs) {
    if (!laTagThietBi(ct.chu)) continue;
    const tb = chonGanNhat(
      canTag.map((t) => ({ item: t, d: khoangCach(ct.diem, t.tam) })),
      ts.nguongTextTag,
      ts.heSoNhapNhang,
    );
    if (!tb) continue;
    const id = nodeCuaThietBi.get(tb.chiSo);
    const nut = id ? theoId.get(id) : undefined;
    if (nut && !nut.tag) nut.tag = ct.chu.trim();
  }
}

/**
 * Chốt `nguon`/`thieu`/`lyDo` của cạnh — đây là thứ tầng 2 (AI) và người duyệt nhìn vào:
 *   • thiếu size          ⇒ `chua_quyet` + `thieu: ["size"]` (tầng 2 chỉ được ĐIỀN size);
 *   • một đầu là đầu hở   ⇒ `chua_quyet` + `thieu: ["noi"]` (tầng 2 nối nhánh đứt);
 *   • đủ hai đầu và có size ⇒ `luat`.
 * Tầng 2 KHÔNG được đổi `from`/`to` của cạnh đã có hai đầu — đó là kết quả hình học của tầng 1.
 */
function chotNguonCanh(edges: CanhSchematic[], nodes: readonly NutSchematic[]): void {
  const theoId = new Map(nodes.map((n) => [n.id, n] as const));
  for (const e of edges) {
    const thieu: ThieuSot[] = [];
    const hoHai = [e.from, e.to].filter((id) => theoId.get(id)?.loai === "dau_ho");
    if (hoHai.length > 0) thieu.push("noi");
    if (!e.size) thieu.push("size");
    e.thieu = thieu;
    e.nguon = thieu.length === 0 ? "luat" : "chua_quyet";
    const y: string[] = [
      `Cạnh dựng từ đường nối liên tục giữa ${e.from} và ${e.to} trên schematic.`,
    ];
    if (hoHai.length > 0) y.push(`${hoHai.join(", ")} là đầu dây cụt — chưa biết nối vào đâu.`);
    if (!e.size) y.push("Không có nhãn kích thước nào đủ gần và đúng mẫu để đọc size.");
    else y.push(`Size "${e.size}" đọc từ chữ gần cạnh.`);
    e.lyDo = y.join(" ");
  }
}
