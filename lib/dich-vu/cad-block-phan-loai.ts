// lib/dich-vu/cad-block-phan-loai.ts — M108 PR2: cỗ máy phân loại block 4 TẦNG.
//
// Ở tầng 5 (`lib/dich-vu/`) vì phối từ 2 miền trở lên (ADR-0008): `ky-thuat` (rule pack, thư viện
// block, ảnh xem trước) + `nen/ai` (cửa ra mô hình). Tầng 1 thuần vẫn nằm bên `ky-thuat` — nó chỉ
// đọc rule pack nên không có việc gì ở đây.
//
// BỐN TẦNG, dừng ngay khi đủ chắc (M108 FR2):
//   1. LUẬT tất định — `block-phan-loai-luat.ts`. Không mạng. Phủ phần lớn, miễn phí.
//   2. NGỮ NGHĨA — một lượt gọi mô hình cho CẢ LÔ: đối chiếu tên block với danh mục thật (block
//      đã có trong thư viện + hạng mục bóc tách của rule pack).
//   3. HÌNH HỌC — với những dòng vẫn chưa quyết mà có ảnh xem trước: gửi chính hình học lên.
//   4. NGƯỜI DUYỆT — không nằm trong tệp này; là bảng duyệt lô.
//
// HAI RÀNG BUỘC KHÔNG ĐƯỢC PHÁ:
//   • Tầng 2/3 **chỉ chạy trên phần tầng 1 chưa quyết được**. AI không bao giờ lật kết quả của
//     luật tất định (M108 §2 guardrail) — vừa rẻ hơn, vừa loại hẳn một lớp lỗi.
//   • `kind` do mô hình trả về được kiểm lại với `LOAI_BLOCK`; giá trị lạ ⇒ dòng đó thành "chưa
//     quyết" kèm lý do, KHÔNG sửa thành giá trị gần đúng (FR6/AC5).
import { z } from "zod";
import { aiKhaDung, hoiCoCauTruc, lyDoAiTat } from "@/lib/nen/ai";
import { LOAI_BLOCK, type BlockManifestEntry, type LoaiBlock } from "@/lib/ky-thuat/cad/block-lib";
import {
  phanLoaiTheoLuat,
  type KetQuaPhanLoai,
  type UngVienBlock,
} from "@/lib/ky-thuat/cad/block-phan-loai-luat";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

/**
 * Ngưỡng để một dòng do máy đề xuất được **chọn sẵn** trong bảng duyệt (M108 §18 O2).
 * Dưới ngưỡng vẫn hiện đầy đủ kèm lý do, chỉ là không tự tick — người duyệt phải chủ động chọn.
 */
export const NGUONG_CHON_SAN = 0.8;

/** Số ảnh hình học gửi trong một lượt gọi tầng 3 — chia mẻ để prompt không phình quá. */
const MOI_ME_HINH_HOC = 25;

/** Trần số ảnh hình học của cả lô (M108 NFR4) — vượt thì phần dư giữ nguyên "chưa quyết". */
const TRAN_ANH_MOI_LO = 200;

export type UngVienPhanLoai = UngVienBlock & {
  /** SVG xem trước dựng từ DXF (`dungPreviewSvg`) — đầu vào của tầng 3. */
  previewSvg?: string;
};

export type KetQuaLo = {
  ketQua: KetQuaPhanLoai[];
  /** AI có thực sự chạy cho lô này không — ghi vào `cad_block_batches.ai_enabled`. */
  aiDaChay: boolean;
  /** Lý do AI không chạy, để hiện thẳng trên UI (null khi AI có chạy). */
  lyDoKhongChay: string | null;
};

// ── Danh mục thật, dựng từ rule pack + thư viện hiện hành ────────────────────

/**
 * Phần chỉ dẫn **ổn định** gửi kèm mọi lượt gọi — được đánh dấu prompt cache. Chỉ đổi khi rule
 * pack hoặc thư viện đổi, nên các lô nạp liên tiếp đọc lại rất rẻ.
 *
 * Chú ý về dữ liệu gửi ra ngoài (M108 §12): chỉ có **từ vựng của rule pack** (id hạng mục, id hệ,
 * tên block đã có trong thư viện) — không có tên dự án, không có dữ liệu tài chính/nhân sự, không
 * có tệp bản vẽ.
 */
function chiDanOnDinh(blocksDaCo: readonly BlockManifestEntry[]): string {
  const pack = getCurrentRulePack();
  const hangMuc = pack.takeoff.items
    .filter((i) => i.measure === "count")
    .map((i) => `- ${i.id} · ${i.name} · hệ ${i.group} · đơn vị ${i.unit}`)
    .join("\n");
  const he = pack.layerMap.groups.map((g) => g.id).join(", ");
  const mau = blocksDaCo
    .slice(0, 200)
    .map((b) => `- ${b.blockName} → ${b.kind}${b.system ? ` · hệ ${b.system}` : ""}`)
    .join("\n");

  return [
    "Bạn giúp phân loại block AutoCAD của một dự án cơ điện (MEPF) Việt Nam để đưa vào thư viện block.",
    "",
    `LOẠI BLOCK hợp lệ (chỉ được chọn trong đây): ${LOAI_BLOCK.join(", ")}.`,
    "- fitting: phụ kiện trên tuyến (cút, tê, côn, van, miệng gió...).",
    "- equipment: thiết bị (FCU, AHU, bơm, quạt, đầu phun...).",
    "- titleblock: khung tên bản vẽ.",
    "- support: giá đỡ, ty treo.",
    "- sleeve: ống lồng, lỗ chờ xuyên tường/sàn.",
    "",
    `HỆ hợp lệ: ${he}.`,
    "",
    "HẠNG MỤC BÓC TÁCH đếm theo block (chỉ gán khi thật sự khớp):",
    hangMuc || "(rule pack chưa khai hạng mục đếm nào)",
    "",
    "BLOCK ĐÃ CÓ trong thư viện, dùng làm mẫu đối chiếu cách đặt tên của dự án này:",
    mau || "(thư viện chưa có block nào)",
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. Tên block hay viết tắt tiếng Việt không dấu: VAN/V = van, CO = cút, TE = tê, GIAM/CON = côn,",
    "   MG = miệng gió, GIADO/TY = giá đỡ, LOCHO/SLV = lỗ chờ, KHUNGTEN/TB = khung tên.",
    '2. KHÔNG ĐOÁN BỪA. Không đủ căn cứ thì trả kind = "chua_ro" — để trống là đúng, đoán sai thì hỏng',
    "   cả việc vẽ lẫn việc bóc khối lượng, mà lỗi chỉ lộ ra rất muộn.",
    "3. doTinCay là con số thật từ 0 đến 1 phản ánh mức chắc chắn của chính bạn, không phải điểm cho đẹp.",
    "4. lyDo viết bằng TIẾNG VIỆT, một câu ngắn, nói rõ căn cứ (dựa vào chữ nào trong tên, hình gì).",
    "5. takeoffItemId chỉ được lấy từ danh sách hạng mục ở trên; không chắc thì để null.",
  ].join("\n");
}

const SCHEMA_DONG = z.object({
  blockName: z.string(),
  // KHÔNG dùng z.enum ở đây: enum sai sẽ làm hỏng CẢ LÔ. Nhận chuỗi rồi tự kiểm từng dòng để một
  // giá trị lạ chỉ làm hỏng đúng dòng đó (AC5).
  kind: z.string(),
  systemId: z.string().nullable(),
  takeoffItemId: z.string().nullable(),
  doTinCay: z.number(),
  lyDo: z.string(),
});
const SCHEMA_TRA_VE = z.object({ ketQua: z.array(SCHEMA_DONG) });
export type DongTraVe = z.infer<typeof SCHEMA_DONG>;

/**
 * Ép một dòng mô hình trả về thành `KetQuaPhanLoai` — đây là hàng rào duy nhất giữa đầu ra của mô
 * hình và cơ sở dữ liệu, nên mọi giá trị đều được kiểm lại ở đây.
 */
export function epDongTraVe(dong: DongTraVe, nguon: "ngu_nghia" | "hinh_anh"): KetQuaPhanLoai {
  const pack = getCurrentRulePack();
  const chuaRo = (lyDo: string): KetQuaPhanLoai => ({
    kind: null,
    systemId: null,
    takeoffItemId: null,
    paperSize: null,
    nguon: "chua_quyet",
    doTinCay: null,
    lyDo,
  });

  if (dong.kind === "chua_ro") {
    return chuaRo(dong.lyDo || "Mô hình không đủ căn cứ để phân loại.");
  }
  if (!(LOAI_BLOCK as readonly string[]).includes(dong.kind)) {
    // Mô hình trả loại ngoài danh sách ⇒ coi như chưa quyết. Không "sửa cho gần đúng".
    return chuaRo(
      `Mô hình trả loại "${dong.kind}" không nằm trong danh sách hợp lệ — cần người khai.`,
    );
  }
  // Hệ và hạng mục cũng phải có thật trong rule pack, không nhận giá trị bịa.
  const heHopLe = pack.layerMap.groups.some((g) => g.id === dong.systemId);
  const itemHopLe = pack.takeoff.items.some((i) => i.id === dong.takeoffItemId);
  const doTinCay = Math.min(1, Math.max(0, dong.doTinCay));

  return {
    kind: dong.kind as LoaiBlock,
    systemId: heHopLe ? dong.systemId : null,
    takeoffItemId: itemHopLe ? dong.takeoffItemId : null,
    // Khổ giấy không bao giờ để mô hình quyết — người khai (cùng lý do với tầng 1).
    paperSize: null,
    nguon,
    doTinCay,
    lyDo: dong.lyDo,
  };
}

// ── Cỗ máy ───────────────────────────────────────────────────────────────────

/**
 * Phân loại cả lô. Trả về mảng cùng thứ tự đầu vào.
 *
 * Thiếu khoá AI / bị tắt / mô hình lỗi → kết quả vẫn là tầng 1 đầy đủ, không ném lỗi (FR9/NFR3).
 */
export async function phanLoaiLo(
  ungViens: readonly UngVienPhanLoai[],
  blocksDaCo: readonly BlockManifestEntry[] = [],
): Promise<KetQuaLo> {
  const ketQua = ungViens.map((u) => phanLoaiTheoLuat(u));

  if (!aiKhaDung()) {
    return { ketQua, aiDaChay: false, lyDoKhongChay: lyDoAiTat() };
  }
  // Chỉ đụng tới phần tầng 1 chưa quyết được.
  let conLai = ketQua.map((k, i) => (k.kind === null ? i : -1)).filter((i) => i >= 0);
  if (conLai.length === 0) {
    return {
      ketQua,
      aiDaChay: false,
      lyDoKhongChay: "Luật tất định đã phân loại đủ, không cần gọi AI.",
    };
  }

  const chiDan = chiDanOnDinh(blocksDaCo);
  let daGoi = false;

  // ── Tầng 2: ngữ nghĩa trên tên + layer + thuộc tính. MỘT lượt gọi cho cả lô.
  const moTa = conLai
    .map((i) => {
      const u = ungViens[i];
      const the = (u.attributes ?? []).join(", ");
      return [
        `- tên: ${u.blockName}`,
        u.layer ? `  layer: ${u.layer}` : null,
        the ? `  thuộc tính: ${the}` : null,
        ketQua[i].systemId ? `  hệ suy được từ layer: ${ketQua[i].systemId}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const tang2 = await hoiCoCauTruc({
    nhan: "phan-loai-block-ngu-nghia",
    chiDanOnDinh: chiDan,
    noiDungBienThien: `Phân loại ${conLai.length} block sau. Trả đúng một dòng kết quả cho mỗi block, giữ nguyên tên:\n\n${moTa}`,
    schema: SCHEMA_TRA_VE,
  });
  if (tang2) {
    daGoi = true;
    ghepKetQuaMoHinh(ungViens, ketQua, conLai, tang2.ketQua, "ngu_nghia");
    conLai = conLai.filter((i) => ketQua[i].kind === null);
  }

  // ── Tầng 3: hình học, chỉ cho dòng còn treo VÀ có ảnh xem trước.
  const coHinh = conLai.filter((i) => (ungViens[i].previewSvg ?? "").length > 0);
  const dungTran = coHinh.slice(0, TRAN_ANH_MOI_LO);
  for (let d = 0; d < dungTran.length; d += MOI_ME_HINH_HOC) {
    const me = dungTran.slice(d, d + MOI_ME_HINH_HOC);
    const noiDung = me
      .map((i) => `### ${ungViens[i].blockName}\n${ungViens[i].previewSvg}`)
      .join("\n\n");
    const tang3 = await hoiCoCauTruc({
      nhan: "phan-loai-block-hinh-hoc",
      chiDanOnDinh: chiDan,
      noiDungBienThien:
        "Những block sau KHÔNG đoán được từ tên. Dưới đây là HÌNH HỌC của từng block dưới dạng SVG " +
        "(nét vẽ thật lấy từ bản vẽ). Nhìn hình để phân loại — hình dạng nói lên nó là van, cút, " +
        "miệng gió, thiết bị hay khung tên rõ hơn cái tên vô nghĩa.\n\n" +
        noiDung,
      schema: SCHEMA_TRA_VE,
    });
    if (!tang3) continue;
    daGoi = true;
    ghepKetQuaMoHinh(ungViens, ketQua, me, tang3.ketQua, "hinh_anh");
  }

  return {
    ketQua,
    aiDaChay: daGoi,
    lyDoKhongChay: daGoi ? null : "Gọi AI không thành công — giữ kết quả của luật tất định.",
  };
}

/**
 * Ghép kết quả mô hình vào đúng dòng, khớp theo TÊN BLOCK chứ không theo thứ tự — mô hình có thể
 * đổi thứ tự, bỏ sót hoặc thêm dòng thừa, và cả ba trường hợp đó đều không được làm lệch dữ liệu.
 *
 * Thuần và **xuất ra** vì đây là hàng rào chống lệch dữ liệu quan trọng nhất của cả cỗ máy — phải
 * test được trực tiếp, không qua một lượt gọi mạng.
 */
export function ghepKetQuaMoHinh(
  ungViens: readonly UngVienPhanLoai[],
  ketQua: KetQuaPhanLoai[],
  chiSo: readonly number[],
  traVe: readonly DongTraVe[],
  nguon: "ngu_nghia" | "hinh_anh",
): void {
  const theoTen = new Map<string, DongTraVe>();
  for (const d of traVe) theoTen.set((d.blockName ?? "").trim().toUpperCase(), d);

  for (const i of chiSo) {
    const d = theoTen.get(ungViens[i].blockName.toUpperCase());
    if (!d) continue; // mô hình bỏ sót dòng này → giữ nguyên "chưa quyết"
    const ep = epDongTraVe(d, nguon);
    if (ep.kind === null) continue; // không quyết được thì giữ lý do của tầng 1, đỡ nhiễu
    // Hệ suy được từ layer ở tầng 1 vẫn quý — giữ lại nếu mô hình không đưa ra hệ nào.
    ketQua[i] = { ...ep, systemId: ep.systemId ?? ketQua[i].systemId };
  }
}
