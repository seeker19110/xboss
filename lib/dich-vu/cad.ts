// lib/dich-vu/cad.ts — Tầng dịch vụ CAD (ADR-0008): phối `ky-thuat/cad` với `nen/ai` và `khoi-luong`
/**
 * Gộp `cad-block-phan-loai` + `cad-block-nap-lo` + `cad-boq-snapshot` + `cad-goi-y-anh-xa` —
 * đều là logic cần TỪ HAI MIỀN trở lên nên không thuộc về `lib/ky-thuat/cad`:
 *
 *   • Cỗ máy phân loại block 4 tầng (luật → ngữ nghĩa → hình học → người duyệt).
 *   • Điểm vào duy nhất của việc nạp một lô block (nối phân loại với lớp ghi hàng chờ).
 *   • Ảnh chụp KL BOQ hợp đồng theo hạng mục bóc tách (chỉ đọc).
 *   • Gợi ý ánh xạ `layerMap` và mã BOQ per-project bằng cỗ máy ngữ nghĩa.
 *
 * Không tệp nào ở đây biết gì về HTTP — route chỉ gọi hàm rồi bọc `NextResponse`.
 */

import { z } from "zod";
import { aiKhaDung, hoiCoCauTruc, lyDoAiTat } from "@/lib/nen/ai";
import {
  LOAI_BLOCK,
  type BlockManifestEntry,
  type LoaiBlock,
  docManifest,
  layBlockLibHienHanh,
  phanLoaiTheoLuat,
  type KetQuaPhanLoai,
  type UngVienBlock,
  locUngVien,
  nhanLoBlock,
  TRAN_BLOCK_MOI_LO,
  type NhanLoKetQua,
  type UngVienLo,
} from "@/lib/ky-thuat/cad/block";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";
import { query, withProjectScope } from "@/lib/db";
import {
  layMapBoqTheoDuAn,
  danhSachItemBocTach,
  MAX_DAI_MA_BOQ,
} from "@/lib/ky-thuat/cad/dashboard";
import { tapLayerDaChuan } from "@/lib/ky-thuat/cad/dxf-parser";
import { danhMucBoqTheoDuAn, TRAN_DANH_MUC_BOQ } from "@/lib/khoi-luong/boq";

// ===== cad-block-phan-loai.ts =====
// M108 PR2: cỗ máy phân loại block 4 TẦNG.
//
// Ở tầng 5 (`lib/dich-vu/`) vì phối từ 2 miền trở lên (ADR-0008): `ky-thuat` (rule pack, thư viện
// block, ảnh xem trước) + `nen/ai` (cửa ra mô hình). Tầng 1 thuần vẫn nằm bên `ky-thuat` — nó chỉ
// đọc rule pack nên không có việc gì ở đây.
//
// BỐN TẦNG, dừng ngay khi đủ chắc (M108 FR2):
//   1. LUẬT tất định — khối `block-phan-loai-luat` trong `lib/ky-thuat/cad/block.ts`. Không
//      mạng. Phủ phần lớn, miễn phí.
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

// ===== cad-block-nap-lo.ts =====
// M108 PR2: điểm vào DUY NHẤT của việc nạp một lô block.
//
// Ở tầng 5 vì nối cỗ máy phân loại (khối `cad-block-phan-loai` phía trên, có chạm `nen/ai`) với
// lớp ghi hàng chờ ở miền `ky-thuat` (khối `block-lo` trong `lib/ky-thuat/cad/block.ts`). Route
// HTTP chỉ gọi hàm này rồi bọc `NextResponse` — không
// tự ghép hai mảnh, để hai đường nạp (plugin/web) không bao giờ lệch nhau.

export type NapLoKetQua = NhanLoKetQua & { lyDoAiKhongChay?: string | null };

/**
 * Nạp lô: lọc ứng viên → phân loại 4 tầng → ghi hàng chờ.
 *
 * Phân loại chạy TRƯỚC transaction (gọi mạng, có thể lâu) — trong transaction chỉ còn việc ghi.
 * Đổi lại, phần lọc trùng tên với thư viện vẫn nằm trong transaction của `nhanLoBlock` (phải đọc
 * dưới khoá mới đúng), nên vài dòng có thể bị bỏ qua SAU khi đã tốn công phân loại. Chấp nhận:
 * giữ transaction ngắn quan trọng hơn tiết kiệm một ít token.
 */
export async function napLoBlock(input: {
  userId: number;
  nguon: "plugin" | "web";
  ungViens: readonly UngVienLo[];
  candidateStorageKey?: string;
  candidateDwgSha256?: string;
}): Promise<NapLoKetQua> {
  // Chỉ phân loại phần chắc chắn sẽ vào lô — block ẩn danh/layout/trùng trong tệp thì bỏ ngay,
  // không tốn token.
  const { giuLai } = locUngVien(input.ungViens);
  // Chặn vượt trần TRƯỚC khi phân loại: gọi mô hình cho 600 block rồi mới từ chối lô là đốt tiền
  // vô ích. `nhanLoBlock` vẫn kiểm lại — nó là hàng rào thật, đây chỉ là lối ra sớm cho rẻ.
  if (giuLai.length > TRAN_BLOCK_MOI_LO) {
    return {
      status: "invalid",
      errors: [
        `Tệp có ${giuLai.length} block nạp được (trong ${input.ungViens.length} định nghĩa), vượt trần ` +
          `${TRAN_BLOCK_MOI_LO} block một lô — tách tệp rồi nạp lại.`,
      ],
    };
  }

  // Block đã có trong thư viện là "mẫu đối chiếu cách đặt tên của chính dự án này" — tín hiệu tốt
  // nhất cho tầng 2. Thư viện chưa có thì cỗ máy vẫn chạy, chỉ kém chính xác hơn.
  const hienHanhRow = await layBlockLibHienHanh();
  const blocksDaCo = hienHanhRow ? (docManifest(hienHanhRow.manifest).manifest?.blocks ?? []) : [];

  const { ketQua, aiDaChay, lyDoKhongChay } = await phanLoaiLo(giuLai, blocksDaCo);

  const theoTen = new Map<string, KetQuaPhanLoai>();
  giuLai.forEach((u, i) => theoTen.set(u.blockName.toUpperCase(), ketQua[i]));

  const kq = await nhanLoBlock({ ...input, phanLoai: theoTen, aiDaChay });
  return { ...kq, lyDoAiKhongChay: lyDoKhongChay };
}

// ===== cad-boq-snapshot.ts =====
// Ảnh chụp KL BOQ hợp đồng theo hạng mục bóc tách của plugin
// AutoCAD (M101 §6.3 dòng cuối, PR4). Tầng dịch vụ (ADR-0008) vì phối hợp HAI miền: map mã BOQ
// theo dự án (`ky-thuat/cad`) và sổ khối lượng hợp đồng (`khoi-luong` — bảng `boq_items`).
//
// CHỈ ĐỌC. Không có hàm ghi nào trong tệp này và route dùng nó chỉ export GET: đường ghi sổ khối
// lượng duy nhất vẫn là upload có kiểm định (M101 §6.4 — "nếu sau này muốn ghi thật, mở đặc tả
// riêng có duyệt 2 bước như nghiệm thu").
//
// TIỀN: đặc tả M101 §7 FR5 chốt PR này KHÔNG đụng cột tiền — truy vấn dưới chỉ lấy KHỐI LƯỢNG
// (`qty_contract`), tuyệt đối không SELECT `unit_price`/`sub_unit_price`, nên không phát sinh
// phép tính tiền nào trên float JS (quy ước M45, `lib/nen/money.ts`).

export type DongDoiChieuBoq = {
  /** Id hạng mục trong rule pack (`takeoff.items[].id`). */
  takeoffItemId: string;
  /** Mã BOQ đã gán cho hạng mục này ở dự án đang xét. */
  boqCode: string;
  /** Tên/đơn vị lấy từ dòng BOQ trên hệ thống; null = chưa có dòng BOQ nào mang mã đó. */
  ten: string | null;
  donVi: string | null;
  /** KL hợp đồng của dòng BOQ; null = chưa khớp được dòng nào (KHÔNG suy ra 0 — hai việc khác nhau). */
  qtyContract: number | null;
};

export type SnapshotBoq = {
  projectId: number;
  rulePackVersion: string;
  /** Thời điểm chụp (ISO) — Excel `Doi-chieu` in ra để QS biết số liệu này của lúc nào. */
  chupLuc: string;
  dong: DongDoiChieuBoq[];
};

type DongThoBoq = {
  code: string;
  name: string;
  unit: string;
  qtyContract: number | null;
};

/**
 * KL BOQ hợp đồng theo từng hạng mục bóc tách ĐÃ ĐƯỢC GÁN MÃ ở dự án này.
 *
 * Hạng mục chưa gán mã không có gì để đối chiếu nên không xuất hiện — sheet `Doi-chieu` chỉ so
 * những cặp đã được QS/PM chốt là "cùng một công tác".
 *
 * Khớp mã KHÔNG phân biệt hoa/thường (`lower()`) để bám đúng ràng buộc duy nhất của
 * `boq_items` (`uniq_boq_items_code_lower`) — nếu khớp phân biệt hoa/thường thì mã nhập lệch một
 * chữ hoa sẽ im lặng thành "không có dòng BOQ", đúng lớp lỗi "sai mà trông như thiếu dữ liệu".
 * Ràng buộc đó cũng bảo đảm mỗi mã tối đa một dòng nên không cần gộp SUM.
 */
export async function laySnapshotBoqTheoDuAn(projectId: number): Promise<SnapshotBoq> {
  const map = await layMapBoqTheoDuAn(projectId);
  const chupLuc = new Date().toISOString();
  const rulePackVersion = getCurrentRulePack().version;
  if (map.length === 0) return { projectId, rulePackVersion, chupLuc, dong: [] };

  const maCanTim = [...new Set(map.map((m) => m.boqCode.toLowerCase()))];
  const placeholders = maCanTim.map(() => "?").join(",");
  // Lọc `project_id = ?` ở tầng app (RLS chỉ là phòng tuyến thứ hai — `boq_items` chưa nằm trong
  // nhóm bảng bật RLS của 0069/0092): mã BOQ duy nhất TOÀN HỆ THỐNG nên thiếu điều kiện này là
  // đọc được KL hợp đồng của dự án khác chỉ bằng cách gán mã của họ vào map dự án mình.
  const rows = await withProjectScope(projectId, () =>
    query<DongThoBoq>(
      `SELECT code, name, unit, qty_contract AS "qtyContract"
         FROM boq_items
        WHERE project_id = ? AND lower(code) IN (${placeholders})`,
      projectId,
      ...maCanTim,
    ),
  );
  const theoMa = new Map(rows.map((r) => [r.code.toLowerCase(), r]));

  return {
    projectId,
    rulePackVersion,
    chupLuc,
    dong: map.map((m) => {
      const bi = theoMa.get(m.boqCode.toLowerCase());
      return {
        takeoffItemId: m.takeoffItemId,
        boqCode: m.boqCode,
        ten: bi?.name ?? null,
        donVi: bi?.unit ?? null,
        qtyContract: bi ? Number(bi.qtyContract ?? 0) : null,
      };
    }),
  };
}

// ===== cad-goi-y-anh-xa.ts =====
// M108 PR5: hai chỗ GỢI Ý ánh xạ dùng chung cỗ máy ngữ nghĩa của
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
