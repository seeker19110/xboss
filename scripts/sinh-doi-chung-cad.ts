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
import { pathToFileURL } from "node:url";
import {
  normalizeCadLayers,
  convertTcvn3ToUnicode,
  convertVniToUnicode,
} from "@/lib/ky-thuat/cad/dxf-parser";
import { CURRENT_RULE_PACK_VERSION } from "@/lib/ky-thuat/cad/rule-pack";
import { planMultiTierCorridor } from "@/lib/ky-thuat/engineering-cad-corridor";

const THU_MUC = join(process.cwd(), "plugin-autocad", "doi-chung");
const TEP_CORPUS = join(THU_MUC, "corpus.json");
const TEP_KET_QUA = join(THU_MUC, "ket-qua-mong-doi.json");
const TEP_ROUTING = join(THU_MUC, "routing-doi-chung.json");

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

// ===== M114 §10 — cấp tầng/làn: sinh `mongDoi` từ tầng 3 (planMultiTierCorridor) =====

export type BoRouting = {
  rulePackVersion: string;
  tierAnhXaTs: Record<string, string>;
  heDien: string[];
  disciplineTheoHe: Record<string, "hvac" | "electrical" | "plumbing" | "firefighting">;
  cases: {
    ma: string;
    moTa: string;
    vao: {
      hanhLang: { id: string; beRongMm: number; cotDayDamMm: number; cotTranMm: number };
      he: { heId: string; beRongMm: number; caoThietDienMm: number }[];
    };
    mongDoi: { heId: string; tierId: string; lanTuMm: number; lanDenMm: number; caoDoMm: number }[];
  }[];
};

/** Kết quả cấp tầng/làn mong đợi của một ca — chạy chính `planMultiTierCorridor` (nguồn chuẩn). */
export function sinhMongDoiRouting(bo: BoRouting, ca: BoRouting["cases"][number]) {
  const { hanhLang, he } = ca.vao;
  const ketQua = planMultiTierCorridor({
    corridorCode: ca.ma,
    title: ca.moTa,
    corridorWidthMm: hanhLang.beRongMm,
    beamBottomElevationMm: hanhLang.cotDayDamMm,
    ceilingElevationMm: hanhLang.cotTranMm,
    systems: he.map((h) => ({
      systemCode: h.heId,
      discipline: bo.disciplineTheoHe[h.heId],
      widthMm: h.beRongMm,
      heightOrDiaMm: h.caoThietDienMm,
      weightKgPerM: 0,
    })),
  });

  return ketQua.assignedSystems.map((a) => {
    const tierId = bo.tierAnhXaTs[a.tier];
    if (!tierId) throw new Error(`Thiếu ánh xạ tierAnhXaTs cho tier "${a.tier}".`);
    return {
      heId: a.systemCode,
      tierId,
      lanTuMm: a.lateralPositionMm,
      lanDenMm: a.lateralPositionMm + a.widthMm,
      caoDoMm: a.allocatedElevationMm,
    };
  });
}

export function sinhRouting(bo: BoRouting): BoRouting {
  if (bo.rulePackVersion !== CURRENT_RULE_PACK_VERSION) {
    throw new Error(
      `routing-doi-chung.json khai rule pack ${bo.rulePackVersion} nhưng bản đang phát hành là ` +
        `${CURRENT_RULE_PACK_VERSION} — cập nhật bộ đối chứng trước khi sinh kết quả.`,
    );
  }
  return { ...bo, cases: bo.cases.map((ca) => ({ ...ca, mongDoi: sinhMongDoiRouting(bo, ca) })) };
}

export function docRouting(): BoRouting {
  return JSON.parse(readFileSync(TEP_ROUTING, "utf8")) as BoRouting;
}

function main() {
  const ketQua = sinhKetQua(docCorpus());
  const noiDung = `${JSON.stringify(ketQua, null, 2)}\n`;
  const routing = sinhRouting(docRouting());
  const noiDungRouting = `${JSON.stringify(routing, null, 2)}\n`;

  if (process.argv.includes("--kiem")) {
    let lech = false;
    if (readFileSync(TEP_KET_QUA, "utf8") !== noiDung) {
      console.error(
        "[LỖI] ket-qua-mong-doi.json lệch quy tắc hiện tại — chạy `npm run cad:doi-chung` rồi commit.",
      );
      lech = true;
    }
    if (readFileSync(TEP_ROUTING, "utf8") !== noiDungRouting) {
      console.error(
        "[LỖI] routing-doi-chung.json lệch cách cấp tầng/làn hiện tại — " +
          "chạy `npm run cad:doi-chung` rồi commit.",
      );
      lech = true;
    }
    if (lech) process.exit(1);
    console.log("[OK] Kết quả đối chứng khớp quy tắc tầng 3 hiện tại.");
    return;
  }

  writeFileSync(TEP_KET_QUA, noiDung, "utf8");
  writeFileSync(TEP_ROUTING, noiDungRouting, "utf8");
  console.log(
    `[OK] Đã ghi ${TEP_KET_QUA} — ${Object.keys(ketQua.layers).length} layer, ` +
      `${Object.keys(ketQua.tcvn3).length} chuỗi TCVN3, ${Object.keys(ketQua.vni).length} chuỗi VNI.`,
  );
  console.log(`[OK] Đã ghi ${TEP_ROUTING} — ${routing.cases.length} ca cấp tầng/làn.`);
}

// Chỉ chạy khi gọi thẳng bằng `npm run cad:doi-chung` — test import hàm sinh từ tệp này để không
// chép lại cách dựng đầu vào cho `planMultiTierCorridor` ở hai chỗ.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
