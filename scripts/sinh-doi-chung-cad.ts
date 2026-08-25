// M99 PR7 — sinh lại KẾT QUẢ MONG ĐỢI của corpus đối chứng 2 tầng (AC6).
//
// Tầng 3 (server TS) là nguồn chuẩn: chạy chính `normalizeCadLayers` / `convertTcvn3ToUnicode` /
// `convertVniToUnicode` trên corpus rồi ghi ra `plugin-autocad/doi-chung/ket-qua-mong-doi.json`.
// Test hai tầng đều đối chiếu với tệp này, nên đổi quy tắc = tệp đổi theo và HIỆN RÕ TRONG DIFF.
//
//   npm run cad:doi-chung            # ghi đè tệp kết quả
//   npm run cad:doi-chung -- --kiem  # chỉ kiểm, lệch thì thoát mã 1 (dùng được trong CI)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeCadLayers,
  convertTcvn3ToUnicode,
  convertVniToUnicode,
} from "@/lib/ky-thuat/cad/dxf-parser";
import { CURRENT_RULE_PACK_VERSION } from "@/lib/ky-thuat/cad/rule-pack";

const THU_MUC = join(process.cwd(), "plugin-autocad", "doi-chung");
const TEP_CORPUS = join(THU_MUC, "corpus.json");
const TEP_KET_QUA = join(THU_MUC, "ket-qua-mong-doi.json");

type Corpus = { rulePackVersion: string; layers: string[]; tcvn3: string[]; vni: string[] };

export function sinhKetQua(corpus: Corpus) {
  if (corpus.rulePackVersion !== CURRENT_RULE_PACK_VERSION) {
    throw new Error(
      `Corpus khai rule pack ${corpus.rulePackVersion} nhưng bản đang phát hành là ` +
        `${CURRENT_RULE_PACK_VERSION} — cập nhật corpus trước khi sinh kết quả.`,
    );
  }
  const anhXa = normalizeCadLayers(corpus.layers);
  return {
    moTa:
      "SINH TỰ ĐỘNG bởi scripts/sinh-doi-chung-cad.ts — đừng sửa tay. " +
      "Chạy `npm run cad:doi-chung` sau khi đổi quy tắc chuẩn hóa hoặc corpus.",
    rulePackVersion: corpus.rulePackVersion,
    layers: Object.fromEntries(corpus.layers.map((l) => [l, anhXa[l] ?? l])),
    tcvn3: Object.fromEntries(corpus.tcvn3.map((t) => [t, convertTcvn3ToUnicode(t)])),
    vni: Object.fromEntries(corpus.vni.map((t) => [t, convertVniToUnicode(t)])),
  };
}

export function docCorpus(): Corpus {
  return JSON.parse(readFileSync(TEP_CORPUS, "utf8")) as Corpus;
}

function main() {
  const ketQua = sinhKetQua(docCorpus());
  const noiDung = `${JSON.stringify(ketQua, null, 2)}\n`;

  if (process.argv.includes("--kiem")) {
    const hienTai = readFileSync(TEP_KET_QUA, "utf8");
    if (hienTai !== noiDung) {
      console.error(
        "[LỖI] ket-qua-mong-doi.json lệch quy tắc hiện tại — chạy `npm run cad:doi-chung` rồi commit.",
      );
      process.exit(1);
    }
    console.log("[OK] Kết quả đối chứng khớp quy tắc tầng 3 hiện tại.");
    return;
  }

  writeFileSync(TEP_KET_QUA, noiDung, "utf8");
  console.log(
    `[OK] Đã ghi ${TEP_KET_QUA} — ${Object.keys(ketQua.layers).length} layer, ` +
      `${Object.keys(ketQua.tcvn3).length} chuỗi TCVN3, ${Object.keys(ketQua.vni).length} chuỗi VNI.`,
  );
}

main();
