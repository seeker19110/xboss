// lib/dich-vu/cad-goi-y-anh-xa.ts — M108 PR5: hai chỗ GỢI Ý ánh xạ dùng chung cỗ máy ngữ nghĩa của
// tầng 2 (§6.4 và §6.5).
//
// Cùng một bài toán với phân loại block: **khớp hai bảng tên do người khác đặt**.
//   • `layerMap` — hồ sơ TVTK mới về, layer tên lạ → layer chuẩn của rule pack.
//   • `boqCode` per-project — hạng mục bóc tách → mã BOQ trong sổ khối lượng của dự án.
//
// RANH GIỚI KHÔNG ĐƯỢC PHÁ:
//   • Rule pack là dữ liệu PHÁT HÀNH có version. Hàm gợi ý layerMap **chỉ trả JSON để người dán
//     vào rule pack** — không có đường nào ở đây ghi rule pack (M108 §6.4 / AC10).
//   • Gợi ý mã BOQ **không ghi gì**; người duyệt ghi qua đúng `ghiMapBoqTheoDuAn` đang có, và
//     tệp này không SELECT một cột tiền nào (M45 / AC11).
import { z } from "zod";
import { aiKhaDung, hoiCoCauTruc, lyDoAiTat } from "@/lib/nen/ai";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";
import { tapLayerDaChuan } from "@/lib/ky-thuat/cad/dxf-parser";
import { danhSachItemBocTach, layMapBoqTheoDuAn, MAX_DAI_MA_BOQ } from "@/lib/ky-thuat/cad/boq-map";
import { danhMucBoqTheoDuAn, TRAN_DANH_MUC_BOQ } from "@/lib/khoi-luong/boq";

export type GoiY = {
  tu: string;
  den: string | null;
  doTinCay: number;
  lyDo: string;
};

export type KetQuaGoiY = {
  goiY: GoiY[];
  /** Lý do AI không chạy — gợi ý không có tầng tất định thay thế nên danh sách sẽ rỗng. */
  lyDoAiKhongChay: string | null;
};

const SCHEMA = z.object({
  goiY: z.array(
    z.object({
      tu: z.string(),
      den: z.string().nullable(),
      doTinCay: z.number(),
      lyDo: z.string(),
    }),
  ),
});

/** Giữ lại gợi ý mà đích có THẬT trong danh sách cho phép — mã bịa bị loại thẳng. */
function locTheoDanhSach(goiY: readonly GoiY[], hopLe: ReadonlySet<string>): GoiY[] {
  return goiY.map((g) => {
    const den = g.den?.trim() ?? "";
    if (!den || !hopLe.has(den.toUpperCase())) {
      return {
        ...g,
        den: null,
        doTinCay: 0,
        lyDo: `${g.lyDo} (đích "${den}" không có trong danh sách hợp lệ nên đã bỏ)`,
      };
    }
    return { ...g, den, doTinCay: Math.min(1, Math.max(0, g.doTinCay)) };
  });
}

// ── §6.4 — gợi ý layerMap ────────────────────────────────────────────────────

export type KetQuaGoiYLayer = KetQuaGoiY & {
  /** Đoạn JSON để người dán vào rule pack. Máy chủ KHÔNG tự ghi rule pack (AC10). */
  jsonDeDan: string;
};

/**
 * Gợi ý ánh xạ layer lạ → layer chuẩn của rule pack đang phát hành.
 *
 * Chỉ gợi ý; người duyệt sửa rồi tự dán vào rule pack và phát hành theo đường vốn có.
 */
export async function goiYLayerMap(layersLa: readonly string[]): Promise<KetQuaGoiYLayer> {
  const pack = getCurrentRulePack();
  const daChuan = tapLayerDaChuan(pack);
  const dich = [...daChuan].sort();

  // Layer đã đúng chuẩn thì không cần hỏi ai — lọc trước cho rẻ và cho khỏi nhiễu.
  const canHoi = layersLa.map((l) => l.trim()).filter((l) => l && !daChuan.has(l.toUpperCase()));
  if (canHoi.length === 0) {
    return { goiY: [], lyDoAiKhongChay: null, jsonDeDan: "" };
  }
  if (!aiKhaDung()) {
    return { goiY: [], lyDoAiKhongChay: lyDoAiTat(), jsonDeDan: "" };
  }

  const kq = await hoiCoCauTruc({
    nhan: "goi-y-layer-map",
    chiDanOnDinh: [
      "Bạn giúp ánh xạ tên layer AutoCAD của hồ sơ thiết kế (do đơn vị tư vấn khác đặt) về tên layer",
      "CHUẨN của dự án cơ điện (MEPF) này.",
      "",
      "DANH SÁCH LAYER CHUẨN — đích chỉ được chọn trong đây:",
      ...dich.map((d) => `- ${d}`),
      "",
      "QUY TẮC:",
      "1. Tên layer hồ sơ Việt Nam hay viết không dấu: GIO/DUCT = ống gió, CAP/HOI/THAI = cấp/hồi/thải,",
      "   NUOC = ống nước, PCCC/SPK = chữa cháy, DIEN/MANG CAP = điện, KETCAU = kết cấu.",
      "2. Không chắc thì trả den = null. Ánh xạ layer sai làm hỏng cả chuẩn hóa lẫn bóc khối lượng.",
      "3. lyDo viết bằng TIẾNG VIỆT, một câu, nói rõ căn cứ.",
    ].join("\n"),
    noiDungBienThien: `Ánh xạ ${canHoi.length} layer sau:\n${canHoi.map((l) => `- ${l}`).join("\n")}`,
    schema: SCHEMA,
  });

  if (!kq) {
    return {
      goiY: [],
      lyDoAiKhongChay: "Gọi AI không thành công — chưa có gợi ý nào.",
      jsonDeDan: "",
    };
  }
  const goiY = locTheoDanhSach(kq.goiY, daChuan);
  // Đoạn dán: chỉ gồm gợi ý CÓ đích, gom theo layer chuẩn để người sửa rule pack dễ đọc.
  const theoDich = new Map<string, string[]>();
  for (const g of goiY) {
    if (!g.den) continue;
    theoDich.set(g.den, [...(theoDich.get(g.den) ?? []), g.tu]);
  }
  const jsonDeDan =
    theoDich.size === 0
      ? ""
      : JSON.stringify(
          [...theoDich.entries()].map(([target, matchAny]) => ({ matchAny, target })),
          null,
          2,
        );
  return { goiY, lyDoAiKhongChay: null, jsonDeDan };
}

// ── §6.5 — gợi ý boqCode per-project ─────────────────────────────────────────

/**
 * Gợi ý mã BOQ cho từng hạng mục bóc tách, đối chiếu với sổ khối lượng của dự án.
 *
 * KHÔNG ghi gì. Người duyệt sửa rồi ghi qua `ghiMapBoqTheoDuAn` — đường ghi vốn có, không mở
 * đường tắt. Cũng không đọc một cột tiền nào: `laySnapshotBoqTheoDuAn` cố ý chỉ lấy
 * code/name/unit/qty_contract.
 */
export async function goiYBoqCode(projectId: number): Promise<KetQuaGoiY> {
  const items = danhSachItemBocTach();
  const daGan = new Set((await layMapBoqTheoDuAn(projectId)).map((m) => m.takeoffItemId));
  const canHoi = items.filter((i) => !daGan.has(i.id));
  if (canHoi.length === 0) return { goiY: [], lyDoAiKhongChay: null };
  if (!aiKhaDung()) return { goiY: [], lyDoAiKhongChay: lyDoAiTat() };

  const { dong: danhMuc, daCatBot } = await danhMucBoqTheoDuAn(projectId);
  const maHopLe = new Set<string>(danhMuc.map((b) => b.code.toUpperCase()));
  if (maHopLe.size === 0) {
    return {
      goiY: [],
      lyDoAiKhongChay: "Dự án chưa có dòng BOQ nào để đối chiếu — nhập sổ khối lượng trước.",
    };
  }

  const kq = await hoiCoCauTruc({
    nhan: "goi-y-boq-code",
    chiDanOnDinh: [
      "Bạn giúp ánh xạ hạng mục bóc tách khối lượng từ bản vẽ sang mã BOQ trong sổ khối lượng hợp đồng",
      "của một dự án cơ điện (MEPF) Việt Nam.",
      "",
      "QUY TẮC:",
      "1. Đích (den) phải là một MÃ BOQ có trong danh sách gửi kèm; không có mã phù hợp thì trả null.",
      "2. Đơn vị phải hợp nhau: hạng mục đo mét không thể khớp dòng BOQ tính theo bộ/cái.",
      "3. Đây là dữ liệu dẫn tới thanh toán — thà bỏ trống để người gán tay còn hơn gán sai.",
      "4. lyDo viết bằng TIẾNG VIỆT, một câu, nói rõ căn cứ.",
    ].join("\n"),
    noiDungBienThien: [
      "HẠNG MỤC BÓC TÁCH cần gán mã:",
      ...canHoi.map((i) => `- ${i.id} · ${i.name} · nhóm ${i.group} · đơn vị ${i.unit}`),
      "",
      "DANH SÁCH MÃ BOQ CỦA DỰ ÁN:",
      ...danhMuc.map((b) => `- ${b.code} · ${b.name} · đơn vị ${b.unit}`),
    ].join("\n"),
    schema: SCHEMA,
  });

  if (!kq) return { goiY: [], lyDoAiKhongChay: "Gọi AI không thành công — chưa có gợi ý nào." };
  // Không được im lặng cắt bớt: sổ dài hơn trần thì phải nói ra, nếu không người dùng tưởng đã
  // đối chiếu hết cả sổ (M108 "no silent caps").
  const canhBaoCat = daCatBot
    ? `Sổ BOQ của dự án dài hơn ${TRAN_DANH_MUC_BOQ} dòng — chỉ đối chiếu ${TRAN_DANH_MUC_BOQ} dòng đầu theo mã.`
    : null;
  // Ngoài việc mã phải có thật, còn phải nằm trong trần độ dài mà đường ghi chấp nhận.
  return {
    goiY: locTheoDanhSach(kq.goiY, maHopLe).map((g) =>
      g.den && g.den.length > MAX_DAI_MA_BOQ
        ? {
            ...g,
            den: null,
            doTinCay: 0,
            lyDo: `${g.lyDo} (mã dài quá ${MAX_DAI_MA_BOQ} ký tự nên đã bỏ)`,
          }
        : g,
    ),
    lyDoAiKhongChay: canhBaoCat,
  };
}
