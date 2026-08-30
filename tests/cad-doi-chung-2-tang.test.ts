// M99 PR7 — AC6 phần chạy được không cần AutoCAD: đối chứng QUY TẮC giữa 2 tầng.
//
// Corpus `plugin-autocad/doi-chung/corpus.json` là dữ liệu VÀO duy nhất; kết quả kỳ vọng nằm ở
// `ket-qua-mong-doi.json` (sinh bằng `npm run cad:doi-chung`). Test này canh tầng 3 (TS); test
// `DoiChungHaiTangTests.cs` canh tầng 2 (plugin C#) trên đúng hai tệp đó. Lệch = trôi quy tắc.
//
// Phạm vi: ánh xạ layer + giải mã font — phần AC6 về hình học (toạ độ, số thực thể theo loại)
// cần AutoCAD thật nên nằm ở kiểm tích hợp accoreconsole (PR7b, runner có license).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeCadLayers,
  convertTcvn3ToUnicode,
  convertVniToUnicode,
} from "@/lib/ky-thuat/cad/dxf-parser";
import { CURRENT_RULE_PACK_VERSION } from "@/lib/ky-thuat/cad/rule-pack";

const THU_MUC = join(process.cwd(), "plugin-autocad", "doi-chung");
const corpus = JSON.parse(readFileSync(join(THU_MUC, "corpus.json"), "utf8")) as {
  rulePackVersion: string;
  layers: string[];
  tcvn3: string[];
  vni: string[];
};
const mongDoi = JSON.parse(readFileSync(join(THU_MUC, "ket-qua-mong-doi.json"), "utf8")) as {
  rulePackVersion: string;
  layers: Record<string, string>;
  tcvn3: Record<string, string>;
  vni: Record<string, string>;
};

test("AC6: corpus và kết quả kỳ vọng bám đúng rule pack đang phát hành", () => {
  assert.equal(corpus.rulePackVersion, CURRENT_RULE_PACK_VERSION);
  assert.equal(mongDoi.rulePackVersion, CURRENT_RULE_PACK_VERSION);
  assert.ok(corpus.layers.length >= 20, "Corpus layer quá mỏng — không phủ hết nhóm hệ");
  assert.deepEqual(
    Object.keys(mongDoi.layers).sort(),
    [...corpus.layers].sort(),
    "Kết quả kỳ vọng lệch corpus — chạy `npm run cad:doi-chung` rồi commit",
  );
});

test("AC6: tầng 3 ánh xạ layer đúng kết quả kỳ vọng của corpus", () => {
  const anhXa = normalizeCadLayers(corpus.layers);
  for (const ten of corpus.layers) {
    assert.equal(
      anhXa[ten] ?? ten,
      mongDoi.layers[ten],
      `Layer "${ten}" lệch kết quả đối chứng — quy tắc tầng 3 đã đổi mà chưa sinh lại corpus`,
    );
  }
});

test("AC6: tầng 3 giải mã TCVN3/VNI đúng kết quả kỳ vọng của corpus", () => {
  for (const s of corpus.tcvn3) {
    assert.equal(convertTcvn3ToUnicode(s), mongDoi.tcvn3[s], `TCVN3 "${s}" lệch đối chứng`);
  }
  for (const s of corpus.vni) {
    assert.equal(convertVniToUnicode(s), mongDoi.vni[s], `VNI "${s}" lệch đối chứng`);
  }
});

test("AC6: cùng nội dung viết bằng TCVN3 và VNI ra cùng một chuỗi Unicode", () => {
  // Hai bảng mã khác nhau, cùng câu gốc → cùng kết quả; lệch nghĩa là một bảng trích thiếu.
  const tuTcvn3 = corpus.tcvn3.map((s) => mongDoi.tcvn3[s]);
  const tuVni = corpus.vni.map((s) => mongDoi.vni[s]);
  assert.deepEqual(tuVni, tuTcvn3);
});
