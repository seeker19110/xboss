// lib/ky-thuat/cad/block-phan-loai-luat.ts — M108 §7 FR3, TẦNG 1: phân loại block bằng LUẬT TẤT
// ĐỊNH, thuần, không mạng, không DB. Đây là tầng chạy được cả khi không có mạng/không có khoá AI
// (M108 FR9) và là số nền để đo phần AI thật sự đóng góp (§15.4).
//
// NGUYÊN TẮC XUYÊN SUỐT — không đoán:
//   • Mọi suy luận đều bắt nguồn từ RULE PACK đang phát hành, không hard-code danh sách tên trong
//     code. Rule pack đổi thì phân loại đổi theo, không phải sửa file này (ADR-0006 nguyên tắc 1).
//   • Không suy được `kind` thì trả `chua_quyet` — TUYỆT ĐỐI không hạ xuống "giá trị gần đúng"
//     (M108 FR6/AC5). `kind` sai làm hỏng cả `drawTools` lẫn bóc tách, mà lỗi chỉ lộ ra lúc vẽ/bóc.
//   • Dùng ĐÚNG bộ matcher token-boundary dùng chung (`hasAnyToken` của `dxf-parser`) — cùng thuật
//     toán mà `layerMap`/`takeoff` đang dùng, để phân loại không bao giờ lệch với lúc bóc thật.
import { type LoaiBlock } from "@/lib/ky-thuat/cad/block-lib";
import { hasAnyToken } from "@/lib/ky-thuat/cad/dxf-parser";
import { getCurrentRulePack, type CadRulePack } from "@/lib/ky-thuat/cad/rule-pack";

/** Nguồn ra quyết định của một dòng — khớp CHECK của cột `nguon_quyet_dinh` (migration 0144). */
export const NGUON_QUYET_DINH = [
  "luat",
  "ngu_nghia",
  "hinh_anh",
  "nguoi_sua",
  "chua_quyet",
] as const;
export type NguonQuyetDinh = (typeof NGUON_QUYET_DINH)[number];

/** Những gì đọc được từ một định nghĩa block, trước khi phân loại. */
export type UngVienBlock = {
  blockName: string;
  /** Layer của định nghĩa block (nếu đọc được) — chỉ dùng để suy HỆ, không bao giờ suy `kind`. */
  layer?: string;
  /** Thẻ ATTDEF có thật trong định nghĩa (đã chữ hoa). */
  attributes?: readonly string[];
};

export type KetQuaPhanLoai = {
  kind: LoaiBlock | null;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  nguon: NguonQuyetDinh;
  /** 0..1 — chỉ có nghĩa với nguồn suy đoán (tầng 2/3). Tầng 1 khớp rule pack là chắc chắn ⇒ null. */
  doTinCay: number | null;
  /** Một dòng tiếng Việt giải thích vì sao — hiện thẳng trên bảng duyệt, không phải log. */
  lyDo: string;
};

/**
 * `kind` suy từ VỊ TRÍ của item trong rule pack, không từ tên block người ngoài đặt:
 *   • id trùng `sheetSetup.titleblockId`           → `titleblock`
 *   • id nằm trong `drawTools.systems[].equipment` → `equipment`
 *   • id nằm trong `drawTools.systems[].fittings`  → `support` / `sleeve` / `fitting`
 *
 * Hai lưu ý về hình dạng thật của rule pack v9:
 *
 * 1. `support`/`sleeve` phải tách khỏi `fitting` vì rule pack xếp chung cả ba vào mảng `fittings`
 *    (`support-duct`, `sleeve-wall` đứng cạnh `elbow-duct`), trong khi `LOAI_BLOCK` phân biệt ba
 *    loại — nên đọc thêm token trong chính id.
 * 2. Có item `measure: "count"` **cố ý KHÔNG** nằm trong `drawTools`: `support-hanger` và
 *    `sleeve-opening` (group `COMMON`) là hai hạng mục ĐẾM giá đỡ/lỗ chờ do `XBOSS_VE_GIADO`/
 *    `_LOCHO` sinh ra (M100 PR7), không phải id block thư viện. Khớp tên vào đây vẫn suy được
 *    `kind` từ token của id — KHÔNG được coi là rule pack thiếu nhất quán.
 *
 * Đây là chỗ duy nhất trong tệp dựa vào chuỗi, và chuỗi đó là id do rule pack đặt.
 */
function kindTheoViTriTrongRulePack(itemId: string, pack: CadRulePack): LoaiBlock | null {
  if (pack.sheetSetup?.titleblockId === itemId) return "titleblock";
  for (const heTho of pack.drawTools?.systems ?? []) {
    // `typeof rulePackV9` suy mảng rỗng trong JSON thành `never[]` (vd hệ chưa khai thiết bị nào)
    // nên phải nới về `readonly string[]` mới so sánh được — nới KIỂU, không nới dữ liệu.
    const he = heTho as { equipment?: readonly string[]; fittings?: readonly string[] };
    if ((he.equipment ?? []).includes(itemId)) return "equipment";
    if ((he.fittings ?? []).includes(itemId)) return kindTheoTokenCuaId(itemId) ?? "fitting";
  }
  // Không nằm trong `drawTools` — vẫn suy được với giá đỡ/lỗ chờ (lưu ý 2 ở trên); còn lại thì
  // chịu, vì `equipment` với `fitting` không phân biệt được nếu chỉ nhìn id.
  return kindTheoTokenCuaId(itemId);
}

/** `support`/`sleeve` đọc từ token trong chính id của item (từ vựng do rule pack đặt). */
function kindTheoTokenCuaId(itemId: string): LoaiBlock | null {
  const id = itemId.toLowerCase();
  if (id.includes("support") || id.includes("hanger") || id.includes("giado")) return "support";
  if (id.includes("sleeve") || id.includes("opening") || id.includes("locho")) return "sleeve";
  return null;
}

/** Hệ (`layerMap.groups[].id`) sở hữu một item bóc tách — `group` của item chính là id hệ. */
function heCuaItem(itemId: string, pack: CadRulePack): string | null {
  const item = pack.takeoff.items.find((i) => i.id === itemId);
  return item?.group ?? null;
}

/**
 * Hệ suy từ tên layer chứa block, qua `layerMap.groups[].matchAny` — chỉ suy được HỆ, không bao
 * giờ suy `kind` (một layer HVAC chứa đủ cả cút, van, thiết bị, giá đỡ).
 */
function heTheoLayer(layer: string | undefined, pack: CadRulePack): string | null {
  if (!layer) return null;
  const l = layer.toUpperCase();
  for (const g of pack.layerMap.groups) {
    const tokens = (g.matchAny ?? []).map((t) => t.toUpperCase());
    if (tokens.length > 0 && hasAnyToken(l, tokens)) return g.id;
  }
  return null;
}

/** Thẻ thuộc tính bắt buộc của khung tên, đọc từ rule pack (không hard-code DU_AN/TI_LE trong code). */
function theKhungTen(pack: CadRulePack): string[] {
  const the = (pack.sheetSetup as { titleblockAttributes?: readonly string[] } | undefined)
    ?.titleblockAttributes;
  return (the ?? []).map((t) => t.toUpperCase());
}

/**
 * TẦNG 1 — phân loại một block ứng viên bằng luật tất định.
 *
 * Thứ tự tín hiệu, mạnh trước, **dừng ngay khi đủ chắc**:
 *   1. Tên block khớp `takeoff.items[].blockNameMatchAny` (item `measure: "count"`) → suy được
 *      cả `takeoffItemId`, `kind` (theo vị trí trong `drawTools`) lẫn hệ. Đây là tín hiệu chắc
 *      nhất vì nó chính là thứ `XBOSS_BOCKL` dùng để đếm block khi bóc thật.
 *   2. Khung tên: tên block khớp `sheetSetup.titleblockId`, hoặc mang đủ thẻ thuộc tính khung tên.
 *   3. Không khớp gì → `chua_quyet`, nhưng vẫn trả hệ suy được từ layer (nếu có) để người duyệt
 *      đỡ phải gõ lại, và để tầng 2/3 (PR2) có điểm tựa.
 */
export function phanLoaiTheoLuat(
  ungVien: UngVienBlock,
  pack: CadRulePack = getCurrentRulePack(),
): KetQuaPhanLoai {
  const ten = ungVien.blockName.toUpperCase();
  const the = (ungVien.attributes ?? []).map((t) => t.toUpperCase());
  const heTuLayer = heTheoLayer(ungVien.layer, pack);

  // (1) Khớp item bóc tách theo tên block — first-match đúng thứ tự khai trong rule pack, cùng
  //     quy ước với `takeoff` lúc bóc thật (M99 §6.5 bước 2).
  for (const item of pack.takeoff.items) {
    if (item.measure !== "count") continue;
    const tokens = (item.blockNameMatchAny ?? []).map((t) => t.toUpperCase());
    if (tokens.length === 0 || !hasAnyToken(ten, tokens)) continue;

    const kind = kindTheoViTriTrongRulePack(item.id, pack);
    if (!kind) {
      // Khớp được hạng mục bóc tách nhưng không suy được LOẠI block: `equipment` và `fitting`
      // không phân biệt nổi nếu item không nằm trong `drawTools`. Trả hạng mục + hệ đã biết cho
      // người duyệt chọn nốt loại — không tự đoán (FR6).
      return {
        kind: null,
        systemId: heCuaItem(item.id, pack) ?? heTuLayer,
        takeoffItemId: item.id,
        paperSize: null,
        nguon: "chua_quyet",
        doTinCay: null,
        lyDo:
          `Tên khớp hạng mục bóc tách "${item.id}" (rule pack ${pack.version}) nên đã suy được hạng ` +
          `mục và hệ, nhưng chưa suy được LOẠI block — chọn loại giúp.`,
      };
    }
    return {
      kind,
      systemId: heCuaItem(item.id, pack) ?? heTuLayer,
      takeoffItemId: item.id,
      paperSize: null,
      nguon: "luat",
      doTinCay: null,
      lyDo:
        `Tên block khớp "blockNameMatchAny" của hạng mục bóc tách "${item.id}" ` +
        `(rule pack ${pack.version}) — cùng luật mà XBOSS_BOCKL dùng để đếm.`,
    };
  }

  // (2) Khung tên — không thuộc hệ nào và không đếm khối lượng.
  const idKhungTen = pack.sheetSetup?.titleblockId;
  const theCanCo = theKhungTen(pack);
  const duTheKhungTen = theCanCo.length > 0 && theCanCo.every((t) => the.includes(t));
  if ((idKhungTen && hasAnyToken(ten, [idKhungTen.toUpperCase()])) || duTheKhungTen) {
    return {
      kind: "titleblock",
      systemId: null,
      takeoffItemId: null,
      // Khổ giấy KHÔNG suy được từ tên/thuộc tính — người duyệt phải khai (kiemThuocTinhTheoLoai
      // sẽ chặn nếu để trống). Không đoán "A1" chỉ vì rule pack đang đặt khung tên mặc định là A1.
      paperSize: null,
      nguon: "luat",
      doTinCay: null,
      lyDo: duTheKhungTen
        ? `Mang đủ thẻ thuộc tính khung tên (${theCanCo.join(", ")}) theo rule pack ${pack.version}.`
        : `Tên block khớp "sheetSetup.titleblockId" (${idKhungTen}) của rule pack ${pack.version}.`,
    };
  }

  // (3) Không đủ căn cứ — trả thẳng, không đoán.
  return {
    kind: null,
    systemId: heTuLayer,
    takeoffItemId: null,
    paperSize: null,
    nguon: "chua_quyet",
    doTinCay: null,
    lyDo: heTuLayer
      ? `Tên block không khớp luật nào của rule pack ${pack.version}; chỉ suy được hệ "${heTuLayer}" từ layer "${ungVien.layer}".`
      : `Tên block không khớp luật nào của rule pack ${pack.version} và layer cũng không cho biết hệ.`,
  };
}

/** Phân loại cả lô. Thuần, không I/O — thứ tự kết quả giữ đúng thứ tự đầu vào. */
export function phanLoaiLoTheoLuat(
  ungViens: readonly UngVienBlock[],
  pack: CadRulePack = getCurrentRulePack(),
): KetQuaPhanLoai[] {
  return ungViens.map((u) => phanLoaiTheoLuat(u, pack));
}

/** Số liệu để đo AC3 — bao nhiêu dòng tầng 1 quyết được, bao nhiêu còn treo cho tầng 2/3. */
export function thongKePhanLoai(ketQua: readonly KetQuaPhanLoai[]): {
  tong: number;
  quyetDuoc: number;
  chuaQuyet: number;
} {
  const quyetDuoc = ketQua.filter((k) => k.kind !== null).length;
  return { tong: ketQua.length, quyetDuoc, chuaQuyet: ketQua.length - quyetDuoc };
}
